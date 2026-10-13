/**
 * Chat and in-app voice calls between a customer and the provider on a booking.
 *
 * Who is connected:
 *   CARE      nurse / physio / caregiver visit: once a provider is assigned,
 *             until 24 hours after the visit is completed.
 *   PHARMACY  medicine order: once the store accepts, until 24 hours after delivery.
 *   LAB       lab order: the sample collector (or the lab, for walk-ins) while
 *             the order is open, until 24 hours after the report is ready.
 * Nobody else can read or join. Phone numbers are never shared: calls are in-app.
 *
 * Messages are saved first, then pushed live through realtimeService; the apps
 * also poll, so nothing is lost if the live link drops.
 */

const mongoose = require('mongoose');
const ChatThread = require('../models/chatThread');
const ChatMessage = require('../models/chatMessage');
const NurseBooking = require('../models/nurseBooking');
const PharmacyOrder = require('../models/pharmacyOrder');
const PharmacyVendor = require('../models/pharmacyVendor');
const LabOrder = require('../models/labOrder');
const CareStore = require('../models/careStore');
const Patient = require('../models/patient');
const User = require('../models/user');
const realtime = require('./realtimeService');
const logger = require('../utils/logger');
const { ValidationError, NotFoundError, ConflictError } = require('../utils/errors');

const AFTER_HOURS = 24 * 3600 * 1000;
const RING_SECONDS = 45;
const MAX_CALL_MS = 2 * 3600 * 1000;
const MAX_PER_MINUTE = 30;
const KINDS = ['CARE', 'PHARMACY', 'LAB'];
const CARE_ACTIVE = ['ASSIGNED', 'CONFIRMED', 'EN_ROUTE', 'IN_PROGRESS'];
const PHARMACY_ACTIVE = ['ACCEPTED', 'PREPARING', 'READY_FOR_PICKUP', 'OUT_FOR_DELIVERY'];
const LAB_ACTIVE = ['SCHEDULED', 'COLLECTED', 'AT_LAB', 'PROCESSING'];

const oid = (id) => (mongoose.isValidObjectId(id) ? new mongoose.Types.ObjectId(String(id)) : null);
const sideOf = (actor) => (actor.kind === 'patient' ? 'patient' : 'provider');
const other = (side) => (side === 'patient' ? 'provider' : 'patient');
const recent = (at, now) => !!at && now - new Date(at).getTime() < AFTER_HOURS;
const day = (d) => (d ? new Date(d).toLocaleDateString('en-IN', { day: 'numeric', month: 'short', timeZone: 'Asia/Kolkata' }) : '');
const pretty = (s) => String(s || '').replace(/_/g, ' ').toLowerCase().replace(/^\w/, (c) => c.toUpperCase());

/** The two people a booking connects, and whether they are connected right now. */
async function resolve(kind, ref, now = Date.now()) {
  const id = oid(ref);
  if (!id || !KINDS.includes(kind)) throw new ValidationError('Unknown booking');
  if (kind === 'CARE') {
    const b = await NurseBooking.findById(id).select('patient serviceProvider status statusTimestamps serviceType scheduledDate').lean();
    if (!b || !b.serviceProvider) return null;
    return {
      patient: b.patient, provider: b.serviceProvider,
      title: `${pretty(b.serviceType)}${b.scheduledDate ? ` · ${day(b.scheduledDate)}` : ''}`,
      open: CARE_ACTIVE.includes(b.status) || (b.status === 'COMPLETED' && recent(b.statusTimestamps && b.statusTimestamps.completedAt, now))
    };
  }
  if (kind === 'PHARMACY') {
    const o = await PharmacyOrder.findById(id).select('patient vendor status deliveredAt orderNumber').lean();
    if (!o) return null;
    const v = await PharmacyVendor.findById(o.vendor).select('owner name').lean();
    if (!v || !v.owner) return null;
    return {
      patient: o.patient, provider: v.owner, title: `Medicines · ${o.orderNumber || v.name}`,
      open: PHARMACY_ACTIVE.includes(o.status) || (o.status === 'DELIVERED' && recent(o.deliveredAt, now))
    };
  }
  const l = await LabOrder.findById(id).select('patient phlebotomist store status updatedAt scheduledDate').lean();
  if (!l) return null;
  let provider = l.phlebotomist;
  if (!provider) {
    const s = await CareStore.findById(l.store).select('owner').lean();
    provider = s && s.owner;
  }
  if (!provider) return null;
  return {
    patient: l.patient, provider, title: `Lab tests${l.scheduledDate ? ` · ${day(l.scheduledDate)}` : ''}`,
    open: LAB_ACTIVE.includes(l.status) || (l.status === 'REPORT_READY' && recent(l.updatedAt, now))
  };
}

function assertParty(actor, link) {
  const mine = actor.kind === 'patient' ? String(link.patient) === String(actor.id) : String(link.provider) === String(actor.id);
  if (!mine) throw new NotFoundError('Conversation');
}

async function loadThread(actor, threadId) {
  const id = oid(threadId);
  const thread = id && await ChatThread.findById(id).lean();
  if (!thread) throw new NotFoundError('Conversation', threadId);
  assertParty(actor, thread);
  return thread;
}

async function people(threads) {
  const pIds = [...new Set(threads.map((t) => String(t.patient)))];
  const uIds = [...new Set(threads.map((t) => String(t.provider)))];
  const [ps, us] = await Promise.all([
    Patient.find({ _id: { $in: pIds } }).select('name profilePhoto').lean(),
    User.find({ _id: { $in: uIds } }).select('name role profilePhoto').lean()
  ]);
  return {
    patient: new Map(ps.map((p) => [String(p._id), { name: p.name, photoUrl: p.profilePhoto && p.profilePhoto.url, role: 'customer' }])),
    provider: new Map(us.map((u) => [String(u._id), { name: u.name, photoUrl: u.profilePhoto && u.profilePhoto.url, role: u.role }]))
  };
}

function publicThread(t, side, who, open) {
  const them = other(side);
  return {
    _id: t._id,
    kind: t.kind,
    ref: t.ref,
    title: t.title,
    me: side,
    with: (them === 'patient' ? who.patient.get(String(t.patient)) : who.provider.get(String(t.provider))) || { name: 'Nabz user' },
    lastMessage: t.lastMessage || null,
    unread: (t.unread && t.unread[side]) || 0,
    open,
    updatedAt: t.updatedAt
  };
}

function publicMessage(m) {
  return { _id: m._id, thread: m.thread, from: m.from, type: m.type, text: m.text || '', call: m.call && m.call.status ? m.call : undefined, readAt: m.readAt, createdAt: m.createdAt };
}

const inboxOf = (thread, side) => realtime.channels.inbox(realtime.accountTag(side === 'patient' ? { kind: 'patient', id: thread.patient } : { kind: 'user', id: thread.provider }));

/** Start (or reopen) the conversation for a booking. Only its two people can. */
async function openThread(actor, { kind, ref }, now = Date.now()) {
  const link = await resolve(kind, ref, now);
  if (!link) throw new ConflictError('Chat opens once a provider is assigned to this booking');
  assertParty(actor, link);
  const thread = await ChatThread.findOneAndUpdate(
    { kind, ref: oid(ref) },
    { $setOnInsert: { kind, ref: oid(ref), patient: link.patient, provider: link.provider, title: link.title } },
    { new: true, upsert: true, setDefaultsOnInsert: true }
  ).lean();
  const side = sideOf(actor);
  return publicThread(thread, side, await people([thread]), link.open);
}

async function listThreads(actor, now = Date.now()) {
  const side = sideOf(actor);
  const threads = await ChatThread.find(side === 'patient' ? { patient: actor.id } : { provider: actor.id }).sort({ updatedAt: -1 }).limit(50).lean();
  const who = await people(threads);
  const links = await Promise.all(threads.map((t) => resolve(t.kind, t.ref, now).catch(() => null)));
  return threads.map((t, i) => publicThread(t, side, who, !!(links[i] && links[i].open)));
}

async function getThread(actor, threadId, { before, limit = 40 } = {}, now = Date.now()) {
  const thread = await loadThread(actor, threadId);
  const link = await resolve(thread.kind, thread.ref, now).catch(() => null);
  const filter = { thread: thread._id };
  if (before && !Number.isNaN(new Date(before).getTime())) filter.createdAt = { $lt: new Date(before) };
  const rows = await ChatMessage.find(filter).sort({ createdAt: -1 }).limit(Math.min(Number(limit) || 40, 100)).lean();
  return {
    thread: publicThread(thread, sideOf(actor), await people([thread]), !!(link && link.open)),
    messages: rows.reverse().map(publicMessage)
  };
}

async function bump(thread, fromSide, text, now) {
  const to = other(fromSide);
  await ChatThread.updateOne({ _id: thread._id }, {
    $set: { lastMessage: { text: String(text).slice(0, 140), at: new Date(now), by: fromSide } },
    $inc: { [`unread.${to}`]: 1 }
  });
}

async function send(actor, threadId, text, now = Date.now()) {
  const body = String(text || '').trim();
  if (!body) throw new ValidationError('Type a message');
  if (body.length > 2000) throw new ValidationError('Messages can be up to 2000 characters');
  const thread = await loadThread(actor, threadId);
  const link = await resolve(thread.kind, thread.ref, now);
  if (!link || !link.open) throw new ConflictError('This conversation has closed with the booking');
  const side = sideOf(actor);
  const lastMinute = await ChatMessage.countDocuments({ thread: thread._id, from: side, createdAt: { $gte: new Date(now - 60000) } });
  if (lastMinute >= MAX_PER_MINUTE) throw new ConflictError('You’re sending messages too fast. Wait a moment');
  const msg = await ChatMessage.create({ thread: thread._id, from: side, type: 'TEXT', text: body });
  await bump(thread, side, body, now);
  const out = publicMessage(msg.toObject());
  await Promise.all([
    realtime.publish(realtime.channels.thread(thread._id), { type: 'message', message: out }),
    realtime.publish(inboxOf(thread, other(side)), { type: 'message', thread: String(thread._id), message: out })
  ]);
  return out;
}

async function markRead(actor, threadId, now = Date.now()) {
  const thread = await loadThread(actor, threadId);
  const side = sideOf(actor);
  await Promise.all([
    ChatThread.updateOne({ _id: thread._id }, { $set: { [`unread.${side}`]: 0 } }),
    ChatMessage.updateMany({ thread: thread._id, from: other(side), readAt: null }, { $set: { readAt: new Date(now) } })
  ]);
  await realtime.publish(realtime.channels.thread(thread._id), { type: 'read', by: side, at: new Date(now).toISOString() });
  return true;
}

/** Live-connection details for this account (and optionally one conversation). */
async function realtimeAccess(actor, { threadId } = {}) {
  const info = realtime.connectionInfo();
  if (!info) return { enabled: false };
  const subscribe = [realtime.channels.inbox(realtime.accountTag(actor))];
  if (threadId) subscribe.push(realtime.channels.thread((await loadThread(actor, threadId))._id));
  const token = realtime.issueToken({ sub: realtime.accountTag(actor), subscribe });
  return { enabled: true, ...info, token, channels: { inbox: subscribe[0], thread: subscribe[1] || null } };
}

// ── Calls ──────────────────────────────────────────────────────────────

function callBundle(actor, thread, call) {
  const info = realtime.connectionInfo();
  const channel = realtime.channels.call(call._id);
  return {
    call: publicMessage(call),
    iceServers: realtime.iceServers(realtime.accountTag(actor)),
    realtime: info ? {
      ...info,
      channel,
      token: realtime.issueToken({ sub: realtime.accountTag(actor), subscribe: [channel, realtime.channels.inbox(realtime.accountTag(actor))], publish: [channel], ttlSeconds: 3 * 3600 })
    } : null
  };
}

async function settleStaleCalls(threadId, now = Date.now()) {
  const filter = { type: 'CALL', $or: [
    { 'call.status': 'RINGING', createdAt: { $lt: new Date(now - RING_SECONDS * 1000) } },
    { 'call.status': 'ACTIVE', 'call.answeredAt': { $lt: new Date(now - MAX_CALL_MS) } }
  ] };
  if (threadId) filter.thread = threadId;
  const stale = await ChatMessage.find(filter).limit(100).lean();
  for (const c of stale) {
    const ringing = c.call.status === 'RINGING';
    await ChatMessage.updateOne({ _id: c._id, 'call.status': c.call.status }, {
      $set: { 'call.status': ringing ? 'MISSED' : 'ENDED', 'call.endedAt': new Date(now), 'call.endedBy': 'system', ...(ringing ? {} : { 'call.seconds': Math.round(MAX_CALL_MS / 1000) }) }
    });
  }
  return stale.length;
}

async function startCall(actor, threadId, now = Date.now()) {
  const thread = await loadThread(actor, threadId);
  const link = await resolve(thread.kind, thread.ref, now);
  if (!link || !link.open) throw new ConflictError('Calls are available while the booking is active');
  await settleStaleCalls(thread._id, now);
  const busy = await ChatMessage.exists({ thread: thread._id, type: 'CALL', 'call.status': { $in: ['RINGING', 'ACTIVE'] } });
  if (busy) throw new ConflictError('A call is already in progress');
  const side = sideOf(actor);
  const call = await ChatMessage.create({ thread: thread._id, from: side, type: 'CALL', call: { status: 'RINGING' } });
  await bump(thread, side, 'Voice call', now);
  const who = await people([thread]);
  const caller = side === 'patient' ? who.patient.get(String(thread.patient)) : who.provider.get(String(thread.provider));
  const invite = { type: 'call.incoming', call: { _id: String(call._id), thread: String(thread._id), title: thread.title, from: caller || { name: 'Nabz user' }, ringSeconds: RING_SECONDS } };
  await Promise.all([
    realtime.publish(inboxOf(thread, other(side)), invite),
    realtime.publish(realtime.channels.thread(thread._id), { type: 'message', message: publicMessage(call.toObject()) })
  ]);
  logger.info('Call started', { thread: String(thread._id), call: String(call._id), by: side });
  return callBundle(actor, thread, call.toObject());
}

async function loadCall(actor, callId) {
  const id = oid(callId);
  const call = id && await ChatMessage.findOne({ _id: id, type: 'CALL' }).lean();
  if (!call) throw new NotFoundError('Call', callId);
  const thread = await loadThread(actor, call.thread);
  return { call, thread };
}

async function acceptCall(actor, callId, now = Date.now()) {
  const { call, thread } = await loadCall(actor, callId);
  const side = sideOf(actor);
  if (call.from === side) throw new ValidationError('You can’t answer your own call');
  const updated = await ChatMessage.findOneAndUpdate(
    { _id: call._id, 'call.status': 'RINGING', createdAt: { $gte: new Date(now - RING_SECONDS * 1000) } },
    { $set: { 'call.status': 'ACTIVE', 'call.answeredAt': new Date(now) } },
    { new: true }
  ).lean();
  if (!updated) throw new ConflictError('This call has already ended');
  const event = { type: 'call.accepted', callId: String(call._id) };
  await Promise.all([
    realtime.publish(inboxOf(thread, call.from), event),
    realtime.publish(realtime.channels.call(call._id), event)
  ]);
  return callBundle(actor, thread, updated);
}

async function endCall(actor, callId, { reason } = {}, now = Date.now()) {
  const { call, thread } = await loadCall(actor, callId);
  const side = sideOf(actor);
  const status = call.call.status;
  if (!['RINGING', 'ACTIVE'].includes(status)) return publicMessage(call);
  let next;
  if (status === 'ACTIVE') next = 'ENDED';
  else if (call.from === side) next = reason === 'timeout' ? 'MISSED' : 'CANCELLED';
  else next = 'DECLINED';
  const seconds = status === 'ACTIVE' && call.call.answeredAt ? Math.max(0, Math.round((now - new Date(call.call.answeredAt).getTime()) / 1000)) : undefined;
  const updated = await ChatMessage.findOneAndUpdate(
    { _id: call._id, 'call.status': status },
    { $set: { 'call.status': next, 'call.endedAt': new Date(now), 'call.endedBy': side, ...(seconds !== undefined ? { 'call.seconds': seconds } : {}) } },
    { new: true }
  ).lean();
  if (!updated) return publicMessage(await ChatMessage.findById(call._id).lean());
  const event = { type: 'call.ended', callId: String(call._id), status: next };
  await Promise.all([
    realtime.publish(inboxOf(thread, 'patient'), event),
    realtime.publish(inboxOf(thread, 'provider'), event),
    realtime.publish(realtime.channels.call(call._id), event),
    realtime.publish(realtime.channels.thread(thread._id), { type: 'message', message: publicMessage(updated) })
  ]);
  return publicMessage(updated);
}

/** Cron: missed calls that nobody closed, and calls left running. */
async function sweep(now = Date.now()) {
  return settleStaleCalls(null, now);
}

/** For booking screens: the thread id for a booking, if a chat exists. */
async function threadFor(actor, kind, ref) {
  const t = await ChatThread.findOne({ kind, ref: oid(ref) }).lean();
  if (!t) return null;
  try { assertParty(actor, t); } catch { return null; }
  return t._id;
}

module.exports = {
  resolve, openThread, listThreads, getThread, send, markRead, realtimeAccess,
  startCall, acceptCall, endCall, sweep, threadFor, RING_SECONDS, KINDS
};
