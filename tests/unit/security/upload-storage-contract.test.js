const fs = require('fs');
const path = require('path');

jest.mock('../../../middleware/auth', () => ({
  protect: jest.fn()
}));

jest.mock('../../../middleware/upload', () => ({
  uploadProfilePhoto: jest.fn(),
  uploadMCICertificate: jest.fn(),
  uploadMBBSDegree: jest.fn(),
  uploadPhotoId: jest.fn(),
  uploadCertificate: jest.fn(),
  uploadDocuments: jest.fn()
}));

jest.mock('../../../models/user', () => ({
  findById: jest.fn()
}));

jest.mock('../../../config/storage', () => ({
  USE_GCS: false,
  toStoredFile: jest.fn(file => ({
    key: file.key,
    url: `/api/v1/uploads/file?key=${encodeURIComponent(file.key)}`
  })),
  getStorageKey: jest.fn(file => file.key),
  deleteFile: jest.fn(),
  resolveLocalFile: jest.fn(key => `D:\\NOCTURNAL\\NOCTURAL\\uploads\\${key}`),
  getSignedUrl: jest.fn()
}));

jest.mock('../../../utils/logger', () => ({
  error: jest.fn()
}));

const User = require('../../../models/user');
const storageConfig = require('../../../config/storage');
const uploadsRouter = require('../../../routes/uploads');
const { mockRequest, mockResponse, mockNext } = require('../../helpers');

function getHandler(method, routePath) {
  const layer = uploadsRouter.stack.find(
    item => item.route && item.route.path === routePath && item.route.methods[method]
  );
  return layer.route.stack[layer.route.stack.length - 1].handle;
}

describe('upload storage contract', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    storageConfig.toStoredFile.mockImplementation(file => ({
      key: file.key,
      url: `/api/v1/uploads/file?key=${encodeURIComponent(file.key)}`
    }));
    storageConfig.getStorageKey.mockImplementation(file => file.key);
    storageConfig.resolveLocalFile.mockImplementation(
      key => `D:\\NOCTURNAL\\NOCTURAL\\uploads\\${key}`
    );
  });

  it('sends idempotency keys for doctor upload routes that require them', () => {
    const onboarding = fs.readFileSync(
      path.join(__dirname, '../../../client/public/js/doctor-onboarding.js'),
      'utf8'
    );
    const profile = fs.readFileSync(
      path.join(__dirname, '../../../client/public/js/doctor-profile-enhanced.js'),
      'utf8'
    );
    const idempotencyHeader = /'Idempotency-Key': AppConfig\.createIdempotencyKey\(\)/g;

    expect(onboarding.match(idempotencyHeader)).toHaveLength(1);
    expect(profile.match(idempotencyHeader)).toHaveLength(2);
  });

  it('persists the unified key/url contract and deletes the replaced object', async () => {
    const handler = getHandler('post', '/profile-photo');
    const user = {
      profilePhoto: { publicId: 'profile-photos/old.jpg' },
      calculateProfileStrength: jest.fn(),
      save: jest.fn()
    };
    User.findById.mockResolvedValue(user);
    const req = mockRequest({
      user: { _id: 'user-1' },
      file: { key: 'profile-photos/new.jpg' }
    });

    await handler(req, mockResponse(), mockNext());

    expect(user.profilePhoto).toEqual(expect.objectContaining({
      publicId: 'profile-photos/new.jpg',
      url: '/api/v1/uploads/file?key=profile-photos%2Fnew.jpg'
    }));
    expect(storageConfig.deleteFile).toHaveBeenCalledWith('profile-photos/old.jpg');
  });

  it('denies downloads when the requested key is not referenced by the user record', async () => {
    const handler = getHandler('get', '/file');
    User.findById.mockReturnValue({
      select: jest.fn().mockResolvedValue({
        profilePhoto: { publicId: 'profile-photos/owned.jpg' },
        documents: {}
      })
    });
    const req = mockRequest({
      query: { key: 'documents/ids/other-user.pdf' },
      user: { _id: 'user-1' }
    });
    const res = {
      ...mockResponse(),
      send: jest.fn(),
      sendFile: jest.fn(),
      redirect: jest.fn()
    };

    await handler(req, res, mockNext());

    expect(res.status).toHaveBeenCalledWith(404);
    expect(res.sendFile).not.toHaveBeenCalled();
    expect(res.redirect).not.toHaveBeenCalled();
  });

  it('serves local files only after stored-record authorization', async () => {
    const handler = getHandler('get', '/file');
    User.findById.mockReturnValue({
      select: jest.fn().mockResolvedValue({
        profilePhoto: { publicId: 'profile-photos/owned.jpg' },
        documents: {}
      })
    });
    const req = mockRequest({
      query: { key: 'profile-photos/owned.jpg' },
      user: { _id: 'user-1' }
    });
    const res = {
      ...mockResponse(),
      send: jest.fn(),
      sendFile: jest.fn(),
      redirect: jest.fn()
    };

    await handler(req, res, mockNext());

    expect(res.sendFile).toHaveBeenCalledWith(
      'D:\\NOCTURNAL\\NOCTURAL\\uploads\\profile-photos/owned.jpg'
    );
  });

  it('deletes the underlying object after deleting stored metadata', async () => {
    const handler = getHandler('delete', '/:documentType');
    const user = {
      documents: {
        photoId: { publicId: 'documents/ids/id.pdf' }
      },
      calculateProfileStrength: jest.fn(),
      save: jest.fn()
    };
    User.findById.mockResolvedValue(user);
    const req = mockRequest({
      params: { documentType: 'photoId' },
      user: { _id: 'user-1' }
    });

    await handler(req, mockResponse(), mockNext());

    expect(user.documents.photoId).toBeUndefined();
    expect(storageConfig.deleteFile).toHaveBeenCalledWith('documents/ids/id.pdf');
  });
});
