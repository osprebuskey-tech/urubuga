const multer = require('multer');
const env = require('../config/env');
const AppError = require('../utils/AppError');
const { detectImageType, detectDocumentType } = require('../utils/imageType');

const upload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: env.MAX_UPLOAD_MB * 1024 * 1024, files: 1, fields: 10, fieldSize: 10 * 1024 },
});

/** Parses one multipart image (field name "image"), then checks the file's real type from its bytes. */
const singleImage = (req, res, next) => {
  upload.single('image')(req, res, (err) => {
    if (err) {
      if (err.code === 'LIMIT_FILE_SIZE') {
        return next(new AppError(413, `Image must be smaller than ${env.MAX_UPLOAD_MB} MB`, 'FILE_TOO_LARGE'));
      }
      if (err instanceof multer.MulterError) {
        return next(new AppError(400, 'Invalid upload', 'INVALID_UPLOAD'));
      }
      return next(err);
    }
    if (!req.file) return next(new AppError(400, 'An image file is required (field "image")', 'NO_FILE'));

    const type = detectImageType(req.file.buffer);
    if (!type) return next(new AppError(400, 'Only JPEG, PNG or WebP images are allowed', 'INVALID_FILE_TYPE'));

    req.image = { buffer: req.file.buffer, ...type };
    return next();
  });
};

singleImage.docs = { upload: true };

// Registration documents: one PDF, JPG or PNG ("file"), checked by size and by its real bytes, never by the client's claims.
const documentUpload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: env.MAX_DOCUMENT_MB * 1024 * 1024, files: 1, fields: 10, fieldSize: 10 * 1024 },
});

const singleDocument = (req, res, next) => {
  documentUpload.single('file')(req, res, (err) => {
    if (err) {
      if (err.code === 'LIMIT_FILE_SIZE') return next(new AppError(413, `Document must be smaller than ${env.MAX_DOCUMENT_MB} MB`, 'FILE_TOO_LARGE'));
      if (err instanceof multer.MulterError) return next(new AppError(400, 'Invalid upload', 'INVALID_UPLOAD'));
      return next(err);
    }
    if (!req.file) return next(new AppError(400, 'A document file is required (field "file")', 'NO_FILE'));
    const type = detectDocumentType(req.file.buffer);
    if (!type) return next(new AppError(400, 'Only PDF, JPG or PNG documents are allowed', 'INVALID_FILE_TYPE'));
    req.document = { buffer: req.file.buffer, size: req.file.size, originalName: String(req.file.originalname || 'document').replace(/[^\w.\- ]/g, '_').slice(0, 120), ...type };
    return next();
  });
};
singleDocument.docs = { upload: true };

module.exports = { singleImage, singleDocument };
