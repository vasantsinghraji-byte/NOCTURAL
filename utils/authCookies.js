const ACCESS_TOKEN_COOKIE = 'accessToken';
const REFRESH_TOKEN_COOKIE = 'refreshToken';
const ACCESS_TOKEN_MAX_AGE_MS = 15 * 60 * 1000;
const REFRESH_TOKEN_MAX_AGE_MS = 7 * 24 * 60 * 60 * 1000;

const getCookieOptions = (maxAge) => ({
  httpOnly: true,
  secure: process.env.NODE_ENV === 'production',
  sameSite: 'strict',
  path: '/',
  maxAge
});

const setAuthCookies = (res, tokens) => {
  if (!res || typeof res.cookie !== 'function') {
    return;
  }

  res.cookie(ACCESS_TOKEN_COOKIE, tokens.token, getCookieOptions(ACCESS_TOKEN_MAX_AGE_MS));
  res.cookie(REFRESH_TOKEN_COOKIE, tokens.refreshToken, getCookieOptions(REFRESH_TOKEN_MAX_AGE_MS));
};

const clearAuthCookies = (res) => {
  if (!res || typeof res.clearCookie !== 'function') {
    return;
  }

  const options = {
    httpOnly: true,
    secure: process.env.NODE_ENV === 'production',
    sameSite: 'strict',
    path: '/'
  };

  res.clearCookie(ACCESS_TOKEN_COOKIE, options);
  res.clearCookie(REFRESH_TOKEN_COOKIE, options);
};

module.exports = {
  ACCESS_TOKEN_COOKIE,
  REFRESH_TOKEN_COOKIE,
  setAuthCookies,
  clearAuthCookies
};
