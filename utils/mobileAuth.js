const MOBILE_CLIENT_HEADER = 'x-nocturnal-mobile';
const MOBILE_CLIENT_VALUE = 'capacitor';
const EXPO_CLIENT_VALUE = 'expo';
const MOBILE_ORIGINS = new Set(['https://localhost', 'capacitor://localhost']);

// Legacy Capacitor shell: a WebView, so it always sends its fixed app origin.
const isCapacitorRequest = (headers) => (
  headers[MOBILE_CLIENT_HEADER] === MOBILE_CLIENT_VALUE
  && MOBILE_ORIGINS.has(headers.origin)
);

// Expo / React Native: native HTTP stack (OkHttp / NSURLSession), no WebView.
// Browsers always attach Origin to POSTs and Sec-Fetch-* to every request, and
// page JavaScript cannot remove them, so requiring their absence keeps body
// tokens away from browser scripts (the XSS surface httpOnly cookies protect).
const isNativeAppRequest = (headers) => (
  headers[MOBILE_CLIENT_HEADER] === EXPO_CLIENT_VALUE
  && !headers.origin
  && !headers['sec-fetch-mode']
  && !headers['sec-fetch-site']
);

const isMobileRequest = (req) => !!(
  req
  && req.headers
  && (isCapacitorRequest(req.headers) || isNativeAppRequest(req.headers))
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
  EXPO_CLIENT_VALUE,
  MOBILE_ORIGINS,
  isMobileRequest,
  addMobileTokens
};
