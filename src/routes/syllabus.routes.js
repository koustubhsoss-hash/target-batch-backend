const express = require('express');
const router = express.Router();
const {
  getSyllabuses,
  createSyllabus,
  deleteSyllabus,
} = require('../controllers/syllabus.controller');
const { authenticate } = require('../middlewares/auth.middleware');
const { authorize } = require('../middlewares/role.middleware');

router.get('/', authenticate, getSyllabuses);
router.post('/', authenticate, authorize('ADMIN'), createSyllabus);
router.delete('/:id', authenticate, authorize('ADMIN'), deleteSyllabus);

module.exports = router;
