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

  const mobileTokens = {
    accessToken: tokens.token
  };

  if (tokens.refreshToken) {
    mobileTokens.refreshToken = tokens.refreshToken;
  }

  return {
    ...payload,
    tokens: mobileTokens
  };
};

module.exports = {
  MOBILE_CLIENT_HEADER,
  MOBILE_CLIENT_VALUE,
  MOBILE_ORIGINS,
  isMobileRequest,
  addMobileTokens
};
