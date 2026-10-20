const express = require('express');
const router = express.Router();
const {
  getMetadata,
  addCourse,
  addSubject,
  deleteSubject,
} = require('../controllers/setting.controller');
const { authenticate } = require('../middlewares/auth.middleware');
const { authorize } = require('../middlewares/role.middleware');

router.get('/meta', authenticate, getMetadata);
router.post('/courses', authenticate, authorize('ADMIN'), addCourse);
router.post('/subjects', authenticate, authorize('ADMIN'), addSubject);
router.delete('/subjects/:id', authenticate, authorize('ADMIN'), deleteSubject);

module.exports = router;
