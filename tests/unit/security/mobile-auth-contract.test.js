const { addMobileTokens, isMobileRequest } = require('../../../utils/mobileAuth');

describe('mobile authentication contract', () => {
  const tokens = {
    token: 'access-token',
    refreshToken: 'refresh-token'
  };

  it('does not expose tokens to browser clients', () => {
    const payload = { user: { id: 'user-1' } };

    expect(isMobileRequest({ headers: {} })).toBe(false);
    expect(addMobileTokens({ headers: {} }, payload, tokens)).toEqual(payload);
  });

  it('exposes tokens only to the exact Capacitor client header', () => {
    const req = {
      headers: {
        'x-nocturnal-mobile': 'capacitor',
        origin: 'https://localhost'
      }
    };

    expect(isMobileRequest(req)).toBe(true);
    expect(addMobileTokens(req, { user: { id: 'user-1' } }, tokens)).toEqual({
      user: { id: 'user-1' },
      tokens: {
        accessToken: 'access-token',
        refreshToken: 'refresh-token'
      }
    });
  });

  it('supports the access-token-only sessions currently issued by main', () => {
    const req = {
      headers: {
        'x-nocturnal-mobile': 'capacitor',
        origin: 'https://localhost'
      }
    };

    expect(addMobileTokens(req, { user: { id: 'user-1' } }, {
      token: 'access-token'
    })).toEqual({
      user: { id: 'user-1' },
      tokens: {
        accessToken: 'access-token'
      }
    });
  });

  it('rejects the mobile header from a normal browser origin', () => {
    expect(isMobileRequest({
      headers: {
        'x-nocturnal-mobile': 'capacitor',
        origin: 'https://nocturnal.com'
      }
    })).toBe(false);
  });
});
