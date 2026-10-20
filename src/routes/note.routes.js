const express = require('express');
const router = express.Router();
const {
  getNotes,
  getNoteById,
  createNote,
  updateNote,
  patchNote,
  deleteNote,
} = require('../controllers/note.controller');
const { authenticate } = require('../middlewares/auth.middleware');
const { authorize } = require('../middlewares/role.middleware');
const upload = require('../middlewares/upload.middleware');

router.get('/', authenticate, getNotes);
router.get('/:id', authenticate, getNoteById);
router.post('/', authenticate, authorize('ADMIN'), upload.single('file'), createNote);
router.put('/:id', authenticate, authorize('ADMIN'), updateNote);
router.patch('/:id', authenticate, authorize('ADMIN'), patchNote);
router.delete('/:id', authenticate, authorize('ADMIN'), deleteNote);

module.exports = router;
