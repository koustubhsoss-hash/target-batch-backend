const express = require('express');
const router = express.Router();
const { getNotices, createNotice, updateNotice, deleteNotice } = require('../controllers/notice.controller');
const { authenticate } = require('../middlewares/auth.middleware');
const { authorize } = require('../middlewares/role.middleware');
const upload = require('../middlewares/upload.middleware');

router.get('/', authenticate, getNotices);
router.post('/', authenticate, authorize('ADMIN'), upload.single('file'), createNotice);
router.put('/:id', authenticate, authorize('ADMIN'), upload.single('file'), updateNotice);
router.delete('/:id', authenticate, authorize('ADMIN'), deleteNotice);

module.exports = router;
