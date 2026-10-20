const express = require('express');
const router = express.Router();
const {
  getStudents,
  getStudentById,
  createStudent,
  updateStudent,
  updateStudentStatus,
  deleteStudent,
} = require('../controllers/student.controller');
const { authenticate } = require('../middlewares/auth.middleware');
const { authorize } = require('../middlewares/role.middleware');

// All student management routes restricted to ADMIN
router.use(authenticate, authorize('ADMIN'));

router.get('/', getStudents);
router.post('/', createStudent);
router.get('/:id', getStudentById);
router.put('/:id', updateStudent);
router.patch('/:id/status', updateStudentStatus);
router.delete('/:id', deleteStudent);

module.exports = router;
