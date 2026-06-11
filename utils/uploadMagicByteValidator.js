const { Transform } = require('stream');
const logger = require('./logger');
const { detectFileTypeFromBuffer } = require('./fileTypeDetector');

const MAGIC_BYTE_SAMPLE_SIZE = 4100;
const ALLOWED_MAGIC_MIMES = ['image/jpeg', 'image/png', 'application/pdf'];

const createMagicByteValidationError = (message, details = {}) => {
  const error = new Error(message);
  error.code = 'INVALID_FILE_SIGNATURE';
  error.details = details;
  return error;
};

const isAllowedMagicMime = (mime, allowedMimes = ALLOWED_MAGIC_MIMES) => allowedMimes.includes(mime);

const createMagicByteValidatedStream = (file, options = {}) => {
  const {
    allowedMimes = ALLOWED_MAGIC_MIMES,
    sampleSize = MAGIC_BYTE_SAMPLE_SIZE,
    userId = 'anonymous'
  } = options;

  let sample = Buffer.alloc(0);
  let totalSize = 0;
  let validated = false;
  let bufferedChunks = [];
  let validationPromise = null;

  const validateSample = async () => {
    if (validated) return;

    const fileTypeResult = await detectFileTypeFromBuffer(sample);
    if (!fileTypeResult) {
      throw createMagicByteValidationError('Invalid file: Could not verify file type', {
        declaredMime: file.mimetype
      });
    }

    if (!isAllowedMagicMime(fileTypeResult.mime, allowedMimes)) {
      throw createMagicByteValidationError(`Invalid file type detected: ${fileTypeResult.mime}`, {
        declaredMime: file.mimetype,
        actualMime: fileTypeResult.mime
      });
    }

    if (fileTypeResult.mime !== file.mimetype && !(file.mimetype === 'image/jpg' && fileTypeResult.mime === 'image/jpeg')) {
      throw createMagicByteValidationError('File content does not match declared MIME type', {
        declaredMime: file.mimetype,
        actualMime: fileTypeResult.mime
      });
    }

    validated = true;
  };

  const stream = new Transform({
    transform(chunk, _encoding, callback) {
      totalSize += chunk.length;

      if (validated) {
        this.push(chunk);
        return callback();
      }

      bufferedChunks.push(chunk);

      if (sample.length < sampleSize) {
        const remainingBytes = sampleSize - sample.length;
        sample = Buffer.concat([sample, chunk.slice(0, remainingBytes)]);
      }

      if (sample.length < sampleSize) {
        return callback();
      }

      validationPromise = validateSample()
        .then(() => {
          bufferedChunks.forEach(bufferedChunk => this.push(bufferedChunk));
          bufferedChunks = [];
          callback();
        })
        .catch((error) => {
          logger.logSecurity('file_stream_magic_validation_failed', {
            filename: file.originalname,
            fieldname: file.fieldname,
            declaredMime: file.mimetype,
            reason: error.message,
            userId
          });
          callback(error);
        });
    },

    flush(callback) {
      if (validated) {
        return callback();
      }

      validationPromise = validateSample()
        .then(() => {
          bufferedChunks.forEach(bufferedChunk => this.push(bufferedChunk));
          bufferedChunks = [];
          callback();
        })
        .catch((error) => {
          logger.logSecurity('file_stream_magic_validation_failed', {
            filename: file.originalname,
            fieldname: file.fieldname,
            declaredMime: file.mimetype,
            reason: error.message,
            userId
          });
          callback(error);
        });
    }
  });

  return {
    stream,
    getSize: () => totalSize,
    validation: () => validationPromise || Promise.resolve()
  };
};

module.exports = {
  MAGIC_BYTE_SAMPLE_SIZE,
  ALLOWED_MAGIC_MIMES,
  createMagicByteValidatedStream,
  createMagicByteValidationError
};
