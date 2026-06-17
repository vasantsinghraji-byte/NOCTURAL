jest.mock('../../../models/user', () => ({
  findById: jest.fn(),
  updateOne: jest.fn()
}));
jest.mock('../../../models/patient', () => ({
  findById: jest.fn(),
  updateOne: jest.fn()
}));
jest.mock('../../../models/webAuthnRecoveryCode', () => ({
  updateMany: jest.fn(),
  insertMany: jest.fn(),
  countDocuments: jest.fn(),
  findOneAndUpdate: jest.fn()
}));
jest.mock('../../../models/webAuthnChallenge', () => ({
  create: jest.fn()
}));

const User = require('../../../models/user');
const RecoveryCode = require('../../../models/webAuthnRecoveryCode');
const Challenge = require('../../../models/webAuthnChallenge');
const webAuthnService = require('../../../services/webAuthnService');
const { hash } = require('../../../utils/encryption');

const selectResult = value => ({ select: jest.fn().mockResolvedValue(value) });

describe('WebAuthn credential and recovery-code management', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    process.env.ENCRYPTION_KEY = require('crypto').createHash('sha256').update('test-encryption-key').digest('hex');
  });

  it('lists passkeys without exposing public keys', async () => {
    User.findById.mockReturnValue(selectResult({
      webAuthnCredentials: [{
        credentialId: 'credential-1',
        publicKey: 'secret-public-key',
        name: 'Laptop',
        transports: ['internal'],
        createdAt: new Date('2026-01-01T00:00:00Z')
      }]
    }));

    const result = await webAuthnService.listCredentials({ identityId: 'user-1', identityType: 'user' });

    expect(result.credentials).toHaveLength(1);
    expect(result.credentials[0]).toEqual(expect.objectContaining({
      credentialId: 'credential-1',
      name: 'Laptop',
      transports: ['internal']
    }));
    expect(result.credentials[0]).not.toHaveProperty('publicKey');
  });

  it('revokes a selected passkey by credential ID', async () => {
    User.updateOne.mockResolvedValue({ modifiedCount: 1 });

    await expect(webAuthnService.revokeCredential({
      identityId: 'user-1',
      identityType: 'user',
      credentialId: 'credential-1'
    })).resolves.toEqual({ revoked: true });

    expect(User.updateOne).toHaveBeenCalledWith(
      { _id: 'user-1', 'webAuthnCredentials.credentialId': 'credential-1' },
      { $pull: { webAuthnCredentials: { credentialId: 'credential-1' } } }
    );
  });

  it('generates one-time hashed recovery codes and replaces previous unused codes', async () => {
    User.findById.mockReturnValue(selectResult({ _id: 'user-1' }));
    RecoveryCode.updateMany.mockResolvedValue({ modifiedCount: 2 });
    RecoveryCode.insertMany.mockResolvedValue([]);

    const result = await webAuthnService.generateRecoveryCodes({
      identityId: 'user-1',
      identityType: 'user',
      count: 3
    });

    expect(result.codes).toHaveLength(3);
    expect(RecoveryCode.updateMany).toHaveBeenCalledWith(
      { identityId: 'user-1', identityType: 'user', usedAt: null, replacedAt: null },
      { $set: { replacedAt: expect.any(Date) } }
    );
    const insertedCodes = RecoveryCode.insertMany.mock.calls[0][0];
    expect(insertedCodes).toHaveLength(3);
    expect(insertedCodes[0]).toEqual(expect.objectContaining({
      identityId: 'user-1',
      identityType: 'user',
      codeHash: expect.any(String),
      expiresAt: expect.any(Date)
    }));
    expect(result.codes).not.toContain(insertedCodes[0].codeHash);
  });

  it('uses a recovery code to mint a password-change confirmation and revoke lost-device passkeys', async () => {
    RecoveryCode.findOneAndUpdate.mockResolvedValue({ _id: 'recovery-1' });
    User.updateOne.mockResolvedValue({ modifiedCount: 1 });
    Challenge.create.mockResolvedValue({ _id: 'confirmation-1' });

    const result = await webAuthnService.recoverLostDevice({
      identityId: 'user-1',
      identityType: 'user',
      recoveryCode: 'ABCD-EFGH-IJKL',
      revokePasskeys: true
    });

    expect(RecoveryCode.findOneAndUpdate).toHaveBeenCalledWith(
      expect.objectContaining({
        identityId: 'user-1',
        identityType: 'user',
        codeHash: hash('ABCD-EFGH-IJKL'),
        usedAt: null,
        replacedAt: null
      }),
      { $set: { usedAt: expect.any(Date) } },
      { new: true }
    );
    expect(User.updateOne).toHaveBeenCalledWith(
      { _id: 'user-1' },
      { $set: { webAuthnCredentials: [] } }
    );
    expect(Challenge.create).toHaveBeenCalledWith(expect.objectContaining({
      identityId: 'user-1',
      identityType: 'user',
      purpose: 'PASSWORD_CHANGE',
      recoveryCodeId: 'recovery-1',
      verifiedAt: expect.any(Date)
    }));
    expect(result).toEqual({ recovered: true, confirmationId: 'confirmation-1', passkeysRevoked: true });
  });
});
