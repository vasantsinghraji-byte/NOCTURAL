const sensitiveRouteParams = [
  'patientId',
  'accessorId',
  'tokenId',
  'accessToken',
  'refreshToken',
  'resetToken',
  'healthToken',
  'qrToken'
];

const sensitiveNames = sensitiveRouteParams.join('|');

const queryAccessPatternFor = (objectName) => new RegExp(
  `${objectName}\\.(?:${sensitiveNames})\\b`
  + `|${objectName}\\s*\\[\\s*(['"\`])(?:${sensitiveNames})\\1\\s*\\]`
);

const reqQueryPattern = queryAccessPatternFor('req\\.query');
const reqQueryAliasPattern = /\b(?:const|let|var)\s+([A-Za-z_$][\w$]*)\s*=\s*req\.query\b/g;
const reqDestructuredQueryPattern = /\b(?:const|let|var)\s*\{\s*query\s*(?::\s*([A-Za-z_$][\w$]*))?\s*\}\s*=\s*req\b/g;
const destructurePatternFor = (objectName) => new RegExp(
  `\\b(?:const|let|var)\\s*\\{([^}]+)\\}\\s*=\\s*${objectName}\\b`,
  'g'
);

const defaultAllowedSensitiveGetRoutes = new Set([
  'routes/doctorAccess.js GET /emergency/:qrToken'
]);

function escapeRegExp(value) {
  return String(value).replace(/[\\^$.*+?()[\]{}|]/g, '\\$&');
}

function buildRoutePattern(routeWrapperNames = []) {
  const wrapperPattern = routeWrapperNames
    .filter(Boolean)
    .map(escapeRegExp)
    .join('|');
  const callablePattern = wrapperPattern
    ? `(?:\\b(?:router|app)\\.get|\\b(?:${wrapperPattern}))`
    : '\\b(?:router|app)\\.get';

  return new RegExp(`${callablePattern}\\s*\\(\\s*(['"\`])([^'"\`]+)\\1`, 'g');
}

function getDestructuredPropertyNames(destructuredFields) {
  return destructuredFields
    .split(',')
    .map((field) => field.trim())
    .filter(Boolean)
    .map((field) => field
      .split(':')[0]
      .split('=')[0]
      .trim()
      .replace(/^['"`]|['"`]$/g, ''));
}

function hasSensitiveDestructure(routeBlock, objectName) {
  const pattern = destructurePatternFor(objectName);
  let destructureMatch = pattern.exec(routeBlock);
  while (destructureMatch) {
    const propertyNames = getDestructuredPropertyNames(destructureMatch[1]);
    if (propertyNames.some((name) => sensitiveRouteParams.includes(name))) {
      return true;
    }
    destructureMatch = pattern.exec(routeBlock);
  }
  return false;
}

function getQueryAliases(routeBlock) {
  const queryAliases = [];

  reqQueryAliasPattern.lastIndex = 0;
  let aliasMatch = reqQueryAliasPattern.exec(routeBlock);
  while (aliasMatch) {
    queryAliases.push(aliasMatch[1]);
    aliasMatch = reqQueryAliasPattern.exec(routeBlock);
  }

  reqDestructuredQueryPattern.lastIndex = 0;
  let destructuredQueryMatch = reqDestructuredQueryPattern.exec(routeBlock);
  while (destructuredQueryMatch) {
    queryAliases.push(destructuredQueryMatch[1] || 'query');
    destructuredQueryMatch = reqDestructuredQueryPattern.exec(routeBlock);
  }

  return queryAliases;
}

function getSensitiveGetRouteViolations(file, source, options = {}) {
  const {
    allowedSensitiveGetRoutes = defaultAllowedSensitiveGetRoutes,
    routeWrapperNames = []
  } = options instanceof Set ? { allowedSensitiveGetRoutes: options } : options;
  const violations = [];
  const routePattern = buildRoutePattern(routeWrapperNames);
  let match = routePattern.exec(source);

  while (match) {
    const routePath = match[2];
    const routeKey = `${file.replace(/\\/g, '/')} GET ${routePath}`;
    const nextRouteStart = source.slice(match.index + 1).search(/\b(router|app)\.(get|post|put|patch|delete)\s*\(/);
    const routeBlock = nextRouteStart === -1
      ? source.slice(match.index)
      : source.slice(match.index, match.index + 1 + nextRouteStart);

    const hasSensitivePathParam = sensitiveRouteParams.some((param) => (
      new RegExp(`/:${param}(?:/|$)`).test(routePath)
    ));

    const queryAliases = getQueryAliases(routeBlock);
    const hasSensitiveQueryRead = reqQueryPattern.test(routeBlock)
      || hasSensitiveDestructure(routeBlock, 'req\\.query')
      || queryAliases.some((alias) => (
        queryAccessPatternFor(alias).test(routeBlock)
        || hasSensitiveDestructure(routeBlock, alias)
      ));

    if ((hasSensitivePathParam || hasSensitiveQueryRead) && !allowedSensitiveGetRoutes.has(routeKey)) {
      violations.push(routeKey);
    }

    match = routePattern.exec(source);
  }

  return violations;
}

module.exports = {
  defaultAllowedSensitiveGetRoutes,
  getSensitiveGetRouteViolations,
  sensitiveRouteParams
};
