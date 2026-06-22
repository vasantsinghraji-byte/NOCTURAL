jest.mock('../../../models/refreshSession', () => ({
  findOneAndUpdate: jest.fn(),
  findOne: jest.fn(),
  create: jest.fn(),
  updateOne: jest.fn(),
  updateMany: jest.fn()
}));

jest.mock('../../../services/securityAuditService', () => ({
  record: jest.fn()
}));

jest.mock('../../../models/user', () => ({
  findById: jest.fn()
}));

jest.mock('../../../models/patient', () => ({
  findById: jest.fn()
}));

const RefreshSession = require('../../../models/refreshSession');
const User = require('../../../models/user');
const Patient = require('../../../models/patient');
const refreshSessionService = require('../../../services/refreshSessionService');
const jwt = require('jsonwebtoken');

const makeRefreshToken = (userId = 'user-1') => jwt.sign(
  { id: userId, type: 'refresh' },
  process.env.JWT_REFRESH_SECRET || process.env.JWT_SECRET
);

function resolvedSelect(value) {
  return { select: jest.fn().mockResolvedValue(value) };
}

describe('refresh sessions after password changes', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  it('rejects and does not replace a user session created before passwordChangedAt', async () => {
    const currentToken = makeRefreshToken();
    RefreshSession.findOneAndUpdate.mockResolvedValue({
      userId: 'user-1',
      userType: 'user',
      createdAt: new Date('2026-01-01')
    });
    User.findById.mockReturnValue(resolvedSelect({
      passwordChangedAt: new Date('2026-02-01')
    }));

    const result = await refreshSessionService.rotate({
      currentToken,
      replacementToken: makeRefreshToken()
    });

    expect(result).toBeNull();
    expect(RefreshSession.create).not.toHaveBeenCalled();
    expect(RefreshSession.updateOne).toHaveBeenCalledWith(
      { tokenHash: refreshSessionService.hashToken(currentToken) },
      { revokedReason: 'PASSWORD_CHANGED' }
    );
    expect(RefreshSession.updateMany).toHaveBeenCalledWith(
      { userId: 'user-1', userType: 'user', revokedAt: null },
      { revokedAt: expect.any(Date), revokedReason: 'PASSWORD_CHANGED' }
    );
  });

  it('allows rotation only when the session was created after the password change', async () => {
    const session = {
      userId: 'patient-1',
      userType: 'patient',
      createdAt: new Date('2026-03-01')
    };
    RefreshSession.findOneAndUpdate.mockResolvedValue(session);
    Patient.findById.mockReturnValue(resolvedSelect({
      passwordChangedAt: null
    }));

    const result = await refreshSessionService.rotate({
      currentToken: makeRefreshToken('patient-1'),
      replacementToken: makeRefreshToken('patient-1')
    });

    expect(result).toBe(session);
    expect(RefreshSession.create).toHaveBeenCalledTimes(1);
  });

  it('revokes a replacement created concurrently with a password change', async () => {
    const currentToken = makeRefreshToken();
    const replacementToken = makeRefreshToken();
    RefreshSession.findOneAndUpdate.mockResolvedValue({
      userId: 'user-1',
      userType: 'user',
      createdAt: new Date()
    });
    User.findById
      .mockReturnValueOnce(resolvedSelect({ passwordChangedAt: null }))
      .mockReturnValueOnce(resolvedSelect({ passwordChangedAt: new Date(Date.now() + 1000) }));

    const result = await refreshSessionService.rotate({
      currentToken,
      replacementToken
    });

    expect(result).toBeNull();
    expect(RefreshSession.updateOne).toHaveBeenCalledWith(
      {
        tokenHash: refreshSessionService.hashToken(replacementToken),
        revokedAt: null
      },
      { revokedAt: expect.any(Date), revokedReason: 'PASSWORD_CHANGED' }
    );
    expect(RefreshSession.updateMany).toHaveBeenCalledWith(
      { userId: 'user-1', userType: 'user', revokedAt: null },
      { revokedAt: expect.any(Date), revokedReason: 'PASSWORD_CHANGED' }
    );
  });

  it('revokes all active sessions for the requested identity', async () => {
    await refreshSessionService.revokeAllForUser({
      userId: 'user-1',
      userType: 'user',
      reason: 'PASSWORD_CHANGED'
    });

    expect(RefreshSession.updateMany).toHaveBeenCalledWith(
      { userId: 'user-1', userType: 'user', revokedAt: null },
      { revokedAt: expect.any(Date), revokedReason: 'PASSWORD_CHANGED' }
    );
  });

  it('revokes an entire token family when a rotated token is reused', async () => {
    RefreshSession.findOneAndUpdate.mockResolvedValue(null);
    RefreshSession.findOne.mockResolvedValue({
      userId: 'user-1',
      userType: 'user',
      familyId: 'family-1',
      revokedAt: new Date(),
      replacedByTokenHash: 'replacement-hash'
    });

    const result = await refreshSessionService.rotate({
      currentToken: makeRefreshToken(),
      replacementToken: makeRefreshToken()
    });

    expect(result).toBeNull();
    expect(RefreshSession.updateMany).toHaveBeenCalledWith(
      { familyId: 'family-1', revokedAt: null },
      {
        revokedAt: expect.any(Date),
        revokedReason: 'TOKEN_REUSE_DETECTED',
        reuseDetectedAt: expect.any(Date)
      }
    );
  });
});
