function getTenantQuery(user) {
  return user?.hospitalId ? { hospitalId: user.hospitalId } : null;
}

function getTenantFields(user) {
  return user?.hospitalId ? { hospitalId: user.hospitalId } : {};
}

function belongsToTenant(record, user) {
  if (!record) {
    return false;
  }

  return Boolean(user?.hospitalId && record.hospitalId) && String(record.hospitalId) === String(user.hospitalId);
}

module.exports = {
  belongsToTenant,
  getTenantFields,
  getTenantQuery
};
