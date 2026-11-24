const prisma = require('../config/prisma');
const { sendSuccess, sendError } = require('../utils/apiResponse');
const { matchesTarget, storeUploadedFile } = require('../utils/fileUpload');

// 1. GET /api/v1/assignments (Auto-filtered for student)
const getAssignments = async (req, res, next) => {
  try {
    const user = req.user;
    let whereClause = {};

    if (user.role === 'STUDENT') {
      if (!user.studentProfile) {
        return sendSuccess(res, 'Assignments fetched successfully', { count: 0, assignments: [] });
      }
      // Course/semester matching is done below so that 'All' and multi-semester targets work
    } else if (user.role === 'ADMIN') {
      const { course, semester, subject } = req.query;
      if (course && course !== 'All') whereClause.course = course;
      if (semester && semester !== 'All') whereClause.semester = { contains: semester };
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
        } : {
          include: {
            student: {
              select: { id: true, name: true, rollNo: true, enrollNo: true, course: true, semester: true, section: true },
            },
          },
        },
      },
      orderBy: { createdAt: 'desc' },
    });

    let result = assignments;
    if (user.role === 'STUDENT') {
      const { course, semester } = user.studentProfile;
      result = assignments.filter((a) => matchesTarget(a.course, course) && matchesTarget(a.semester, semester));
    }

    return sendSuccess(res, 'Assignments fetched successfully', {
      count: result.length,
      assignments: result,
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
        title: String(title).trim(),
        subject: String(subject).trim(),
        course: String(course).trim(),
        semester: String(semester).trim(),
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

    if (!req.file) {
      return sendError(res, 'Please attach your assignment file', 400);
    }

    const assignment = await prisma.assignment.findUnique({ where: { id } });
    if (!assignment) {
      return sendError(res, 'Assignment not found', 404);
    }

    const stored = await storeUploadedFile(req.file, 'target_batch_submissions');
    const fileUrl = stored.url;
    const fileName = stored.name;

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
