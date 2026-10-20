const express = require('express');
const router = express.Router();
const {
  getAssignments,
  createAssignment,
  updateAssignment,
  deleteAssignment,
  submitAssignment,
  gradeSubmission,
} = require('../controllers/assignment.controller');
const { authenticate } = require('../middlewares/auth.middleware');
const { authorize } = require('../middlewares/role.middleware');
const upload = require('../middlewares/upload.middleware');

router.get('/', authenticate, getAssignments);
router.post('/', authenticate, authorize('ADMIN'), createAssignment);
router.put('/:id', authenticate, authorize('ADMIN'), updateAssignment);
router.delete('/:id', authenticate, authorize('ADMIN'), deleteAssignment);

// Student submits homework
router.post('/:id/submit', authenticate, authorize('STUDENT'), upload.single('file'), submitAssignment);

// Admin grades student submission
router.patch('/:id/grade', authenticate, authorize('ADMIN'), gradeSubmission);

module.exports = router;
