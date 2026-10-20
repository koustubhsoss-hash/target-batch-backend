const prisma = require('../config/prisma');
const { sendSuccess, sendError } = require('../utils/apiResponse');

// 1. GET /api/v1/settings/meta (Fetch Courses, Semesters and Subjects)
const getMetadata = async (req, res, next) => {
  try {
    const courses = await prisma.course.findMany({ orderBy: { name: 'asc' } });
    const subjects = await prisma.subject.findMany({ orderBy: { name: 'asc' } });

    const availableSemesters = [
      'Semester 1',
      'Semester 2',
      'Semester 3',
      'Semester 4',
      'Semester 5',
      'Semester 6',
    ];

    return sendSuccess(res, 'Academic metadata fetched', {
      courses: courses.map((c) => c.name),
      subjects: subjects.map((s) => s.name),
      semesters: availableSemesters,
      courseDetails: courses,
      subjectDetails: subjects,
    });
  } catch (error) {
    next(error);
  }
};

// 2. POST /api/v1/settings/courses (Admin adds Course)
const addCourse = async (req, res, next) => {
  try {
    const { name, duration, semesters } = req.body;
    if (!name) return sendError(res, 'Course name is required', 400);

    const course = await prisma.course.create({
      data: {
        name,
        duration: Number(duration || 3),
        semesters: Number(semesters || 6),
      },
    });

    return sendSuccess(res, 'Course added', { course }, 201);
  } catch (error) {
    next(error);
  }
};

// 3. POST /api/v1/settings/subjects (Admin adds Subject)
const addSubject = async (req, res, next) => {
  try {
    const { name } = req.body;
    if (!name) return sendError(res, 'Subject name is required', 400);

    const subject = await prisma.subject.create({
      data: { name },
    });

    return sendSuccess(res, 'Subject added', { subject }, 201);
  } catch (error) {
    next(error);
  }
};

// 4. DELETE /api/v1/settings/subjects/:id (Admin deletes Subject)
const deleteSubject = async (req, res, next) => {
  try {
    const { id } = req.params;
    await prisma.subject.delete({ where: { id } });
    return sendSuccess(res, 'Subject deleted');
  } catch (error) {
    next(error);
  }
};

module.exports = {
  getMetadata,
  addCourse,
  addSubject,
  deleteSubject,
};
