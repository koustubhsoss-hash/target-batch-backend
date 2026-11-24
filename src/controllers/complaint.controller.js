const prisma = require('../config/prisma');
const { sendSuccess, sendError } = require('../utils/apiResponse');
const { storeUploadedFile } = require('../utils/fileUpload');

const studentSelect = {
  select: { name: true, rollNo: true, enrollNo: true, course: true, semester: true },
};

// Shape DB rows into the format the frontend pages already use
const formatComplaint = (c) => ({
  id: c.ticketNumber,
  dbId: c.id,
  studentId: c.studentId,
  studentName: c.student?.name || 'Student',
  rollNo: c.student?.rollNo || '',
  enrollNo: c.student?.enrollNo || '',
  course: c.student?.course || '',
  semester: c.student?.semester || '',
  category: c.category,
  subject: c.subject,
  priority: c.priority,
  description: c.description,
  attachmentUrl: c.attachmentUrl || '',
  attachmentName: c.attachmentUrl ? decodeURIComponent(c.attachmentUrl.split('/').pop() || 'attachment') : '',
  status: c.status,
  adminReply: c.response || '',
  createdAt: new Date(c.createdAt).toLocaleString('en-IN', { dateStyle: 'short', timeStyle: 'short', timeZone: 'Asia/Kolkata' }),
  resolvedAt:
    c.status === 'Resolved'
      ? new Date(c.updatedAt).toLocaleString('en-IN', { dateStyle: 'short', timeStyle: 'short', timeZone: 'Asia/Kolkata' })
      : '',
});

// GET /api/v1/complaints — student sees own tickets, admin sees all
const getComplaints = async (req, res, next) => {
  try {
    const where = {};
    if (req.user.role === 'STUDENT') {
      if (!req.user.studentProfile) return sendSuccess(res, 'Complaints fetched', { complaints: [] });
      where.studentId = req.user.studentProfile.id;
    }

    const rows = await prisma.complaint.findMany({
      where,
      include: { student: studentSelect },
      orderBy: { createdAt: 'desc' },
    });

    return sendSuccess(res, 'Complaints fetched', { count: rows.length, complaints: rows.map(formatComplaint) });
  } catch (error) {
    next(error);
  }
};

// POST /api/v1/complaints (Student, multipart with optional "file")
const createComplaint = async (req, res, next) => {
  try {
    const student = req.user.studentProfile;
    if (!student) return sendError(res, 'Only students can raise complaints', 403);

    const { category, subject, description, priority } = req.body;
    if (!subject || !String(subject).trim() || !description || !String(description).trim()) {
      return sendError(res, 'Subject and description are required', 400);
    }

    const file = await storeUploadedFile(req.file, 'soss_complaints');
    const ticketNumber = `TKT-${new Date().getFullYear()}-${Date.now().toString(36).toUpperCase()}`;

    const row = await prisma.complaint.create({
      data: {
        ticketNumber,
        studentId: student.id,
        category: category || 'General',
        subject: String(subject).trim(),
        description: String(description).trim(),
        priority: priority || 'Normal',
        status: 'Open',
        attachmentUrl: file?.url || null,
      },
      include: { student: studentSelect },
    });

    return sendSuccess(res, 'Complaint registered', { complaint: formatComplaint(row) }, 201);
  } catch (error) {
    next(error);
  }
};

// PATCH /api/v1/complaints/:ticket/reply (Admin)
const replyComplaint = async (req, res, next) => {
  try {
    const { ticket } = req.params;
    const { reply, status } = req.body;
    if (!reply || !String(reply).trim()) return sendError(res, 'Reply text is required', 400);

    const existing = await prisma.complaint.findUnique({ where: { ticketNumber: ticket } });
    if (!existing) return sendError(res, 'Complaint not found', 404);

    const row = await prisma.complaint.update({
      where: { ticketNumber: ticket },
      data: { response: String(reply).trim(), status: status || 'Resolved' },
      include: { student: studentSelect },
    });

    return sendSuccess(res, 'Complaint updated', { complaint: formatComplaint(row) });
  } catch (error) {
    next(error);
  }
};

// DELETE /api/v1/complaints/:ticket (Admin)
const deleteComplaint = async (req, res, next) => {
  try {
    const { ticket } = req.params;
    const existing = await prisma.complaint.findUnique({ where: { ticketNumber: ticket } });
    if (!existing) return sendError(res, 'Complaint not found', 404);
    await prisma.complaint.delete({ where: { ticketNumber: ticket } });
    return sendSuccess(res, 'Complaint deleted');
  } catch (error) {
    next(error);
  }
};

module.exports = { getComplaints, createComplaint, replyComplaint, deleteComplaint };
