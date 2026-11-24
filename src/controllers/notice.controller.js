const prisma = require('../config/prisma');
const { sendSuccess, sendError } = require('../utils/apiResponse');
const { storeUploadedFile, matchesTarget } = require('../utils/fileUpload');

const toBool = (v) => v === true || v === 'true' || v === '1' || v === 1;

// GET /api/v1/notices — students only receive notices for their course & semester
const getNotices = async (req, res, next) => {
  try {
    const notices = await prisma.notice.findMany({
      orderBy: [{ isPinned: 'desc' }, { publishDate: 'desc' }],
    });

    let result = notices;
    if (req.user.role === 'STUDENT') {
      const profile = req.user.studentProfile || {};
      result = notices.filter(
        (n) => matchesTarget(n.targetCourse, profile.course) && matchesTarget(n.targetSemester, profile.semester)
      );
    }

    return sendSuccess(res, 'Notices fetched', { count: result.length, notices: result });
  } catch (error) {
    next(error);
  }
};

// POST /api/v1/notices (Admin, multipart with optional "file")
const createNotice = async (req, res, next) => {
  try {
    const { title, content, category, targetCourse, targetSemester, isPinned, publishDate, issuedBy } = req.body;
    if (!title || !String(title).trim() || !content || !String(content).trim()) {
      return sendError(res, 'Title and content are required', 400);
    }

    const file = await storeUploadedFile(req.file, 'soss_notices');

    const notice = await prisma.notice.create({
      data: {
        title: String(title).trim(),
        content: String(content).trim(),
        category: category || 'General',
        targetCourse: targetCourse || 'All',
        targetSemester: targetSemester || 'All',
        isPinned: toBool(isPinned),
        publishDate: publishDate ? new Date(publishDate) : new Date(),
        issuedBy: issuedBy || 'Academic Admin',
        attachmentName: file?.name || null,
        attachmentUrl: file?.url || null,
      },
    });

    return sendSuccess(res, 'Notice published', { notice }, 201);
  } catch (error) {
    next(error);
  }
};

// PUT /api/v1/notices/:id (Admin, multipart with optional "file")
const updateNotice = async (req, res, next) => {
  try {
    const { id } = req.params;
    const { title, content, category, targetCourse, targetSemester, isPinned } = req.body;

    const existing = await prisma.notice.findUnique({ where: { id } });
    if (!existing) return sendError(res, 'Notice not found', 404);

    const file = await storeUploadedFile(req.file, 'soss_notices');

    const notice = await prisma.notice.update({
      where: { id },
      data: {
        ...(title ? { title: String(title).trim() } : {}),
        ...(content ? { content: String(content).trim() } : {}),
        ...(category ? { category } : {}),
        ...(targetCourse ? { targetCourse } : {}),
        ...(targetSemester ? { targetSemester } : {}),
        ...(isPinned !== undefined ? { isPinned: toBool(isPinned) } : {}),
        ...(file ? { attachmentName: file.name, attachmentUrl: file.url } : {}),
      },
    });

    return sendSuccess(res, 'Notice updated', { notice });
  } catch (error) {
    next(error);
  }
};

// DELETE /api/v1/notices/:id (Admin)
const deleteNotice = async (req, res, next) => {
  try {
    const { id } = req.params;
    const existing = await prisma.notice.findUnique({ where: { id } });
    if (!existing) return sendError(res, 'Notice not found', 404);
    await prisma.notice.delete({ where: { id } });
    return sendSuccess(res, 'Notice deleted');
  } catch (error) {
    next(error);
  }
};

module.exports = { getNotices, createNotice, updateNotice, deleteNotice };
