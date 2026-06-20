const { encrypt, decrypt } = require('../utils/encryption');

const encodePayload = (payload) => encrypt(JSON.stringify(payload || {}));

const decodePayload = (outbox) => {
  if (outbox.payloadEncrypted) {
    const decrypted = decrypt(outbox.payloadEncrypted);
    if (!decrypted) throw new Error('Security notification outbox payload could not be decrypted');
    return JSON.parse(decrypted);
  }
  return outbox.payload || {};
};

module.exports = { encodePayload, decodePayload };
