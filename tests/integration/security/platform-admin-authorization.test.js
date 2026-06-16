/**
 * Integration Tests: platform_admin vs admin authorization
 *
 * Exercises the REAL authorize() middleware (and the real ROLES constants) to
 * confirm the tenant/platform role split is enforced end-to-end:
 * - platform_admin may pass a platform-scoped gate (e.g. credential verification)
 * - a hospital admin may NOT, and vice-versa
 *
 * authorize() only reads req.user.role, so no database is required.
 */

const { authorize } = require('../../../middleware/auth');
const { ROLES, isValidRole } = require('../../../constants/roles');
const { mockRequest, mockResponse, mockNext } = require('../../helpers');

// Run a role through an authorize() gate and report whether it was allowed.
function runGate(gate, role) {
  const req = mockRequest({ user: { _id: 'u1', role } });
  const res = mockResponse();
  const next = mockNext();
  gate(req, res, next);
  return {
    allowed: next.mock.calls.length === 1,
    status: res.status.mock.calls.length ? res.status.mock.calls[0][0] : null
  };
}

describe('Authorization Integration: platform_admin vs admin role split', () => {
  describe('platform-scoped gate: authorize(PLATFORM_ADMIN)', () => {
    const gate = authorize(ROLES.PLATFORM_ADMIN);

    it('allows a platform_admin', () => {
      const result = runGate(gate, ROLES.PLATFORM_ADMIN);
      expect(result.allowed).toBe(true);
    });

    it('denies a hospital admin with 403', () => {
      const result = runGate(gate, ROLES.ADMIN);
      expect(result.allowed).toBe(false);
      expect(result.status).toBe(403);
    });

    it('denies a provider with 403', () => {
      const result = runGate(gate, ROLES.DOCTOR);
      expect(result.allowed).toBe(false);
      expect(result.status).toBe(403);
    });
  });

  describe('hospital-scoped gate: authorize(ADMIN)', () => {
    const gate = authorize(ROLES.ADMIN);

    it('allows a hospital admin', () => {
      const result = runGate(gate, ROLES.ADMIN);
      expect(result.allowed).toBe(true);
    });

    it('denies a platform_admin with 403', () => {
      const result = runGate(gate, ROLES.PLATFORM_ADMIN);
      expect(result.allowed).toBe(false);
      expect(result.status).toBe(403);
    });
  });

  it('registers platform_admin as a recognized role', () => {
    expect(isValidRole(ROLES.PLATFORM_ADMIN)).toBe(true);
  });
});
