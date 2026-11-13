/**
 * In-memory ring buffer of recent log lines for the admin "Live logs" view.
 *
 * Every entry is redacted before it is stored (utils/logRedaction.js), so the
 * buffer never holds secrets, tokens, full phone numbers or emails. It lives in
 * this process only: with several API instances each keeps its own recent
 * lines (the response names the instance). Long-term logs stay in CloudWatch.
 */

const os = require('os');
const Transport = require('winston-transport');
const { redact, redactString } = require('./logRedaction');

const CAPACITY = Number(process.env.ADMIN_LOG_BUFFER_SIZE) || 2000;
const INSTANCE = `${os.hostname()}:${process.pid}`;
const OMIT = new Set(['level', 'message', 'timestamp', 'service', 'stack']);

const entries = [];
let seq = 0;

function push(info) {
  const meta = {};
  for (const [k, v] of Object.entries(info)) if (!OMIT.has(k)) meta[k] = v;
  seq += 1;
  entries.push({
    seq,
    at: new Date().toISOString(),
    level: String(info.level || 'info'),
    message: redactString(typeof info.message === 'string' ? info.message : JSON.stringify(info.message)),
    meta: Object.keys(meta).length ? redact(meta) : undefined,
    stack: info.stack ? redactString(String(info.stack).split('\n').slice(0, 6).join('\n')) : undefined
  });
  if (entries.length > CAPACITY) entries.splice(0, entries.length - CAPACITY);
}

class BufferTransport extends Transport {
  log(info, callback) {
    try { push(info); } catch { /* never let log capture break logging */ }
    callback();
  }
}

const LEVELS = ['error', 'warn', 'info', 'http', 'verbose', 'debug'];

/**
 * Recent entries, newest last. `after` returns only lines newer than that
 * sequence number (for polling); `level` is the least severe level to include.
 */
function query({ after = 0, level = 'info', q = '', limit = 200 } = {}) {
  const max = LEVELS.indexOf(level) === -1 ? LEVELS.indexOf('info') : LEVELS.indexOf(level);
  const needle = String(q || '').toLowerCase().slice(0, 100);
  const cap = Math.min(Math.max(Number(limit) || 200, 1), 500);
  const out = [];
  for (let i = entries.length - 1; i >= 0 && out.length < cap; i -= 1) {
    const e = entries[i];
    if (e.seq <= after) break;
    const rank = LEVELS.indexOf(e.level);
    if (rank !== -1 && rank > max) continue;
    if (needle && !`${e.message} ${JSON.stringify(e.meta || {})}`.toLowerCase().includes(needle)) continue;
    out.push(e);
  }
  return { instance: INSTANCE, latestSeq: seq, capacity: CAPACITY, entries: out.reverse() };
}

function clearForTests() { entries.length = 0; seq = 0; }

module.exports = { BufferTransport, query, clearForTests };
