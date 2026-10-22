const prisma = require('../config/prisma');
const bcrypt = require('bcryptjs');
const { sendSuccess, sendError } = require('../utils/apiResponse');

// 1. GET /api/v1/students (Admin lists all students)
const getStudents = async (req, res, next) => {
  try {
    const { course, semester, search, status } = req.query;
    let whereClause = {};

    if (course && course !== 'All') whereClause.course = course;
    if (semester && semester !== 'All') whereClause.semester = semester;
    if (status && status !== 'All') whereClause.status = status;
    if (search) {
      whereClause.OR = [
        { name: { contains: search } },
        { rollNo: { contains: search } },
        { user: { email: { contains: search } } },
      ];
    }

    const students = await prisma.studentProfile.findMany({
      where: whereClause,
      include: {
        user: {
          select: {
            id: true,
            email: true,
            avatar: true,
            createdAt: true,
          },
        },
        _count: {
          select: {
            testSubmissions: true,
            assignmentSubmissions: true,
          },
        },
      },
      orderBy: { createdAt: 'desc' },
    });

    const formatted = students.map((s) => ({
      id: s.id,
      userId: s.userId,
      name: s.name,
      rollNo: s.rollNo,
      course: s.course,
      semester: s.semester,
      email: s.user.email,
      parentPhone: s.parentPhone,
      section: s.section,
      attendance: `${s.attendance}%`,
      status: s.status,
      loginPassword: s.loginPassword || 'pass123',
      avatar: s.user.avatar,
      testsCount: s._count.testSubmissions,
      assignmentsCount: s._count.assignmentSubmissions,
      createdAt: s.createdAt,
    }));

    return sendSuccess(res, 'Students fetched successfully', {
      count: formatted.length,
      students: formatted,
    });
  } catch (error) {
    next(error);
  }
};

// 2. GET /api/v1/students/:id (Admin view single student details & history)
const getStudentById = async (req, res, next) => {
  try {
    const { id } = req.params;

    const student = await prisma.studentProfile.findUnique({
      where: { id },
      include: {
        user: { select: { email: true, avatar: true, createdAt: true } },
        testSubmissions: {
          include: { test: { select: { title: true, subject: true, totalMarks: true } } },
          orderBy: { submittedAt: 'desc' },
        },
        assignmentSubmissions: {
          include: { assignment: { select: { title: true, subject: true } } },
          orderBy: { submittedAt: 'desc' },
        },
      },
    });

    if (!student) {
      return sendError(res, 'Student not found', 404);
    }

    return sendSuccess(res, 'Student profile fetched', { student });
  } catch (error) {
    next(error);
  }
};

// 3. POST /api/v1/students (Admin manually creates student)
const createStudent = async (req, res, next) => {
  try {
    const { name, rollNo, course, semester, email, parentPhone, password, section } = req.body;

    if (!name || !rollNo || !course || !semester || !email) {
      return sendError(res, 'Name, rollNo, course, semester, and email are required', 400);
    }

    const existingUser = await prisma.user.findUnique({ where: { email } });
    if (existingUser) {
      return sendError(res, 'Email already in use', 400);
    }

    const existingRoll = await prisma.studentProfile.findUnique({ where: { rollNo } });
    if (existingRoll) {
      return sendError(res, 'Roll Number already registered', 400);
    }

    const hashedPassword = await bcrypt.hash(password || 'pass123', 10);
    const avatar = `https://ui-avatars.com/api/?name=${encodeURIComponent(name)}&background=random`;

    const result = await prisma.$transaction(async (tx) => {
      const user = await tx.user.create({
        data: {
          email,
          password: hashedPassword,
          role: 'STUDENT',
          avatar,
        },
      });

      const profile = await tx.studentProfile.create({
        data: {
          userId: user.id,
          name,
          rollNo,
          course,
          semester,
          parentPhone: parentPhone || '',
          section: section || 'A',
          loginPassword: password || 'pass123',
        },
      });

      return { ...profile, email: user.email, avatar: user.avatar, loginPassword: password || 'pass123' };
    });

    return sendSuccess(res, 'Student added successfully', { student: result }, 201);
  } catch (error) {
    next(error);
  }
};

// 4. PUT /api/v1/students/:id (Admin Full update)
const updateStudent = async (req, res, next) => {
  try {
    const { id } = req.params;
    const { name, rollNo, course, semester, parentPhone, section, attendance } = req.body;

    const student = await prisma.studentProfile.findUnique({ where: { id } });
    if (!student) {
      return sendError(res, 'Student not found', 404);
    }

    const updated = await prisma.studentProfile.update({
      where: { id },
      data: {
        name,
        rollNo,
        course,
        semester,
        parentPhone,
        section,
        ...(attendance !== undefined && { attendance: Number(attendance) }),
      },
    });

    return sendSuccess(res, 'Student updated successfully', { student: updated });
  } catch (error) {
    next(error);
  }
};

// 5. PATCH /api/v1/students/:id/status (Admin change status)
const updateStudentStatus = async (req, res, next) => {
  try {
    const { id } = req.params;
    const { status } = req.body;

    if (!status) {
      return sendError(res, 'Status is required', 400);
    }

    const updated = await prisma.studentProfile.update({
      where: { id },
      data: { status },
    });

    return sendSuccess(res, 'Student status updated', { student: updated });
  } catch (error) {
    next(error);
  }
};

// 6. DELETE /api/v1/students/:id (Admin delete student)
const deleteStudent = async (req, res, next) => {
  try {
    const { id } = req.params;

    const student = await prisma.studentProfile.findUnique({ where: { id } });
    if (!student) {
      return sendError(res, 'Student not found', 404);
    }

    // Cascade delete user
    await prisma.user.delete({ where: { id: student.userId } });

    return sendSuccess(res, 'Student deleted successfully');
  } catch (error) {
    next(error);
  }
};

// 7. PATCH /api/v1/students/:id/reset-password (Admin sets/resets student password)
const resetStudentPassword = async (req, res, next) => {
  try {
    const { id } = req.params;
    const { newPassword } = req.body;

    if (!newPassword || newPassword.length < 4) {
      return sendError(res, 'New password must be at least 4 characters long', 400);
    }

    const student = await prisma.studentProfile.findUnique({ where: { id } });
    if (!student) {
      return sendError(res, 'Student not found', 404);
    }

    const hashedPassword = await bcrypt.hash(newPassword, 10);

    await prisma.$transaction([
      prisma.user.update({
        where: { id: student.userId },
        data: { password: hashedPassword },
      }),
      prisma.studentProfile.update({
        where: { id },
        data: { loginPassword: newPassword },
      }),
    ]);

    return sendSuccess(res, `Password updated successfully to: ${newPassword}`, {
      studentId: id,
      loginPassword: newPassword,
    });
  } catch (error) {
    next(error);
  }
};

module.exports = {
  getStudents,
  getStudentById,
  createStudent,
  updateStudent,
  updateStudentStatus,
  deleteStudent,
  resetStudentPassword,
};
