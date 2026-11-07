/**
 * Chat and in-app voice calls between a customer and their provider
 * (services/chatService.js). Customers and partners use the same routes.
 *
 *   GET  /chat/threads                 my conversations
 *   POST /chat/threads                 open the conversation for a booking { kind, ref }
 *   GET  /chat/threads/:id             conversation + messages (?before=<iso> for older)
 *   POST /chat/threads/:id/messages    send { text }
 *   POST /chat/threads/:id/read        mark read
 *   GET  /chat/unread                  unread count (badge)
 *   GET  /chat/realtime                live-connection token (?thread=<id>)
 *   POST /chat/threads/:id/calls       start a voice call
 *   POST /chat/calls/:id/accept        answer
 *   POST /chat/calls/:id/end           hang up / decline / cancel { reason?: 'timeout' }
 */

const express = require('express');
const { body, param, query } = require('express-validator');
const { validate } = require('../middleware/validation');
const { protectBoth } = require('../middleware/patientAuth');
const chat = require('../services/chatService');
const ChatThread = require('../models/chatThread');

const router = express.Router();
const wrap = (fn) => async (req, res, next) => {
  try {
    await fn(req, res);
  } catch (error) {
    next(error);
  }
};
const actorOf = (req) => ({ kind: req.userType === 'patient' ? 'patient' : 'user', id: req.user._id, role: req.user.role });
const id = (name) => param(name).isMongoId().withMessage('Invalid id');

router.use(protectBoth);

router.get('/threads', wrap(async (req, res) => res.json({ success: true, threads: await chat.listThreads(actorOf(req)) })));

router.post('/threads', [body('kind').isIn(chat.KINDS), body('ref').isMongoId()], validate,
  wrap(async (req, res) => res.json({ success: true, thread: await chat.openThread(actorOf(req), req.body) })));

router.get('/unread', wrap(async (req, res) => {
  const a = actorOf(req);
  const field = a.kind === 'patient' ? 'patient' : 'provider';
  const [row] = await ChatThread.aggregate([{ $match: { [field]: a.id } }, { $group: { _id: null, n: { $sum: `$unread.${field}` } } }]);
  res.json({ success: true, unread: row ? row.n : 0 });
}));

router.get('/realtime', [query('thread').optional().isMongoId()], validate, wrap(async (req, res) => {
  res.set('Cache-Control', 'no-store');
  res.json({ success: true, realtime: await chat.realtimeAccess(actorOf(req), { threadId: req.query.thread }) });
}));

router.get('/threads/:id', [id('id'), query('before').optional().isISO8601()], validate,
  wrap(async (req, res) => res.json({ success: true, ...(await chat.getThread(actorOf(req), req.params.id, req.query)) })));

router.post('/threads/:id/messages', [id('id'), body('text').isString().isLength({ min: 1, max: 2000 })], validate,
  wrap(async (req, res) => res.status(201).json({ success: true, message: await chat.send(actorOf(req), req.params.id, req.body.text) })));

router.post('/threads/:id/read', [id('id')], validate, wrap(async (req, res) => {
  await chat.markRead(actorOf(req), req.params.id);
  res.json({ success: true });
}));

router.post('/threads/:id/calls', [id('id')], validate, wrap(async (req, res) => {
  res.set('Cache-Control', 'no-store');
  res.status(201).json({ success: true, ...(await chat.startCall(actorOf(req), req.params.id)) });
}));

router.post('/calls/:id/accept', [id('id')], validate, wrap(async (req, res) => {
  res.set('Cache-Control', 'no-store');
  res.json({ success: true, ...(await chat.acceptCall(actorOf(req), req.params.id)) });
}));

router.post('/calls/:id/end', [id('id'), body('reason').optional().isIn(['timeout', 'hangup', 'decline', 'failed'])], validate,
  wrap(async (req, res) => res.json({ success: true, call: await chat.endCall(actorOf(req), req.params.id, req.body) })));

module.exports = router;
