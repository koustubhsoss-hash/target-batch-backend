const express = require('express');
const router = express.Router();
const {
  uploadDocument,
  getMyDocuments,
  updateStudentLockerProfile,
  deleteDocument,
  getAllDocumentsForAdmin,
  updateDocumentStatus,
} = require('../controllers/studentDoc.controller');
const { authenticate } = require('../middlewares/auth.middleware');
const { authorize } = require('../middlewares/role.middleware');
const upload = require('../middlewares/upload.middleware');

// Student endpoints
router.post('/upload', authenticate, upload.single('file'), uploadDocument);
router.get('/my', authenticate, getMyDocuments);
router.put('/profile', authenticate, updateStudentLockerProfile);
router.delete('/:id', authenticate, deleteDocument);

// Admin endpoints
router.get('/all', authenticate, authorize('ADMIN'), getAllDocumentsForAdmin);
router.patch('/:id/status', authenticate, authorize('ADMIN'), updateDocumentStatus);

module.exports = router;

