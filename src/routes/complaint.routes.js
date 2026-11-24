const express = require('express');
const router = express.Router();
const {
  getComplaints,
  createComplaint,
  replyComplaint,
  deleteComplaint,
} = require('../controllers/complaint.controller');
const { authenticate } = require('../middlewares/auth.middleware');
const { authorize } = require('../middlewares/role.middleware');
const upload = require('../middlewares/upload.middleware');

router.get('/', authenticate, getComplaints);
router.post('/', authenticate, authorize('STUDENT'), upload.single('file'), createComplaint);
router.patch('/:ticket/reply', authenticate, authorize('ADMIN'), replyComplaint);
router.delete('/:ticket', authenticate, authorize('ADMIN'), deleteComplaint);

module.exports = router;
