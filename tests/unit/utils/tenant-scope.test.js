const { belongsToTenant, getTenantFields, getTenantQuery } = require('../../../utils/tenantScope');

describe('tenant scope utilities', () => {
  it('scopes tenant queries by hospitalId only', () => {
    const user = { hospitalId: 'hospital-a' };
    const record = { hospitalId: 'hospital-b' };

    expect(getTenantQuery(user)).toEqual({ hospitalId: 'hospital-a' });
    expect(belongsToTenant(record, user)).toBe(false);
  });

  it('binds trusted hospitalId and ignores caller-supplied values when spread last', () => {
    expect({
      hospitalId: 'attacker-id',
      ...getTenantFields({ hospitalId: 'hospital-a' })
    }).toEqual({
      hospitalId: 'hospital-a'
    });
  });

  it('fails closed instead of falling back to legacy hospital names', () => {
    const user = { hospital: 'Legacy Hospital' };

    expect(getTenantQuery(user)).toBeNull();
    expect(getTenantFields(user)).toEqual({});
    expect(belongsToTenant({ hospital: 'Legacy Hospital' }, user)).toBe(false);
  });
});
