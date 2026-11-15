const prisma = require('../config/prisma');
const { cloudinary, isCloudinaryConfigured } = require('../config/cloudinary');
const { sendSuccess, sendError } = require('../utils/apiResponse');

// Format file size helper
const formatFileSize = (bytes) => {
  if (!bytes || bytes === 0) return '0 B';
  const k = 1024;
  const sizes = ['B', 'KB', 'MB', 'GB'];
  const i = Math.floor(Math.log(bytes) / Math.log(k));
  return `${parseFloat((bytes / Math.pow(k, i)).toFixed(1))} ${sizes[i]}`;
};

// Stream buffer to Cloudinary
const uploadToCloudinary = (fileBuffer, originalName, folder = 'target_batch_student_docs') => {
  return new Promise((resolve, reject) => {
    if (!isCloudinaryConfigured) {
      return reject(new Error('Cloudinary credentials not configured in backend .env'));
    }
    const uploadStream = cloudinary.uploader.upload_stream(
      {
        folder,
        resource_type: 'auto',
        access_mode: 'public',
      },
      (error, result) => {
        if (error) return reject(error);
        resolve(result);
      }
    );
    uploadStream.end(fileBuffer);
  });
};

// 1. POST /api/v1/student-docs/upload (Student uploads their own document)
const uploadDocument = async (req, res, next) => {
  try {
    const user = req.user;
    if (!user || !user.studentProfile) {
      return sendError(res, 'Only enrolled students can upload student documents', 403);
    }

    if (!req.file) {
      return sendError(res, 'Please provide a document file (PDF or Image)', 400);
    }

    const { name, type } = req.body;
    if (!name || !name.trim()) {
      return sendError(res, 'Document name is required', 400);
    }

    const studentProfile = user.studentProfile;
    const originalFileName = req.file.originalname || 'document.pdf';
    const fileSizeStr = formatFileSize(req.file.size);

    // Upload directly to Cloudinary
    let fileUrl = '';
    try {
      const cloudResult = await uploadToCloudinary(req.file.buffer, originalFileName);
      fileUrl = cloudResult.secure_url;
    } catch (uploadErr) {
      console.error('Cloudinary upload error:', uploadErr);
      return sendError(res, `Failed to upload file to Cloudinary: ${uploadErr.message}`, 500);
    }

    // Save permanent record into TiDB Cloud MySQL database
    const newDoc = await prisma.studentDocument.create({
      data: {
        studentId: studentProfile.id,
        name: name.trim(),
        type: type || 'Marksheet',
        fileUrl,
        fileName: originalFileName,
        fileSize: fileSizeStr,
        status: 'Pending Verification',
      },
    });

    return sendSuccess(res, 'Document uploaded successfully to Cloudinary and saved to database', { document: newDoc }, 201);
  } catch (error) {
    next(error);
  }
};

// 2. GET /api/v1/student-docs/my (Get student's own documents and profile data)
const getMyDocuments = async (req, res, next) => {
  try {
    const user = req.user;
    if (!user || !user.studentProfile) {
      return sendError(res, 'Only enrolled students can access this endpoint', 403);
    }

    const studentProfile = await prisma.studentProfile.findUnique({
      where: { id: user.studentProfile.id },
      include: {
        documents: {
          orderBy: { createdAt: 'desc' },
        },
      },
    });

    return sendSuccess(res, 'Documents fetched successfully from database', {
      profile: {
        fatherName: studentProfile.fatherName || '',
        motherName: studentProfile.motherName || '',
        enrollNo: studentProfile.enrollNo || '',
      },
      documents: studentProfile.documents || [],
    });
  } catch (error) {
    next(error);
  }
};

// 3. PUT /api/v1/student-docs/profile (Student updates locker profile: father, mother name, enrollNo)
const updateStudentLockerProfile = async (req, res, next) => {
  try {
    const user = req.user;
    if (!user || !user.studentProfile) {
      return sendError(res, 'Only enrolled students can update locker profile', 403);
    }

    const { fatherName, motherName, enrollNo } = req.body;
    const updated = await prisma.studentProfile.update({
      where: { id: user.studentProfile.id },
      data: {
        ...(fatherName !== undefined && { fatherName: fatherName.trim() }),
        ...(motherName !== undefined && { motherName: motherName.trim() }),
        ...(enrollNo !== undefined && { enrollNo: enrollNo.trim().toUpperCase() }),
      },
    });

    return sendSuccess(res, 'Locker profile updated successfully', {
      fatherName: updated.fatherName,
      motherName: updated.motherName,
      enrollNo: updated.enrollNo,
    });
  } catch (error) {
    next(error);
  }
};

// 4. DELETE /api/v1/student-docs/:id (Student or Admin deletes document)
const deleteDocument = async (req, res, next) => {
  try {
    const user = req.user;
    const { id } = req.params;

    const doc = await prisma.studentDocument.findUnique({ where: { id } });
    if (!doc) {
      return sendError(res, 'Document not found', 404);
    }

    if (user.role !== 'ADMIN' && doc.studentId !== user.studentProfile?.id) {
      return sendError(res, 'Unauthorized to delete this document', 403);
    }

    await prisma.studentDocument.delete({ where: { id } });
    return sendSuccess(res, 'Document removed successfully from database');
  } catch (error) {
    next(error);
  }
};

// 5. GET /api/v1/student-docs/all (Admin gets all uploaded student documents across university)
const getAllDocumentsForAdmin = async (req, res, next) => {
  try {
    const { course, semester, status, search } = req.query;
    let whereClause = {};

    if (status && status !== 'All') {
      whereClause.status = status;
    }

    if (course && course !== 'All') {
      whereClause.student = { ...whereClause.student, course };
    }

    if (semester && semester !== 'All') {
      whereClause.student = { ...whereClause.student, semester };
    }

    if (search && search.trim()) {
      const q = search.trim();
      whereClause.OR = [
        { name: { contains: q } },
        { student: { name: { contains: q } } },
        { student: { rollNo: { contains: q } } },
        { student: { enrollNo: { contains: q } } },
      ];
    }

    const docs = await prisma.studentDocument.findMany({
      where: whereClause,
      include: {
        student: {
          select: {
            id: true,
            name: true,
            rollNo: true,
            course: true,
            semester: true,
            enrollNo: true,
            parentPhone: true,
            user: {
              select: {
                email: true,
                avatar: true,
              },
            },
          },
        },
      },
      orderBy: { createdAt: 'desc' },
    });

    const formatted = docs.map((d) => ({
      id: d.id,
      name: d.name,
      type: d.type,
      fileUrl: d.fileUrl,
      fileName: d.fileName,
      fileSize: d.fileSize,
      status: d.status,
      uploadedAt: d.createdAt.toISOString().split('T')[0],
      createdAt: d.createdAt,
      studentId: d.student.id,
      studentKey: d.student.rollNo,
      studentName: d.student.name,
      studentRollNo: d.student.rollNo,
      enrollNo: d.student.enrollNo || `AU25${(d.student.course || 'BPA').substring(0, 3)}${d.student.rollNo.slice(-3)}`,
      course: d.student.course,
      semester: d.student.semester,
      avatar: d.student.user?.avatar,
      email: d.student.user?.email,
      parentPhone: d.student.parentPhone,
    }));

    return sendSuccess(res, 'Student documents fetched successfully', {
      count: formatted.length,
      documents: formatted,
    });
  } catch (error) {
    next(error);
  }
};

// 6. PATCH /api/v1/student-docs/:id/status (Admin verifies or rejects document)
const updateDocumentStatus = async (req, res, next) => {
  try {
    const { id } = req.params;
    const { status } = req.body;

    if (!status) {
      return sendError(res, 'Status is required', 400);
    }

    const updated = await prisma.studentDocument.update({
      where: { id },
      data: { status },
    });

    return sendSuccess(res, `Document status updated to ${status}`, { document: updated });
  } catch (error) {
    next(error);
  }
};

module.exports = {
  uploadDocument,
  getMyDocuments,
  updateStudentLockerProfile,
  deleteDocument,
  getAllDocumentsForAdmin,
  updateDocumentStatus,
};

