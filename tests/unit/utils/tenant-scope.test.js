const { belongsToTenant, getTenantFields, getTenantQuery } = require('../../../utils/tenantScope');

describe('tenant scope utilities', () => {
  it('prefers immutable hospitalId over a matching display name', () => {
    const user = { hospital: 'Same Hospital', hospitalId: 'hospital-a' };
    const record = { hospital: 'Same Hospital', hospitalId: 'hospital-b' };

    expect(getTenantQuery(user)).toEqual({ hospitalId: 'hospital-a' });
    expect(belongsToTenant(record, user)).toBe(false);
  });

  it('binds trusted tenant fields and ignores caller-supplied values when spread last', () => {
    expect({
      hospital: 'Attacker Hospital',
      hospitalId: 'attacker-id',
      ...getTenantFields({ hospital: 'Hospital A', hospitalId: 'hospital-a' })
    }).toEqual({
      hospital: 'Hospital A',
      hospitalId: 'hospital-a'
    });
  });

  it('supports legacy hospital-name scoping only when hospitalId is unavailable', () => {
    const user = { hospital: 'Legacy Hospital' };

    expect(getTenantQuery(user)).toEqual({ hospital: 'Legacy Hospital' });
    expect(belongsToTenant({ hospital: 'Legacy Hospital' }, user)).toBe(true);
  });
});
