const prisma = require('../config/prisma');
const { cloudinary, isCloudinaryConfigured } = require('../config/cloudinary');
const { sendSuccess, sendError } = require('../utils/apiResponse');

// Helper to upload buffer to Cloudinary
const uploadToCloudinary = (fileBuffer, folder = 'target_batch_notes') => {
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


// 1. GET /api/v1/notes (Strict Course & Semester Filtering for Student)
const getNotes = async (req, res, next) => {
  try {
    const user = req.user;
    let whereClause = {};

    if (user.role === 'STUDENT') {
      // 🔒 HARD ISOLATION: Student gets ONLY their course & semester
      whereClause = {
        course: user.studentProfile.course,
        semester: user.studentProfile.semester,
      };
    } else if (user.role === 'ADMIN') {
      // 🔓 ADMIN: Can view all or filter via query params
      const { course, semester, subject, search } = req.query;
      if (course && course !== 'All') whereClause.course = course;
      if (semester && semester !== 'All') whereClause.semester = semester;
      if (subject && subject !== 'All') whereClause.subject = subject;
      if (search) {
        whereClause.OR = [
          { title: { contains: search } },
          { subject: { contains: search } },
        ];
      }
    }

    const notes = await prisma.note.findMany({
      where: whereClause,
      orderBy: { createdAt: 'desc' },
    });

    return sendSuccess(res, 'Notes fetched successfully', {
      count: notes.length,
      notes,
    });
  } catch (error) {
    next(error);
  }
};

// 2. GET /api/v1/notes/:id (Single Note)
const getNoteById = async (req, res, next) => {
  try {
    const { id } = req.params;
    const note = await prisma.note.findUnique({ where: { id } });

    if (!note) {
      return sendError(res, 'Note not found', 404);
    }

    // Security check: if student, confirm note belongs to student's course & semester
    if (
      req.user.role === 'STUDENT' &&
      (note.course !== req.user.studentProfile.course ||
        note.semester !== req.user.studentProfile.semester)
    ) {
      return sendError(res, 'Access denied: Note is not intended for your enrolled course/semester', 403);
    }

    return sendSuccess(res, 'Note fetched', { note });
  } catch (error) {
    next(error);
  }
};

// 3. POST /api/v1/notes (Admin Uploads PDF note)
const createNote = async (req, res, next) => {
  try {
    const { title, subject, course, semester, description } = req.body;

    if (!title || !subject || !course || !semester) {
      return sendError(res, 'Title, subject, course, and semester are required', 400);
    }

    let fileUrl = 'https://www.w3.org/WAI/ER/tests/xhtml/testfiles/resources/pdf/dummy.pdf';
    let fileSize = '1.2 MB';

    // If file provided via multer
    if (req.file) {
      const uploadResult = await uploadToCloudinary(req.file.buffer, 'target_batch_notes');
      fileUrl = uploadResult.secure_url;
      fileSize = `${(req.file.size / (1024 * 1024)).toFixed(1)} MB`;
    }

    const newNote = await prisma.note.create({
      data: {
        title,
        subject,
        course,
        semester,
        description: description || '',
        fileUrl,
        fileSize,
        createdById: req.user.id,
      },
    });

    return sendSuccess(res, 'Note uploaded successfully', { note: newNote }, 201);
  } catch (error) {
    next(error);
  }
};

// 4. PUT /api/v1/notes/:id (Admin Full Update)
const updateNote = async (req, res, next) => {
  try {
    const { id } = req.params;
    const { title, subject, course, semester, description } = req.body;

    const existing = await prisma.note.findUnique({ where: { id } });
    if (!existing) {
      return sendError(res, 'Note not found', 404);
    }

    const updatedNote = await prisma.note.update({
      where: { id },
      data: {
        title,
        subject,
        course,
        semester,
        description,
      },
    });

    return sendSuccess(res, 'Note updated successfully', { note: updatedNote });
  } catch (error) {
    next(error);
  }
};

// 5. PATCH /api/v1/notes/:id (Admin Partial Update)
const patchNote = async (req, res, next) => {
  try {
    const { id } = req.params;
    const updateData = req.body;

    const existing = await prisma.note.findUnique({ where: { id } });
    if (!existing) {
      return sendError(res, 'Note not found', 404);
    }

    const updatedNote = await prisma.note.update({
      where: { id },
      data: updateData,
    });

    return sendSuccess(res, 'Note patched successfully', { note: updatedNote });
  } catch (error) {
    next(error);
  }
};

// 6. DELETE /api/v1/notes/:id (Admin Delete)
const deleteNote = async (req, res, next) => {
  try {
    const { id } = req.params;
    const existing = await prisma.note.findUnique({ where: { id } });
    if (!existing) {
      return sendError(res, 'Note not found', 404);
    }

    await prisma.note.delete({ where: { id } });
    return sendSuccess(res, 'Note deleted successfully');
  } catch (error) {
    next(error);
  }
};

module.exports = {
  getNotes,
  getNoteById,
  createNote,
  updateNote,
  patchNote,
  deleteNote,
};
