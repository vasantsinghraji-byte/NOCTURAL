const Application = require('../models/application');
const Duty = require('../models/duty');
const User = require('../models/user');
const { getTenantQuery } = require('../utils/tenantScope');

async function canMessage({ sender, recipientId, dutyId }) {
  if (!recipientId || String(recipientId) === String(sender?._id)) return false;

  const recipient = await User.findById(recipientId).select('hospital hospitalId').lean();
  if (!recipient) return false;

  const senderTenant = getTenantQuery(sender);
  const recipientTenant = getTenantQuery(recipient);
  if (senderTenant && recipientTenant &&
      Object.keys(senderTenant)[0] === Object.keys(recipientTenant)[0] &&
      String(Object.values(senderTenant)[0]) === String(Object.values(recipientTenant)[0])) {
    return true;
  }

  if (!dutyId) return false;
  const duty = await Duty.findById(dutyId).select('postedBy assignedDoctors').lean();
  if (!duty) return false;

  const participants = new Set([
    String(duty.postedBy),
    ...(duty.assignedDoctors || []).map(item => String(item.doctor))
  ]);
  const applications = await Application.find({
    duty: dutyId,
    applicant: { $in: [sender._id, recipientId] }
  }).select('applicant').lean();
  applications.forEach(application => participants.add(String(application.applicant)));

  return participants.has(String(sender._id)) && participants.has(String(recipientId));
}

module.exports = { canMessage };
