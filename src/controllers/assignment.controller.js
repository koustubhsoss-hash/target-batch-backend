const prisma = require('../config/prisma');
const { cloudinary, isCloudinaryConfigured } = require('../config/cloudinary');
const { sendSuccess, sendError } = require('../utils/apiResponse');

// Helper to stream upload student assignment
const uploadToCloudinary = (fileBuffer, folder = 'target_batch_assignments') => {
  return new Promise((resolve, reject) => {
    if (!isCloudinaryConfigured) {
      return reject(
        new Error(
          'Cloudinary is not configured. Please set CLOUDINARY_CLOUD_NAME, CLOUDINARY_API_KEY, and CLOUDINARY_API_SECRET in your backend environment variables (e.g. Render Dashboard).'
        )
      );
    }
    const uploadStream = cloudinary.uploader.upload_stream(
      {
        folder,
        resource_type: 'auto',
      },
      (error, result) => {
        if (error) return reject(error);
        resolve(result);
      }
    );
    uploadStream.end(fileBuffer);
  });
};


// 1. GET /api/v1/assignments (Auto-filtered for student)
const getAssignments = async (req, res, next) => {
  try {
    const user = req.user;
    let whereClause = {};

    if (user.role === 'STUDENT') {
      whereClause = {
        course: user.studentProfile.course,
        semester: user.studentProfile.semester,
      };
    } else if (user.role === 'ADMIN') {
      const { course, semester, subject } = req.query;
      if (course && course !== 'All') whereClause.course = course;
      if (semester && semester !== 'All') whereClause.semester = semester;
      if (subject && subject !== 'All') whereClause.subject = subject;
    }

    const assignments = await prisma.assignment.findMany({
      where: whereClause,
      include: {
        _count: {
          select: { submissions: true },
        },
        submissions: user.role === 'STUDENT' ? {
          where: { studentId: user.studentProfile.id },
        } : false,
      },
      orderBy: { createdAt: 'desc' },
    });

    return sendSuccess(res, 'Assignments fetched successfully', {
      count: assignments.length,
      assignments,
    });
  } catch (error) {
    next(error);
  }
};

// 2. POST /api/v1/assignments (Admin creates assignment)
const createAssignment = async (req, res, next) => {
  try {
    const { title, subject, course, semester, dueDate, description } = req.body;

    if (!title || !subject || !course || !semester || !dueDate) {
      return sendError(res, 'Title, subject, course, semester, and dueDate are required', 400);
    }

    const newAssignment = await prisma.assignment.create({
      data: {
        title,
        subject,
        course,
        semester,
        dueDate: new Date(dueDate),
        description: description || '',
        createdById: req.user.id,
      },
    });

    return sendSuccess(res, 'Assignment created successfully', { assignment: newAssignment }, 201);
  } catch (error) {
    next(error);
  }
};

// 3. PUT /api/v1/assignments/:id (Admin Full update)
const updateAssignment = async (req, res, next) => {
  try {
    const { id } = req.params;
    const { title, subject, course, semester, dueDate, description } = req.body;

    const updated = await prisma.assignment.update({
      where: { id },
      data: {
        title,
        subject,
        course,
        semester,
        dueDate: dueDate ? new Date(dueDate) : undefined,
        description,
      },
    });

    return sendSuccess(res, 'Assignment updated successfully', { assignment: updated });
  } catch (error) {
    next(error);
  }
};

// 4. DELETE /api/v1/assignments/:id (Admin delete)
const deleteAssignment = async (req, res, next) => {
  try {
    const { id } = req.params;
    await prisma.assignment.delete({ where: { id } });
    return sendSuccess(res, 'Assignment deleted successfully');
  } catch (error) {
    next(error);
  }
};

// 5. POST /api/v1/assignments/:id/submit (Student uploads assignment file)
const submitAssignment = async (req, res, next) => {
  try {
    const { id } = req.params;
    const student = req.user.studentProfile;

    if (!student) {
      return sendError(res, 'Only students can submit assignments', 403);
    }

    let fileUrl = 'https://www.w3.org/WAI/ER/tests/xhtml/testfiles/resources/pdf/dummy.pdf';
    let fileName = 'assignment_submission.pdf';

    if (req.file) {
      const uploadResult = await uploadToCloudinary(req.file.buffer, 'target_batch_submissions');
      fileUrl = uploadResult.secure_url;
      fileName = req.file.originalname;
    }

    const submission = await prisma.assignmentSubmission.upsert({
      where: {
        assignmentId_studentId: {
          assignmentId: id,
          studentId: student.id,
        },
      },
      update: {
        fileUrl,
        fileName,
        submittedAt: new Date(),
      },
      create: {
        assignmentId: id,
        studentId: student.id,
        fileUrl,
        fileName,
      },
    });

    return sendSuccess(res, 'Assignment submitted successfully', { submission }, 201);
  } catch (error) {
    next(error);
  }
};

// 6. PATCH /api/v1/assignments/:id/grade (Admin grades submission)
const gradeSubmission = async (req, res, next) => {
  try {
    const { id } = req.params; // assignmentId
    const { studentId, grade, remarks } = req.body;

    if (!studentId || !grade) {
      return sendError(res, 'Student ID and grade are required', 400);
    }

    const submission = await prisma.assignmentSubmission.update({
      where: {
        assignmentId_studentId: {
          assignmentId: id,
          studentId,
        },
      },
      data: {
        grade,
        remarks: remarks || '',
        status: 'GRADED',
        gradedAt: new Date(),
      },
    });

    return sendSuccess(res, 'Submission graded successfully', { submission });
  } catch (error) {
    next(error);
  }
};

module.exports = {
  getAssignments,
  createAssignment,
  updateAssignment,
  deleteAssignment,
  submitAssignment,
  gradeSubmission,
};
