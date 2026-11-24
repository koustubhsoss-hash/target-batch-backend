const { cloudinary, isCloudinaryConfigured } = require('../config/cloudinary');
const { saveFileToDisk } = require('../middlewares/upload.middleware');

// Upload a multer memory file to Cloudinary; fall back to local disk if Cloudinary is unavailable.
const storeUploadedFile = async (file, folder) => {
  if (!file) return null;

  if (isCloudinaryConfigured) {
    try {
      const result = await new Promise((resolve, reject) => {
        const stream = cloudinary.uploader.upload_stream(
          { folder, resource_type: 'auto' },
          (error, res) => (error ? reject(error) : resolve(res))
        );
        stream.end(file.buffer);
      });
      return { url: result.secure_url, name: file.originalname };
    } catch (err) {
      console.warn(`Cloudinary upload failed (${folder}), saving to disk:`, err.message);
    }
  }

  return { url: saveFileToDisk(file.buffer, file.originalname, folder), name: file.originalname };
};

// Semester / course matching helpers shared by assignments & notices.
// A target value may be 'All', a single value, or a comma separated list ("Semester 1, Semester 3").
const matchesTarget = (target, value) => {
  const t = String(target || '').toLowerCase().trim();
  if (!t || t === 'all' || t.includes('all')) return true;
  const v = String(value || '').toLowerCase().trim();
  if (!v) return false;
  return t.split(',').map((s) => s.trim()).includes(v);
};

module.exports = { storeUploadedFile, matchesTarget };
