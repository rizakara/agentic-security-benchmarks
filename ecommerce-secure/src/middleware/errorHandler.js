const logger = require('../utils/logger');
const config = require('../config');

function errorHandler(err, req, res, _next) {
  // Multer file size error
  if (err.code === 'LIMIT_FILE_SIZE') {
    return res.status(400).json({ error: 'File too large. Maximum size is 5MB.' });
  }

  // Multer filter error
  if (err.message && err.message.includes('Only JPEG')) {
    return res.status(400).json({ error: err.message });
  }

  logger.error('Unhandled error', {
    error: err.message,
    stack: err.stack,
    path: req.path,
    method: req.method,
  });

  const status = err.status || 500;
  const message =
    config.env === 'production' ? 'Internal server error' : err.message;

  res.status(status).json({ error: message });
}

module.exports = errorHandler;
