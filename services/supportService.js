/**
 * Support: "Call me back" requests from customers, worked by ops in the admin
 * panel. Numbers stay hidden in lists; revealing one is recorded on the request.
 */
const CallbackRequest = require('../models/callbackRequest');
const Patient = require('../models/patient');
const { NotFoundError, ValidationError } = require('../utils/errors');
const logger = require('../utils/logger');

const maskName = (name) => {
  const parts = String(name || 'Customer').trim().split(/\s+/);
  return parts.length > 1 ? `${parts[0]} ${parts[parts.length - 1][0]}.` : parts[0];
};
const maskPhone = (phone) => {
  const d = String(phone || '').replace(/\D/g, '');
  return d.length >= 4 ? `•••••${d.slice(-4)}` : '•••';
};

const publicView = (r) => ({
  _id: r._id, topic: r.topic, note: r.note, status: r.status, outcome: r.outcome,
  createdAt: r.createdAt, handledAt: r.handledAt
});

/** Ask Nabz to call. A second request while one is open returns the open one. */
async function requestCallback(patientId, { topic, note, context, language } = {}) {
  const patient = await Patient.findById(patientId).select('name phone').lean();
  if (!patient) throw new NotFoundError('Account');
  if (!patient.phone) throw new ValidationError('Add a phone number to your account so we can call you');
  const open = await CallbackRequest.findOne({ patient: patientId, status: 'OPEN' }).lean();
  if (open) return { request: publicView(open), existing: true };
  try {
    const r = await CallbackRequest.create({
      patient: patientId,
      name: patient.name,
      phone: patient.phone,
      topic: CallbackRequest.TOPICS.includes(topic) ? topic : 'OTHER',
      note: note ? String(note).slice(0, 300) : undefined,
      context: context && context.kind && context.id ? { kind: context.kind, id: context.id } : undefined,
      language: language === 'hi' ? 'hi' : 'en'
    });
    logger.info('Callback requested', { callbackId: String(r._id), topic: r.topic });
    return { request: publicView(r), existing: false };
  } catch (err) {
    // Two taps at the same moment: the unique open index lets only one through.
    if (err && err.code === 11000) {
      const again = await CallbackRequest.findOne({ patient: patientId, status: 'OPEN' }).lean();
      if (again) return { request: publicView(again), existing: true };
    }
    throw err;
  }
}

async function myOpenCallback(patientId) {
  const r = await CallbackRequest.findOne({ patient: patientId }).sort({ createdAt: -1 }).lean();
  return r ? publicView(r) : null;
}

/** Admin queue: oldest open first; names and numbers masked. */
async function adminList({ status = 'OPEN' } = {}) {
  const filter = CallbackRequest.STATUSES.includes(status) ? { status } : {};
  const rows = await CallbackRequest.find(filter).select('+phone').sort({ createdAt: status === 'OPEN' ? 1 : -1 }).limit(200).lean();
  return rows.map((r) => ({
    ...publicView(r),
    customer: maskName(r.name),
    phone: maskPhone(r.phone),
    language: r.language,
    context: r.context,
    reveals: (r.reveals || []).length
  }));
}

/** The full number, for the admin who is about to call. Recorded on the request. */
async function adminReveal(adminId, id) {
  const r = await CallbackRequest.findByIdAndUpdate(id, { $push: { reveals: { by: adminId, at: new Date() } } }, { returnDocument: 'after' }).select('+phone name').lean();
  if (!r) throw new NotFoundError('Request');
  logger.info('Callback number revealed', { callbackId: String(id), adminId: String(adminId) });
  return { phone: r.phone, name: r.name };
}

async function adminUpdate(adminId, id, { status, outcome }) {
  if (!['CALLED', 'CLOSED', 'OPEN'].includes(status)) throw new ValidationError('Choose a status');
  const r = await CallbackRequest.findByIdAndUpdate(id, {
    $set: { status, outcome: outcome ? String(outcome).slice(0, 300) : undefined, handledBy: adminId, handledAt: new Date() }
  }, { returnDocument: 'after' }).lean();
  if (!r) throw new NotFoundError('Request');
  return publicView(r);
}

module.exports = { requestCallback, myOpenCallback, adminList, adminReveal, adminUpdate, maskPhone };
