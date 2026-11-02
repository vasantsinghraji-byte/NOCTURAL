/**
 * Admin settings changes are allowlisted by field name. Inherited names such as
 * "constructor" or "toString" used to pass the allowlist (fields[path] found
 * Object.prototype members) and would be written into the live policy on approval.
 */
const settingsService = require('../../../services/settingsService');

const propose = (key, changes) => settingsService.propose('000000000000000000000001', { key, changes, reason: 'regression test' });

describe('settings changes accept only allowlisted fields', () => {
  it.each(['constructor', 'toString', '__proto__', 'hasOwnProperty', 'valueOf'])('refuses the inherited name %s', async (path) => {
    await expect(propose('revenue', { [path]: 1 })).rejects.toThrow(/can’t be changed here/);
  });

  it('refuses inherited group names', async () => {
    await expect(propose('constructor', { 'care.customerFeeRate': 0.1 })).rejects.toThrow(/Unknown settings group/);
    await expect(propose('toString', { 'care.customerFeeRate': 0.1 })).rejects.toThrow(/Unknown settings group/);
  });

  it('still validates real fields by range', async () => {
    await expect(propose('revenue', { 'care.customerFeeRate': 9 })).rejects.toThrow(/must be/);
  });
});
