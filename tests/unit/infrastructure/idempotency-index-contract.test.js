const { readProjectFile } = require('../validation/projectFileReader');

describe('idempotency production contract', () => {
  it('creates the unique claim and TTL indexes explicitly', () => {
    const script = readProjectFile('scripts/add-indexes.js');

    expect(script).toContain("db.collection('idempotencykeys').createIndex({ scope: 1 }");
    expect(script).toContain("name: 'scope_unique_idx'");
    expect(script).toContain('unique: true');
    expect(script).toContain("name: 'idempotency_ttl_idx'");
    expect(script).toContain('IDEMPOTENCY_TTL_SECONDS');
  });

  it('sends keys on exactly the approved booking and payment mutations', () => {
    const config = readProjectFile('client/public/js/config.js');
    const bookingForm = readProjectFile('client/public/js/patient-booking-form.js');

    expect(config).toContain('createIdempotencyKey');
    expect(config).toContain('crypto.randomUUID');
    expect(bookingForm.match(/'Idempotency-Key': AppConfig\.createIdempotencyKey\(\)/g)).toHaveLength(3);

    const failureCall = bookingForm.slice(bookingForm.indexOf("AppConfig.fetchRoute('paymentsB2c.failure'"));
    expect(failureCall).not.toContain("'Idempotency-Key'");
  });
});
