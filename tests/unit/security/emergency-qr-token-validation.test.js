const crypto = require('crypto');

const EmergencySummary = require('../../../models/emergencySummary');

function createSummaryForToken(token, expiresAt = new Date(Date.now() + 60 * 60 * 1000)) {
  return new EmergencySummary({
    patient: '507f1f77bcf86cd799439011',
    patientName: 'Test Patient',
    qrTokenHash: crypto.createHash('sha256').update(token).digest('hex'),
    qrTokenExpiry: expiresAt
  });
}

describe('EmergencySummary QR token validation', () => {
  it('accepts a valid unexpired QR token', () => {
    const summary = new EmergencySummary({
      patient: '507f1f77bcf86cd799439011',
      patientName: 'Test Patient'
    });
    const { token } = summary.generateQRToken(1);

    expect(summary.validateToken(token)).toEqual({ valid: true });
  });

  it('rejects an invalid QR token', () => {
    const summary = createSummaryForToken('valid-emergency-token');

    expect(summary.validateToken('wrong-emergency-token')).toEqual({
      valid: false,
      reason: 'INVALID'
    });
  });

  it('rejects an expired QR token before comparing hashes', () => {
    const token = 'expired-emergency-token';
    const summary = createSummaryForToken(token, new Date(Date.now() - 1000));

    expect(summary.validateToken(token)).toEqual({
      valid: false,
      reason: 'EXPIRED'
    });
  });

  it('rejects malformed stored hashes without throwing', () => {
    const summary = new EmergencySummary({
      patient: '507f1f77bcf86cd799439011',
      patientName: 'Test Patient',
      qrTokenHash: 'not-a-sha256-hex-hash',
      qrTokenExpiry: new Date(Date.now() + 60 * 60 * 1000)
    });

    expect(summary.validateToken('candidate-token')).toEqual({
      valid: false,
      reason: 'INVALID'
    });
  });

  it('rejects malformed candidate tokens without throwing', () => {
    const summary = createSummaryForToken('valid-emergency-token');

    expect(summary.validateToken(null)).toEqual({
      valid: false,
      reason: 'INVALID'
    });
  });
});
