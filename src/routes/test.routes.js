const express = require('express');
const router = express.Router();
const {
  getTests,
  getTestById,
  createTest,
  updateTest,
  updateTestStatus,
  deleteTest,
  submitTest,
  getTestResults,
} = require('../controllers/test.controller');
const { authenticate } = require('../middlewares/auth.middleware');
const { authorize } = require('../middlewares/role.middleware');

router.get('/', authenticate, getTests);
router.get('/:id', authenticate, getTestById);
router.post('/', authenticate, authorize('ADMIN'), createTest);
router.put('/:id', authenticate, authorize('ADMIN'), updateTest);
router.patch('/:id/status', authenticate, authorize('ADMIN'), updateTestStatus);
router.delete('/:id', authenticate, authorize('ADMIN'), deleteTest);

// Student Exam Submission
router.post('/:id/submit', authenticate, authorize('STUDENT'), submitTest);

// Admin Leaderboard & Marks View
router.get('/:id/results', authenticate, authorize('ADMIN'), getTestResults);

module.exports = router;
