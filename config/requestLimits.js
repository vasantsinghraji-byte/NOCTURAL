const DEFAULT_MAX_CONTENT_LENGTH = 10 * 1024 * 1024; // 10MB
const DEFAULT_MAX_UPLOAD_FILE_COUNT = 5;

const parsePositiveInt = (value, fallback) => {
  const parsed = parseInt(value, 10);
  return Number.isFinite(parsed) && parsed > 0 ? parsed : fallback;
};

const MAX_CONTENT_LENGTH = parsePositiveInt(
  process.env.MAX_CONTENT_LENGTH,
  DEFAULT_MAX_CONTENT_LENGTH
);

const MAX_UPLOAD_FILE_COUNT = parsePositiveInt(
  process.env.MAX_UPLOAD_FILE_COUNT,
  DEFAULT_MAX_UPLOAD_FILE_COUNT
);

const bytesToExpressLimit = (bytes) => `${Math.ceil(bytes / 1024)}kb`;

module.exports = {
  MAX_CONTENT_LENGTH,
  MAX_UPLOAD_FILE_COUNT,
  bytesToExpressLimit
};
