/**
 * Redaction for anything shown to operators (admin live logs, masked user
 * lists). Secrets are removed outright; personal data is masked so an operator
 * can still tell records apart ("a***@gmail.com", "••••••4321").
 */

// Values under these keys are never shown.
const SECRET_KEY = /(pass(word)?|token|secret|authorization|cookie|session|otp|mfa|credential|api[_-]?key|encryption|signature|accountnumber|account_number|cvv|card|uri|dsn)/i;
// Values under these keys are masked.
const PERSONAL_KEY = /(email|phone|mobile|contact|upi|ifsc|address|street|lat|lng|latitude|longitude|dob|dateofbirth|aadhaar|pan)/i;

const STRING_RULES = [
  [/mongodb(\+srv)?:\/\/[^\s"']+/gi, 'mongodb://[REDACTED]'],
  [/rediss?:\/\/[^\s"']+/gi, 'redis://[REDACTED]'],
  [/Bearer\s+[A-Za-z0-9._~+/=-]+/gi, 'Bearer [REDACTED]'],
  [/eyJ[A-Za-z0-9_-]{8,}\.[A-Za-z0-9_-]{8,}\.[A-Za-z0-9_-]{8,}/g, '[JWT]'],
  [/\brzp_(live|test)_[A-Za-z0-9]+/g, 'rzp_$1_[REDACTED]'],
  [/\b[a-f0-9]{40,}\b/gi, '[HEX]'],
  [/([A-Za-z0-9._%+-])[A-Za-z0-9._%+-]*@([A-Za-z0-9.-]+\.[A-Za-z]{2,})/g, '$1***@$2'],
  [/(\+?91[\s-]?)?\b[6-9]\d{5}(\d{4})\b/g, '••••••$2']
];

function redactString(value) {
  let out = String(value);
  for (const [pattern, replacement] of STRING_RULES) out = out.replace(pattern, replacement);
  return out.length > 2000 ? `${out.slice(0, 2000)}…` : out;
}

function maskEmail(email) {
  if (!email || typeof email !== 'string') return email || null;
  const [user, domain] = email.split('@');
  if (!domain) return '***';
  return `${user.slice(0, 1)}***@${domain}`;
}

function maskPhone(phone) {
  if (!phone) return null;
  const digits = String(phone).replace(/\D/g, '');
  return digits.length >= 4 ? `••••••${digits.slice(-4)}` : '••••';
}

function maskValue(key, value) {
  if (value === null || value === undefined) return value;
  if (/email/i.test(key)) return maskEmail(String(value));
  if (/phone|mobile|contact/i.test(key)) return maskPhone(value);
  return '[MASKED]';
}

/** Deep copy with secrets removed, personal data masked and free text scrubbed. */
function redact(value, key = '', depth = 0) {
  if (value === null || value === undefined) return value;
  if (key && SECRET_KEY.test(key)) return '[REDACTED]';
  if (key && PERSONAL_KEY.test(key) && typeof value !== 'object') return maskValue(key, value);
  if (depth > 5) return '[…]';
  if (typeof value === 'string') return redactString(value);
  if (typeof value !== 'object') return value;
  if (value instanceof Date) return value.toISOString();
  if (value instanceof Error) return { name: value.name, message: redactString(value.message) };
  if (Array.isArray(value)) return value.slice(0, 20).map((v) => redact(v, '', depth + 1));
  const out = {};
  for (const [k, v] of Object.entries(value).slice(0, 40)) out[k] = redact(v, k, depth + 1);
  return out;
}

module.exports = { redact, redactString, maskEmail, maskPhone };
