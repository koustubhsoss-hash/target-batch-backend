const multer = require('multer');
const fs = require('fs');
const path = require('path');

// Ensure persistent uploads directory exists
const uploadsBaseDir = path.join(__dirname, '../../uploads');
if (!fs.existsSync(uploadsBaseDir)) {
  fs.mkdirSync(uploadsBaseDir, { recursive: true });
}

// Memory storage for flexible routing (Cloudinary or local disk persistence)
const storage = multer.memoryStorage();

const fileFilter = (req, file, cb) => {
  const allowedMimeTypes = [
    'application/pdf',
    'image/jpeg',
    'image/png',
    'image/webp',
    'image/gif',
    'application/msword',
    'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
    'text/plain',
    'text/csv',
    'video/mp4',
    'video/webm',
    'video/quicktime',
  ];

  // Also check file extension as fallback if mime is generic octet-stream
  const ext = path.extname(file.originalname).toLowerCase();
  const allowedExtensions = ['.pdf', '.doc', '.docx', '.jpg', '.jpeg', '.png', '.webp', '.csv', '.txt', '.mp4', '.webm'];

  if (allowedMimeTypes.includes(file.mimetype) || allowedExtensions.includes(ext)) {
    cb(null, true);
  } else {
    cb(new Error(`Invalid file type (${ext || file.mimetype}). PDF, Word DOCX, Images, and Videos are allowed!`), false);
  }
};

const upload = multer({
  storage,
  limits: {
    fileSize: 25 * 1024 * 1024, // 25MB max file size
  },
  fileFilter,
});

// Helper to save buffer persistently to local disk
const saveFileToDisk = (fileBuffer, originalname, subfolder = 'documents') => {
  const targetDir = path.join(uploadsBaseDir, subfolder);
  if (!fs.existsSync(targetDir)) {
    fs.mkdirSync(targetDir, { recursive: true });
  }

  const safeName = `${Date.now()}-${originalname.replace(/[^a-zA-Z0-9._-]/g, '_')}`;
  const filePath = path.join(targetDir, safeName);
  fs.writeFileSync(filePath, fileBuffer);

  // Return web-accessible URL path
  return `/uploads/${subfolder}/${safeName}`;
};

module.exports = upload;
module.exports.saveFileToDisk = saveFileToDisk;
module.exports.uploadsBaseDir = uploadsBaseDir;
