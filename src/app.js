const express = require('express');
const cors = require('cors');
const helmet = require('helmet');
const rateLimit = require('express-rate-limit');
const { sendError } = require('./utils/apiResponse');

// Route imports
const authRoutes = require('./routes/auth.routes');
const studentRoutes = require('./routes/student.routes');
const noteRoutes = require('./routes/note.routes');
const testRoutes = require('./routes/test.routes');
const assignmentRoutes = require('./routes/assignment.routes');
const settingRoutes = require('./routes/setting.routes');

const app = express();

// Security Middlewares
app.use(helmet());
app.use(
  cors({
    origin: [
      'http://localhost:3000',
      'http://localhost:5173',
      process.env.CLIENT_URL || 'http://localhost:5173',
    ],
    credentials: true,
  })
);

// Body Parsers
app.use(express.json({ limit: '10mb' }));
app.use(express.urlencoded({ extended: true, limit: '10mb' }));

// Rate Limiting (100 requests per 15 minutes)
const limiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 150,
  message: {
    success: false,
    message: 'Too many requests from this IP, please try again after 15 minutes',
  },
});
app.use('/api/', limiter);

// Root Health Check
app.get('/health', (req, res) => {
  res.status(200).json({ status: 'OK', timestamp: new Date(), service: 'Target Batch API' });
});

// Mounting Feature API Routes
app.use('/api/v1/auth', authRoutes);
app.use('/api/v1/students', studentRoutes);
app.use('/api/v1/notes', noteRoutes);
app.use('/api/v1/tests', testRoutes);
app.use('/api/v1/assignments', assignmentRoutes);
app.use('/api/v1/settings', settingRoutes);

// 404 Route Handler
app.use((req, res) => {
  sendError(res, `Route not found: ${req.originalUrl}`, 404);
});

// Global Centralized Error Handler
app.use((err, req, res, next) => {
  console.error('💥 Unhandled Error:', err);
  const status = err.statusCode || 500;
  const message = err.message || 'Internal Server Error';
  sendError(res, message, status);
});

module.exports = app;
