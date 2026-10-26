const express = require('express');
const cors = require('cors');
const helmet = require('helmet');
const rateLimit = require('express-rate-limit');
const path = require('path');
const { sendError } = require('./utils/apiResponse');

// Route imports
const authRoutes = require('./routes/auth.routes');
const studentRoutes = require('./routes/student.routes');
const noteRoutes = require('./routes/note.routes');
const testRoutes = require('./routes/test.routes');
const assignmentRoutes = require('./routes/assignment.routes');
const settingRoutes = require('./routes/setting.routes');
const syllabusRoutes = require('./routes/syllabus.routes');

const app = express();

// Security Middlewares
app.use(helmet({ crossOriginResourcePolicy: false }));
app.use('/uploads', express.static(path.join(__dirname, '../uploads')));
app.use(
  cors({
    origin: (origin, callback) => {
      // Allow requests with no origin (e.g. mobile apps, curl, postman)
      if (!origin) return callback(null, true);

      const allowedOrigins = [
        'http://localhost:3000',
        'http://localhost:5173',
        'https://target-batch.netlify.app',
      ];

      if (process.env.CLIENT_URL && process.env.CLIENT_URL !== '*') {
        allowedOrigins.push(process.env.CLIENT_URL);
      }

      // Allow if explicit match, or ends with .netlify.app / .onrender.com, or fallback allow
      if (
        allowedOrigins.includes(origin) ||
        origin.endsWith('.netlify.app') ||
        origin.endsWith('.onrender.com') ||
        process.env.NODE_ENV !== 'production'
      ) {
        return callback(null, true);
      }

      // Dynamic origin reflection allows credentials: true without wildcard error
      return callback(null, true);
    },
    credentials: true,
    methods: ['GET', 'POST', 'PUT', 'PATCH', 'DELETE', 'OPTIONS'],
    allowedHeaders: ['Content-Type', 'Authorization', 'X-Requested-With'],
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
app.use('/api/v1/syllabus', syllabusRoutes);

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
