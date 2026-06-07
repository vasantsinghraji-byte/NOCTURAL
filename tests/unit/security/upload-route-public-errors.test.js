const express = require('express');
const request = require('supertest');

jest.mock('../../../middleware/auth', () => ({
  protect: (req, _res, next) => {
    req.user = { _id: 'user-123' };
    next();
  }
}));

jest.mock('../../../middleware/upload', () => ({
  uploadProfilePhoto: (req, _res, next) => {
    req.file = { filename: 'profile.jpg' };
    next();
  },
  uploadMCICertificate: (_req, _res, next) => next(),
  uploadMBBSDegree: (_req, _res, next) => next(),
  uploadPhotoId: (_req, _res, next) => next(),
  uploadCertificate: (_req, _res, next) => next(),
  uploadDocuments: (_req, _res, next) => next()
}));

jest.mock('../../../models/user', () => ({
  findById: jest.fn()
}));

jest.mock('../../../utils/logger', () => ({
  error: jest.fn()
}));

const User = require('../../../models/user');
const logger = require('../../../utils/logger');
const uploadsRouter = require('../../../routes/uploads');

describe('Security Unit: upload route public errors', () => {
  const app = express();
  app.use(express.json());
  app.use('/uploads', uploadsRouter);

  beforeEach(() => {
    jest.clearAllMocks();
  });

  it('returns an opaque upload error and logs the private failure details', async () => {
    User.findById.mockRejectedValue(
      new Error('S3 bucket nocturnal-phi-prod denied path /uploads/private-key')
    );

    const response = await request(app)
      .post('/uploads/profile-photo')
      .set('X-Request-ID', 'req-upload-1')
      .expect(500);

    expect(response.body).toEqual({
      success: false,
      error: 'upload_failed',
      requestId: 'req-upload-1'
    });
    expect(JSON.stringify(response.body)).not.toContain('nocturnal-phi-prod');
    expect(JSON.stringify(response.body)).not.toContain('/uploads/private-key');
    expect(logger.error).toHaveBeenCalledWith(
      'Upload route error',
      expect.objectContaining({
        action: 'profile_photo_upload',
        requestId: 'req-upload-1',
        error: expect.stringContaining('nocturnal-phi-prod')
      })
    );
  });
});
