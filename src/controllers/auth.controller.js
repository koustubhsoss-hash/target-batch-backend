const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');
const prisma = require('../config/prisma');
const { sendSuccess, sendError } = require('../utils/apiResponse');

// 1. POST /api/v1/auth/signup (Student Self-Registration)
const signup = async (req, res, next) => {
  try {
    const { name, rollNo, course, semester, email, parentPhone, password } = req.body;

    if (!name || !rollNo || !course || !semester || !email || !password) {
      return sendError(res, 'Please provide all required fields', 400);
    }

    // Check duplicate email
    const existingUser = await prisma.user.findUnique({ where: { email } });
    if (existingUser) {
      return sendError(res, 'An account with this email address already exists', 400);
    }

    // Check duplicate rollNo
    const existingRoll = await prisma.studentProfile.findUnique({ where: { rollNo } });
    if (existingRoll) {
      return sendError(res, 'This Roll Number is already registered', 400);
    }

    const hashedPassword = await bcrypt.hash(password, 10);
    const avatarUrl = `https://ui-avatars.com/api/?name=${encodeURIComponent(name)}&background=random`;

    // Atomic transaction for User + StudentProfile
    const newUser = await prisma.$transaction(async (tx) => {
      const user = await tx.user.create({
        data: {
          email,
          password: hashedPassword,
          role: 'STUDENT',
          avatar: avatarUrl,
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
          loginPassword: password,
        },
      });

      return { ...user, studentProfile: profile };
    });

    return sendSuccess(
      res,
      'Student account registered successfully. Please login with your email and password.',
      {
        user: {
          id: newUser.id,
          name: newUser.studentProfile.name,
          email: newUser.email,
          role: newUser.role,
          rollNo: newUser.studentProfile.rollNo,
          course: newUser.studentProfile.course,
          semester: newUser.studentProfile.semester,
          avatar: newUser.avatar,
        },
      },
      201
    );
  } catch (error) {
    next(error);
  }
};

const getUserDisplayName = (user) => {
  if (user.role === 'STUDENT' && user.studentProfile?.name) {
    return user.studentProfile.name;
  }
  if (!user.email) return 'User';

  if (user.email.toLowerCase().includes('koustubh')) {
    return 'Koustubh';
  }
  if (user.email.toLowerCase() === 'admin@targetbatch.com') {
    return 'Admin';
  }
  const username = user.email.split('@')[0];
  const clean = username
    .replace(/[0-9]/g, '')
    .split(/[._-]/)
    .filter(Boolean)
    .map((p) => p.charAt(0).toUpperCase() + p.slice(1).toLowerCase())
    .join(' ');
  return clean || (user.role === 'ADMIN' ? 'Teacher' : 'Student');
};

const getUserAvatar = (user, displayName) => {
  if (user.avatar && !user.avatar.includes('photo-1494790108377-be9c29b29330')) {
    return user.avatar;
  }
  return `https://ui-avatars.com/api/?name=${encodeURIComponent(displayName)}&background=0284c7&color=fff&bold=true`;
};

// 2. POST /api/v1/auth/login (Admin & Student Login)
const login = async (req, res, next) => {
  try {
    const { email, password } = req.body;

    if (!email || !password) {
      return sendError(res, 'Email and password are required', 400);
    }

    const user = await prisma.user.findUnique({
      where: { email },
      include: { studentProfile: true },
    });

    if (!user) {
      return sendError(res, 'Invalid credentials', 401);
    }

    const isMatch = await bcrypt.compare(password, user.password);
    if (!isMatch) {
      return sendError(res, 'Invalid credentials', 401);
    }

    const token = jwt.sign(
      {
        id: user.id,
        role: user.role,
        course: user.studentProfile?.course || null,
        semester: user.studentProfile?.semester || null,
      },
      process.env.JWT_SECRET,
      { expiresIn: process.env.JWT_EXPIRES_IN || '7d' }
    );

    const displayName = getUserDisplayName(user);
    const avatar = getUserAvatar(user, displayName);

    return sendSuccess(res, 'Login successful', {
      token,
      user: {
        id: user.id,
        name: displayName,
        email: user.email,
        role: user.role,
        course: user.studentProfile?.course || null,
        semester: user.studentProfile?.semester || null,
        rollNo: user.studentProfile?.rollNo || null,
        avatar,
      },
    });
  } catch (error) {
    next(error);
  }
};

// 3. GET /api/v1/auth/me (Get Current Logged-in User Profile)
const getMe = async (req, res, next) => {
  try {
    const user = req.user;
    const displayName = getUserDisplayName(user);
    const avatar = getUserAvatar(user, displayName);

    return sendSuccess(res, 'User session fetched', {
      user: {
        id: user.id,
        name: displayName,
        email: user.email,
        role: user.role,
        course: user.studentProfile?.course || null,
        semester: user.studentProfile?.semester || null,
        rollNo: user.studentProfile?.rollNo || null,
        parentPhone: user.studentProfile?.parentPhone || null,
        attendance: user.studentProfile?.attendance || 90.0,
        status: user.studentProfile?.status || 'Good',
        avatar,
      },
    });
  } catch (error) {
    next(error);
  }
};

// 4. PUT /api/v1/auth/profile (Update Profile)
const updateProfile = async (req, res, next) => {
  try {
    const { name, parentPhone, avatar } = req.body;
    const userId = req.user.id;

    if (avatar) {
      await prisma.user.update({
        where: { id: userId },
        data: { avatar },
      });
    }

    if (req.user.role === 'STUDENT' && (name || parentPhone)) {
      await prisma.studentProfile.update({
        where: { userId },
        data: {
          ...(name && { name }),
          ...(parentPhone && { parentPhone }),
        },
      });
    }

    return sendSuccess(res, 'Profile updated successfully');
  } catch (error) {
    next(error);
  }
};

// 5. PATCH /api/v1/auth/change-password
const changePassword = async (req, res, next) => {
  try {
    const { currentPassword, newPassword } = req.body;

    if (!currentPassword || !newPassword) {
      return sendError(res, 'Both current and new passwords are required', 400);
    }

    const isMatch = await bcrypt.compare(currentPassword, req.user.password);
    if (!isMatch) {
      return sendError(res, 'Current password does not match', 400);
    }

    const newHashedPassword = await bcrypt.hash(newPassword, 10);
    await prisma.user.update({
      where: { id: req.user.id },
      data: { password: newHashedPassword },
    });

    if (req.user.role === 'STUDENT') {
      await prisma.studentProfile.update({
        where: { userId: req.user.id },
        data: { loginPassword: newPassword },
      });
    }

    return sendSuccess(res, 'Password changed successfully');
  } catch (error) {
    next(error);
  }
};

module.exports = {
  signup,
  login,
  getMe,
  updateProfile,
  changePassword,
};
