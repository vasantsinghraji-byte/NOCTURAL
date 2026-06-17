const normalizeAddress = value => String(value || '').replace(/^::ffff:/, '');

const getTrustedLocationProxyIps = () => new Set(
  String(process.env.TRUSTED_LOCATION_PROXY_IPS || '')
    .split(',')
    .map(normalizeAddress)
    .map(value => value.trim())
    .filter(Boolean)
);

const getRequestSecurityMetadata = (req) => {
  const remoteAddress = normalizeAddress(req?.socket?.remoteAddress);
  const trustedLocationProxy = getTrustedLocationProxyIps().has(remoteAddress);
  const city = trustedLocationProxy
    ? req?.headers?.['x-vercel-ip-city'] || req?.headers?.['cf-ipcity']
    : undefined;
  const country = trustedLocationProxy
    ? req?.headers?.['x-vercel-ip-country'] || req?.headers?.['cf-ipcountry']
    : undefined;

  return {
    ipAddress: req?.ip || remoteAddress || undefined,
    userAgent: req?.get ? req.get('user-agent') : req?.headers?.['user-agent'],
    approximateLocation: [city, country].filter(Boolean).join(', ') || undefined
  };
};

module.exports = { getRequestSecurityMetadata };
