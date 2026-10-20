const jwt = require('jsonwebtoken');
const prisma = require('../config/prisma');
const { sendError } = require('../utils/apiResponse');

const authenticate = async (req, res, next) => {
  try {
    const authHeader = req.headers.authorization;
    if (!authHeader || !authHeader.startsWith('Bearer ')) {
      return sendError(res, 'Authentication token missing or invalid format', 401);
    }

    const token = authHeader.split(' ')[1];
    const decoded = jwt.verify(token, process.env.JWT_SECRET);

    // Fetch user with StudentProfile if role is STUDENT
    const user = await prisma.user.findUnique({
      where: { id: decoded.id },
      include: {
        studentProfile: true,
      },
    });

    if (!user) {
      return sendError(res, 'User session expired or user not found', 401);
    }

    // Attach user to req
    req.user = user;
    next();
  } catch (error) {
    if (error.name === 'TokenExpiredError') {
      return sendError(res, 'Session token expired, please login again', 401);
    }
    return sendError(res, 'Unauthorized access: Invalid token', 401);
  }
};

module.exports = {
  authenticate,
};
