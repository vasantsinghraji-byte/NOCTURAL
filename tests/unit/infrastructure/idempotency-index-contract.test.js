const fs = require('fs');
const path = require('path');

const rootDir = path.resolve(__dirname, '..', '..', '..');
const read = (relativePath) => fs.readFileSync(path.join(rootDir, relativePath), 'utf8');

describe('idempotency production contract', () => {
  it('creates the unique claim and TTL indexes explicitly', () => {
    const script = read('scripts/add-indexes.js');

    expect(script).toContain("db.collection('idempotencykeys').createIndex({ scope: 1 }");
    expect(script).toContain("name: 'scope_unique_idx'");
    expect(script).toContain('unique: true');
    expect(script).toContain("name: 'idempotency_ttl_idx'");
    expect(script).toContain('IDEMPOTENCY_TTL_SECONDS');
  });

  it('sends keys on every approved booking and payment mutation', () => {
    const config = read('client/public/js/config.js');
    const bookingForm = read('client/public/js/patient-booking-form.js');

    expect(config).toContain('createIdempotencyKey');
    expect(config).toContain('crypto.randomUUID');
    expect(bookingForm.match(/'Idempotency-Key': AppConfig\.createIdempotencyKey\(\)/g)).toHaveLength(4);

    const failureCall = bookingForm.slice(bookingForm.indexOf("AppConfig.fetchRoute('paymentsB2c.failure'"));
    expect(failureCall).toContain("'Idempotency-Key'");
  });
});
