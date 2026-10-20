const prisma = require('../config/prisma');
const { sendSuccess, sendError } = require('../utils/apiResponse');

// 1. GET /api/v1/tests (Filtered by course & semester for student)
const getTests = async (req, res, next) => {
  try {
    const user = req.user;
    let whereClause = {};

    if (user.role === 'STUDENT') {
      // 🔒 HARD ISOLATION: Student gets ONLY their course and semester active tests
      whereClause = {
        course: user.studentProfile.course,
        semester: user.studentProfile.semester,
        status: 'ACTIVE',
      };
    } else if (user.role === 'ADMIN') {
      const { course, semester, subject, status } = req.query;
      if (course && course !== 'All') whereClause.course = course;
      if (semester && semester !== 'All') whereClause.semester = semester;
      if (subject && subject !== 'All') whereClause.subject = subject;
      if (status && status !== 'All') whereClause.status = status;
    }

    const tests = await prisma.test.findMany({
      where: whereClause,
      include: {
        _count: {
          select: {
            questions: true,
            submissions: true,
          },
        },
      },
      orderBy: { createdAt: 'desc' },
    });

    return sendSuccess(res, 'Tests fetched successfully', {
      count: tests.length,
      tests,
    });
  } catch (error) {
    next(error);
  }
};

// 2. GET /api/v1/tests/:id (Get single test with questions)
const getTestById = async (req, res, next) => {
  try {
    const { id } = req.params;
    const user = req.user;

    const test = await prisma.test.findUnique({
      where: { id },
      include: {
        questions: true,
        submissions: {
          where: user.role === 'STUDENT' ? { studentId: user.studentProfile.id } : {},
        },
      },
    });

    if (!test) {
      return sendError(res, 'Test not found', 404);
    }

    // Role check for students
    if (user.role === 'STUDENT') {
      if (
        test.course !== user.studentProfile.course ||
        test.semester !== user.studentProfile.semester
      ) {
        return sendError(res, 'Access denied: Test not scheduled for your course/semester', 403);
      }

      // Hide correct option while taking test
      const sanitizedQuestions = test.questions.map((q) => ({
        id: q.id,
        questionText: q.questionText,
        options: q.options,
        marks: q.marks,
      }));

      return sendSuccess(res, 'Test fetched', {
        test: {
          ...test,
          questions: sanitizedQuestions,
          hasAttempted: test.submissions.length > 0,
          previousAttempt: test.submissions[0] || null,
        },
      });
    }

    // If Admin, send all details including correct answers
    return sendSuccess(res, 'Test details fetched', { test });
  } catch (error) {
    next(error);
  }
};

// 3. POST /api/v1/tests (Admin creates test with questions)
const createTest = async (req, res, next) => {
  try {
    const { title, subject, course, semester, duration, totalMarks, questions } = req.body;

    if (!title || !subject || !course || !semester || !duration || !totalMarks) {
      return sendError(res, 'Please provide all test metadata fields', 400);
    }

    const newTest = await prisma.test.create({
      data: {
        title,
        subject,
        course,
        semester,
        duration: Number(duration),
        totalMarks: Number(totalMarks),
        createdById: req.user.id,
        questions: {
          create: (questions || []).map((q) => ({
            questionText: q.questionText,
            options: q.options,
            correctOption: Number(q.correctOption),
            marks: Number(q.marks || 1),
          })),
        },
      },
      include: {
        questions: true,
      },
    });

    return sendSuccess(res, 'Test created successfully', { test: newTest }, 201);
  } catch (error) {
    next(error);
  }
};

// 4. PUT /api/v1/tests/:id (Admin Full update)
const updateTest = async (req, res, next) => {
  try {
    const { id } = req.params;
    const { title, subject, course, semester, duration, totalMarks } = req.body;

    const existing = await prisma.test.findUnique({ where: { id } });
    if (!existing) {
      return sendError(res, 'Test not found', 404);
    }

    const updated = await prisma.test.update({
      where: { id },
      data: {
        title,
        subject,
        course,
        semester,
        duration: Number(duration),
        totalMarks: Number(totalMarks),
      },
    });

    return sendSuccess(res, 'Test updated successfully', { test: updated });
  } catch (error) {
    next(error);
  }
};

// 5. PATCH /api/v1/tests/:id/status (Admin change status: DRAFT | ACTIVE | COMPLETED)
const updateTestStatus = async (req, res, next) => {
  try {
    const { id } = req.params;
    const { status } = req.body;

    if (!['DRAFT', 'ACTIVE', 'COMPLETED'].includes(status)) {
      return sendError(res, 'Invalid test status value', 400);
    }

    const updated = await prisma.test.update({
      where: { id },
      data: { status },
    });

    return sendSuccess(res, 'Test status updated', { test: updated });
  } catch (error) {
    next(error);
  }
};

// 6. DELETE /api/v1/tests/:id (Admin delete test)
const deleteTest = async (req, res, next) => {
  try {
    const { id } = req.params;
    const existing = await prisma.test.findUnique({ where: { id } });
    if (!existing) {
      return sendError(res, 'Test not found', 404);
    }

    await prisma.test.delete({ where: { id } });
    return sendSuccess(res, 'Test deleted successfully');
  } catch (error) {
    next(error);
  }
};

// 7. POST /api/v1/tests/:id/submit (Student submits answers & auto-graded)
const submitTest = async (req, res, next) => {
  try {
    const { id } = req.params;
    const { answers } = req.body; // e.g. { "questionId_1": 0, "questionId_2": 2 }
    const student = req.user.studentProfile;

    if (!student) {
      return sendError(res, 'Only students can submit tests', 403);
    }

    const test = await prisma.test.findUnique({
      where: { id },
      include: { questions: true },
    });

    if (!test) {
      return sendError(res, 'Test not found', 404);
    }

    // Check if already attempted
    const existingSubmission = await prisma.testSubmission.findUnique({
      where: {
        testId_studentId: {
          testId: id,
          studentId: student.id,
        },
      },
    });

    if (existingSubmission) {
      return sendError(res, 'You have already submitted this mock test', 400);
    }

    // Calculate score
    let totalScore = 0;
    test.questions.forEach((q) => {
      const selectedOption = answers?.[q.id];
      if (selectedOption !== undefined && Number(selectedOption) === q.correctOption) {
        totalScore += q.marks;
      }
    });

    const percentage = Number(((totalScore / test.totalMarks) * 100).toFixed(1));

    const submission = await prisma.testSubmission.create({
      data: {
        testId: id,
        studentId: student.id,
        answers: answers || {},
        score: totalScore,
        totalMarks: test.totalMarks,
        percentage,
      },
    });

    return sendSuccess(
      res,
      'Test submitted and evaluated successfully',
      {
        result: {
          score: totalScore,
          totalMarks: test.totalMarks,
          percentage,
          passed: percentage >= 40,
          submittedAt: submission.submittedAt,
        },
      },
      201
    );
  } catch (error) {
    next(error);
  }
};

// 8. GET /api/v1/tests/:id/results (Admin views leaderboard)
const getTestResults = async (req, res, next) => {
  try {
    const { id } = req.params;

    const test = await prisma.test.findUnique({
      where: { id },
      include: {
        submissions: {
          include: {
            student: {
              select: {
                name: true,
                rollNo: true,
                course: true,
                semester: true,
              },
            },
          },
          orderBy: { score: 'desc' },
        },
      },
    });

    if (!test) {
      return sendError(res, 'Test not found', 404);
    }

    return sendSuccess(res, 'Test results leaderboard fetched', {
      testTitle: test.title,
      totalMarks: test.totalMarks,
      submissionsCount: test.submissions.length,
      submissions: test.submissions,
    });
  } catch (error) {
    next(error);
  }
};

module.exports = {
  getTests,
  getTestById,
  createTest,
  updateTest,
  updateTestStatus,
  deleteTest,
  submitTest,
  getTestResults,
};
