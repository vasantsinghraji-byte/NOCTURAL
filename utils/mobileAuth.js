const MOBILE_CLIENT_HEADER = 'x-nocturnal-mobile';
const MOBILE_CLIENT_VALUE = 'capacitor';
const MOBILE_ORIGINS = new Set(['https://localhost', 'capacitor://localhost']);

const isMobileRequest = (req) => (
  req
  && req.headers
  && req.headers[MOBILE_CLIENT_HEADER] === MOBILE_CLIENT_VALUE
  && MOBILE_ORIGINS.has(req.headers.origin)
);

const addMobileTokens = (req, payload, tokens) => {
  if (!isMobileRequest(req)) {
    return payload;
  }

  return {
    ...payload,
    tokens: {
      accessToken: tokens.token,
      refreshToken: tokens.refreshToken
    }
  };
};

module.exports = {
  MOBILE_CLIENT_HEADER,
  MOBILE_CLIENT_VALUE,
  MOBILE_ORIGINS,
  isMobileRequest,
  addMobileTokens
};
