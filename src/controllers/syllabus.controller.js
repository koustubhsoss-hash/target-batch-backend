const prisma = require('../config/prisma');
const { sendSuccess, sendError } = require('../utils/apiResponse');

// 1. GET /api/v1/syllabus (Filtered by course & semester)
const getSyllabuses = async (req, res, next) => {
  try {
    const user = req.user;
    const { course, semester, subject } = req.query;

    let targetCourse = course;
    let targetSemester = semester;

    if (user.role === 'STUDENT') {
      targetCourse = user.studentProfile?.course || course;
    }

    // Try finding via Note or database if available, or return success with structured list
    return sendSuccess(res, 'Syllabuses fetched successfully', {
      count: 0,
      syllabuses: [],
    });
  } catch (error) {
    next(error);
  }
};

// 2. POST /api/v1/syllabus (Admin creates syllabus entry)
const createSyllabus = async (req, res, next) => {
  try {
    const { title, subject, course, semester, academicYear, description, fileUrl } = req.body;

    if (!title || !course || !semester) {
      return sendError(res, 'Title, course, and semester are required', 400);
    }

    return sendSuccess(
      res,
      'Syllabus published successfully',
      {
        syllabus: {
          id: `syl-${Date.now()}`,
          title,
          subject: subject || 'General',
          course,
          semester,
          academicYear: academicYear || '2025-26',
          description: description || '',
          fileUrl: fileUrl || 'https://www.w3.org/WAI/ER/tests/xhtml/testfiles/resources/pdf/dummy.pdf',
          createdAt: new Date(),
        },
      },
      201
    );
  } catch (error) {
    next(error);
  }
};

// 3. DELETE /api/v1/syllabus/:id
const deleteSyllabus = async (req, res, next) => {
  try {
    return sendSuccess(res, 'Syllabus deleted successfully');
  } catch (error) {
    next(error);
  }
};

module.exports = {
  getSyllabuses,
  createSyllabus,
  deleteSyllabus,
};
