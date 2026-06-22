const mongoose = require('mongoose');

const enabled = process.env.RUN_LIVE_CONCURRENCY_TESTS === 'true';
const describeLive = enabled ? describe : describe.skip;

describeLive('live password-change and refresh-token race', () => {
  const User = require('../../models/user');
  const RefreshSession = require('../../models/refreshSession');
  const SecurityNotificationOutbox = require('../../models/securityNotificationOutbox');
  const Notification = require('../../models/notification');
  const securityNotificationOutboxService = require('../../services/securityNotificationOutboxService');
  const authService = require('../../services/authService');
  const refreshSessionService = require('../../services/refreshSessionService');
  const { generateRefreshToken, IDENTITY_TYPES } = require('../../utils/authTokens');

  let user;
  let currentToken;

  beforeAll(async () => {
    if (!process.env.MONGODB_URI) throw new Error('MONGODB_URI is required');
    await mongoose.connect(process.env.MONGODB_URI, { serverSelectionTimeoutMS: 5000 });
    const hello = await mongoose.connection.db.admin().command({ hello: 1 });
    if (!hello.setName) throw new Error('Live concurrency test requires a replica-set MongoDB');
    await RefreshSession.createIndexes();
  }, 30000);

  beforeEach(async () => {
    const suffix = `${Date.now()}${Math.floor(Math.random() * 10000)}`;
    user = await User.create({
      name: 'Password Race User',
      email: `password-race-${suffix}@example.test`,
      password: 'OldPassword@123',
      role: 'doctor'
    });
    currentToken = generateRefreshToken(user._id, IDENTITY_TYPES.USER, user.sessionVersion);
    await refreshSessionService.create({
      token: currentToken,
      userId: user._id,
      userType: 'user'
    });
  });

  afterEach(async () => {
    await Promise.all([
      User.deleteMany({ _id: user?._id }),
      RefreshSession.deleteMany({ userId: user?._id }),
      SecurityNotificationOutbox.deleteMany({ identityId: user?._id }),
      Notification.deleteMany({ user: user?._id, 'metadata.securityEvent': 'password_changed' })
    ]);
  });

  afterAll(async () => {
    await mongoose.disconnect();
  });

  it('leaves zero active refresh sessions when password change races rotation', async () => {
    const replacementToken = generateRefreshToken(user._id, IDENTITY_TYPES.USER, user.sessionVersion);
    await Promise.allSettled([
      authService.updatePassword(user._id, 'OldPassword@123', 'NewPassword@123'),
      refreshSessionService.rotate({ currentToken, replacementToken })
    ]);

    const [updatedUser, activeSessions, notificationOutboxCount] = await Promise.all([
      User.findById(user._id).select('+sessionVersion').lean(),
      RefreshSession.countDocuments({ userId: user._id, revokedAt: null }),
      SecurityNotificationOutbox.countDocuments({ identityId: user._id, event: 'PASSWORD_CHANGED' })
    ]);
    expect(updatedUser.sessionVersion).toBe(1);
    expect(activeSessions).toBe(0);
    expect(notificationOutboxCount).toBe(1);

    const outbox = await SecurityNotificationOutbox.findOne({ identityId: user._id });
    await expect(securityNotificationOutboxService.processOne(outbox._id)).resolves.toBe(true);
    const [completedOutbox, notificationCount] = await Promise.all([
      SecurityNotificationOutbox.findById(outbox._id).lean(),
      Notification.countDocuments({ user: user._id, 'metadata.outboxId': String(outbox._id) })
    ]);
    expect(completedOutbox.status).toBe('COMPLETED');
    expect(notificationCount).toBe(1);

    const secondRotation = await refreshSessionService.rotate({
      currentToken: replacementToken,
      replacementToken: generateRefreshToken(user._id, IDENTITY_TYPES.USER, 0)
    });
    expect(secondRotation).toBeNull();
  }, 30000);

  it('rolls back password changes when an enrolled passkey confirmation is missing', async () => {
    await User.updateOne(
      { _id: user._id },
      {
        $push: {
          webAuthnCredentials: {
            credentialId: 'test-credential',
            publicKey: Buffer.from('test-public-key').toString('base64url')
          }
        }
      }
    );

    await expect(authService.updatePassword(user._id, 'OldPassword@123', 'NewPassword@123'))
      .rejects.toThrow('A recent WebAuthn confirmation is required');

    const [unchangedUser, activeSessions, outboxCount] = await Promise.all([
      User.findById(user._id).select('+password +sessionVersion').lean(),
      RefreshSession.countDocuments({ userId: user._id, revokedAt: null }),
      SecurityNotificationOutbox.countDocuments({ identityId: user._id })
    ]);
    expect(unchangedUser.sessionVersion).toBe(0);
    expect(activeSessions).toBe(1);
    expect(outboxCount).toBe(0);
  }, 30000);
});
