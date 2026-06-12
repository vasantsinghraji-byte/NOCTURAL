const { applicationDefault, getApps, initializeApp } = require('firebase-admin/app');
const { getMessaging } = require('firebase-admin/messaging');
const mobileDeviceService = require('./mobileDeviceService');
const logger = require('../utils/logger');

const INVALID_TOKEN_CODES = new Set([
  'messaging/invalid-registration-token',
  'messaging/registration-token-not-registered'
]);

const getFirebaseMessaging = () => {
  if (process.env.FIREBASE_PUSH_ENABLED !== 'true') {
    return null;
  }

  if (getApps().length === 0) {
    initializeApp({ credential: applicationDefault() });
  }

  return getMessaging();
};

const toStringData = (data = {}) => Object.fromEntries(
  Object.entries(data)
    .filter(([, value]) => value !== undefined && value !== null)
    .map(([key, value]) => [key, String(value)])
);

const sendToOwner = async ({ owner, userType, title, body, data }) => {
  const messaging = getFirebaseMessaging();
  if (!messaging) {
    return {
      sentCount: 0,
      failedCount: 0,
      error: 'Firebase push is disabled'
    };
  }

  const tokens = await mobileDeviceService.getEnabledTokens({ owner, userType });
  if (tokens.length === 0) {
    return {
      sentCount: 0,
      failedCount: 0,
      error: 'No enabled mobile devices'
    };
  }

  let sentCount = 0;
  let failedCount = 0;
  const invalidTokens = [];

  for (let offset = 0; offset < tokens.length; offset += 500) {
    const batch = tokens.slice(offset, offset + 500);
    const response = await messaging.sendEachForMulticast({
      tokens: batch,
      notification: { title, body },
      data: toStringData(data)
    });

    sentCount += response.successCount;
    failedCount += response.failureCount;
    response.responses.forEach((result, index) => {
      if (!result.success && INVALID_TOKEN_CODES.has(result.error?.code)) {
        invalidTokens.push(batch[index]);
      }
    });
  }

  if (invalidTokens.length > 0) {
    await mobileDeviceService.disableTokens(invalidTokens);
  }

  logger.info('Push notification delivery completed', {
    owner,
    userType,
    sentCount,
    failedCount,
    invalidTokenCount: invalidTokens.length
  });

  return {
    sentCount,
    failedCount,
    error: failedCount > 0 ? `${failedCount} push notification(s) failed` : null
  };
};

module.exports = {
  sendToOwner,
  toStringData
};
