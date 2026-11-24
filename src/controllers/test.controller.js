const prisma = require('../config/prisma');
const { sendSuccess, sendError } = require('../utils/apiResponse');

// 1. GET /api/v1/tests (Filtered by course & semester for student)
const getTests = async (req, res, next) => {
  try {
    const user = req.user;
    let whereClause = {};

    if (user.role === 'STUDENT') {
      // 🔒 Student gets active tests for their course
      whereClause = {
        course: user.studentProfile.course,
        status: 'ACTIVE',
      };
    } else if (user.role === 'ADMIN') {
      const { course, semester, subject, status } = req.query;
      if (course && course !== 'All') whereClause.course = course;
      if (semester && semester !== 'All') {
        whereClause.semester = { contains: semester };
      }
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
        ...(user.role === 'STUDENT'
          ? {
              submissions: {
                where: { studentId: user.studentProfile?.id },
                select: {
                  id: true,
                  score: true,
                  totalMarks: true,
                  percentage: true,
                  submittedAt: true,
                },
              },
            }
          : {}),
      },
      orderBy: { createdAt: 'desc' },
    });

    // Multi-semester matching filter for student
    let returnedTests = tests;
    if (user.role === 'STUDENT') {
      const studentSem = (user.studentProfile.semester || '').toLowerCase().trim();
      returnedTests = tests.filter((t) => {
        if (!t.semester || t.semester === 'All' || t.semester.toLowerCase().includes('all')) return true;
        const sems = t.semester.split(',').map((s) => s.toLowerCase().trim());
        return sems.includes(studentSem) || t.semester.toLowerCase().includes(studentSem);
      });
    }

    return sendSuccess(res, 'Tests fetched successfully', {
      count: returnedTests.length,
      tests: returnedTests,
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
      const studentSem = (user.studentProfile.semester || '').toLowerCase().trim();
      const testSem = (test.semester || '').toLowerCase();
      const sems = testSem.split(',').map((s) => s.trim());
      const semMatches = testSem === 'all' || testSem.includes('all') || sems.includes(studentSem) || testSem.includes(studentSem);

      if (test.course !== user.studentProfile.course || !semMatches) {
        return sendError(res, 'Access denied: Test not scheduled for your course/semester', 403);
      }

      const hasAttempted = test.submissions.length > 0;

      // Hide correct option while taking test, but reveal if student has submitted
      const sanitizedQuestions = test.questions.map((q) => ({
        id: q.id,
        questionText: q.questionText,
        options: q.options,
        marks: q.marks,
        ...(hasAttempted ? { correctOption: q.correctOption } : {}),
      }));

      return sendSuccess(res, 'Test fetched', {
        test: {
          ...test,
          questions: sanitizedQuestions,
          hasAttempted,
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
    const { title, subject, course, semester, duration, totalMarks, questions, status } = req.body;

    if (!title || !subject || !course || !semester || !duration || !totalMarks) {
      return sendError(res, 'Please provide all test metadata fields', 400);
    }

    const parsedStatus = parseTestStatus(status) || 'ACTIVE';

    const sanitizedQuestions = (questions || []).map((q) => {
      let opts = [];
      if (Array.isArray(q.options)) {
        opts = q.options.map(String).filter(Boolean);
      } else if (typeof q.options === 'string') {
        try {
          opts = JSON.parse(q.options);
        } catch {
          opts = [q.options];
        }
      }
      if (opts.length === 0) {
        opts = ['Option A', 'Option B'];
      }

      return {
        questionText: String(q.questionText || 'Question').trim(),
        options: opts,
        correctOption: !isNaN(Number(q.correctOption)) ? Math.max(0, Math.min(Number(q.correctOption), opts.length - 1)) : 0,
        marks: !isNaN(Number(q.marks)) ? Math.max(1, Number(q.marks)) : 1,
      };
    });

    const newTest = await prisma.test.create({
      data: {
        title: String(title).trim(),
        subject: String(subject).trim(),
        course: String(course).trim(),
        semester: String(semester).trim(),
        duration: Number(duration),
        totalMarks: Number(totalMarks),
        status: parsedStatus,
        createdById: req.user.id,
        questions: {
          create: sanitizedQuestions,
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

// Helper to normalize and map test status values (supports INACTIVE -> DRAFT)
const parseTestStatus = (rawStatus) => {
  if (!rawStatus) return undefined;
  const s = String(rawStatus).toUpperCase().trim();
  if (s === 'ACTIVE') return 'ACTIVE';
  if (s === 'INACTIVE' || s === 'DRAFT' || s === 'DISABLED') return 'DRAFT';
  if (s === 'COMPLETED' || s === 'CLOSED' || s === 'ARCHIVED') return 'COMPLETED';
  return undefined;
};

// 4. PUT /api/v1/tests/:id (Admin Full update including questions & status)
const updateTest = async (req, res, next) => {
  try {
    const { id } = req.params;
    const { title, subject, course, semester, duration, totalMarks, questions, status } = req.body;

    const existing = await prisma.test.findUnique({ where: { id } });
    if (!existing) {
      return sendError(res, 'Test not found', 404);
    }

    const updateData = {};
    if (title && String(title).trim()) updateData.title = String(title).trim();
    if (subject && String(subject).trim()) updateData.subject = String(subject).trim();
    if (course && String(course).trim()) updateData.course = String(course).trim();
    if (semester && String(semester).trim()) updateData.semester = String(semester).trim();

    if (duration !== undefined && !isNaN(Number(duration)) && Number(duration) > 0) {
      updateData.duration = Number(duration);
    }
    if (totalMarks !== undefined && !isNaN(Number(totalMarks)) && Number(totalMarks) > 0) {
      updateData.totalMarks = Number(totalMarks);
    }

    const parsedStatus = parseTestStatus(status);
    if (parsedStatus) {
      updateData.status = parsedStatus;
    }

    if (Array.isArray(questions) && questions.length > 0) {
      // Update questions IN PLACE (keep their ids) so that answers already submitted by
      // students — stored as { questionId: optionIndex } — still point at the right question.
      const cleaned = questions.map((q) => {
        let opts = [];
        if (Array.isArray(q.options)) {
          opts = q.options.map(String).filter(Boolean);
        } else if (typeof q.options === 'string') {
          try {
            opts = JSON.parse(q.options);
          } catch {
            opts = [q.options];
          }
        }
        if (opts.length === 0) {
          opts = ['Option A', 'Option B'];
        }
        return {
          id: q.id,
          questionText: String(q.questionText || 'Question').trim(),
          options: opts,
          correctOption: !isNaN(Number(q.correctOption)) ? Math.max(0, Math.min(Number(q.correctOption), opts.length - 1)) : 0,
          marks: !isNaN(Number(q.marks)) ? Math.max(1, Number(q.marks)) : 1,
        };
      });

      const existingQs = await prisma.question.findMany({ where: { testId: id }, select: { id: true } });
      const existingIds = new Set(existingQs.map((q) => q.id));
      const keptIds = new Set(cleaned.filter((q) => q.id && existingIds.has(q.id)).map((q) => q.id));

      await prisma.$transaction([
        prisma.question.deleteMany({ where: { testId: id, id: { notIn: [...keptIds] } } }),
        ...cleaned.map(({ id: qid, ...data }) =>
          qid && keptIds.has(qid)
            ? prisma.question.update({ where: { id: qid }, data })
            : prisma.question.create({ data: { ...data, testId: id } })
        ),
      ]);
      updateData.__regrade = true;
    }

    const shouldRegrade = Boolean(updateData.__regrade);
    delete updateData.__regrade;

    const updated = await prisma.test.update({
      where: { id },
      data: updateData,
      include: {
        questions: true,
      },
    });

    // If questions / answer key changed, recalculate marks of students who already submitted
    if (shouldRegrade) {
      const subs = await prisma.testSubmission.findMany({ where: { testId: id } });
      for (const sub of subs) {
        const answers = (typeof sub.answers === 'string' ? JSON.parse(sub.answers || '{}') : sub.answers) || {};
        const score = updated.questions.reduce(
          (sum, q) => (answers[q.id] !== undefined && Number(answers[q.id]) === q.correctOption ? sum + q.marks : sum),
          0
        );
        const percentage = updated.totalMarks ? Number(((score / updated.totalMarks) * 100).toFixed(1)) : 0;
        if (score !== sub.score || updated.totalMarks !== sub.totalMarks) {
          await prisma.testSubmission.update({
            where: { id: sub.id },
            data: { score, totalMarks: updated.totalMarks, percentage },
          });
        }
      }
    }

    return sendSuccess(res, 'Test updated successfully', { test: updated });
  } catch (error) {
    next(error);
  }
};

// 5. PATCH /api/v1/tests/:id/status (Admin change status: ACTIVE | INACTIVE / DRAFT | COMPLETED)
const updateTestStatus = async (req, res, next) => {
  try {
    const { id } = req.params;
    const { status } = req.body;

    const parsedStatus = parseTestStatus(status);
    if (!parsedStatus) {
      return sendError(res, 'Invalid test status value. Allowed: ACTIVE, INACTIVE (DRAFT), COMPLETED', 400);
    }

    const existing = await prisma.test.findUnique({ where: { id } });
    if (!existing) {
      return sendError(res, 'Test not found', 404);
    }

    const updated = await prisma.test.update({
      where: { id },
      data: { status: parsedStatus },
      include: {
        _count: {
          select: { questions: true, submissions: true },
        },
      },
    });

    return sendSuccess(res, `Test status updated to ${parsedStatus}`, { test: updated });
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
                id: true,
                name: true,
                rollNo: true,
                enrollNo: true,
                course: true,
                semester: true,
              },
            },
          },
          orderBy: [{ score: 'desc' }, { submittedAt: 'asc' }],
        },
        questions: true,
      },
    });

    if (!test) {
      return sendError(res, 'Test not found', 404);
    }

    return sendSuccess(res, 'Test results leaderboard fetched', {
      testTitle: test.title,
      subject: test.subject,
      course: test.course,
      semester: test.semester,
      totalMarks: test.totalMarks,
      questions: test.questions,
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
