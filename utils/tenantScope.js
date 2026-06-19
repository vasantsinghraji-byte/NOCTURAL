function getTenantQuery(user) {
  if (user?.hospitalId) {
    return { hospitalId: user.hospitalId };
  }

  if (user?.hospital) {
    return { hospital: user.hospital };
  }

  return null;
}

function getTenantFields(user) {
  const fields = {};

  if (user?.hospital) {
    fields.hospital = user.hospital;
  }
  if (user?.hospitalId) {
    fields.hospitalId = user.hospitalId;
  }

  return fields;
}

function belongsToTenant(record, user) {
  if (!record) {
    return false;
  }

  if (user?.hospitalId) {
    return Boolean(record.hospitalId) && String(record.hospitalId) === String(user.hospitalId);
  }

  return Boolean(user?.hospital) && record.hospital === user.hospital;
}

module.exports = {
  belongsToTenant,
  getTenantFields,
  getTenantQuery
};
