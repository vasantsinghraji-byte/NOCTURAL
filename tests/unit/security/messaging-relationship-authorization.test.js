const mongoose = require('mongoose');

jest.mock('../../../middleware/auth', () => ({
  protect: jest.fn()
}));

const messageInstances = [];
const Message = jest.fn();

const conversationInstances = [];
const Conversation = jest.fn();
Conversation.findOne = jest.fn();

jest.mock('../../../models/message', () => ({
  Message,
  Conversation
}));

jest.mock('../../../models/application', () => ({
  findOne: jest.fn()
}));

jest.mock('../../../models/duty', () => ({
  find: jest.fn(),
  findOne: jest.fn()
}));

jest.mock('../../../models/user', () => ({
  exists: jest.fn()
}));

const Application = require('../../../models/application');
const Duty = require('../../../models/duty');
const User = require('../../../models/user');
const messagingRouter = require('../../../routes/messaging');
const { mockRequest, mockResponse, mockNext } = require('../../helpers');

const chainLean = (value) => ({
  select: jest.fn(() => ({
    lean: jest.fn().mockResolvedValue(value)
  }))
});

const chainDistinct = (value) => ({
  distinct: jest.fn().mockResolvedValue(value)
});

function getHandler(router, method, routePath) {
  const layer = router.stack.find(
    (l) => l.route && l.route.path === routePath && l.route.methods[method]
  );
  if (!layer) {
    throw new Error(`Route ${method.toUpperCase()} ${routePath} not found`);
  }
  const handlers = layer.route.stack;
  return handlers[handlers.length - 1].handle;
}

describe('messaging relationship authorization', () => {
  const handler = getHandler(messagingRouter, 'post', '/send');
  const senderId = new mongoose.Types.ObjectId();
  const recipientId = new mongoose.Types.ObjectId();
  const dutyId = new mongoose.Types.ObjectId();

  beforeEach(() => {
    jest.clearAllMocks();
    messageInstances.length = 0;
    conversationInstances.length = 0;
    Message.mockImplementation(function MessageModel(data) {
      Object.assign(this, data);
      this._id = new mongoose.Types.ObjectId();
      this.save = jest.fn().mockResolvedValue(this);
      this.populate = jest.fn().mockResolvedValue(this);
      messageInstances.push(this);
    });
    Conversation.mockImplementation(function ConversationModel(data) {
      Object.assign(this, data);
      this._id = new mongoose.Types.ObjectId();
      this.save = jest.fn().mockResolvedValue(this);
      this.incrementUnread = jest.fn().mockResolvedValue(this);
      conversationInstances.push(this);
    });
    User.exists.mockResolvedValue({ _id: recipientId });
    Conversation.findOne.mockResolvedValue(null);
    Duty.find.mockReturnValue(chainDistinct([]));
    Duty.findOne.mockReturnValue(chainLean(null));
    Application.findOne.mockReturnValue(chainLean(null));
  });

  it('rejects arbitrary recipients without an accepted application or assigned duty relationship', async () => {
    const req = mockRequest({
      user: { _id: senderId },
      body: {
        recipientId: recipientId.toString(),
        content: 'hello'
      }
    });
    const res = mockResponse();

    await handler(req, res, mockNext());

    expect(res.status).toHaveBeenCalledWith(403);
    expect(Message).not.toHaveBeenCalled();
    expect(Conversation).not.toHaveBeenCalled();
  });

  it('allows messaging when the recipient has an accepted application for the sender posted duty', async () => {
    Duty.find.mockReturnValueOnce(chainDistinct([dutyId]));
    Application.findOne.mockReturnValueOnce(chainLean({ duty: dutyId }));

    const req = mockRequest({
      user: { _id: senderId },
      body: {
        recipientId: recipientId.toString(),
        content: 'approved shift details',
        dutyId: dutyId.toString()
      }
    });
    const res = mockResponse();

    await handler(req, res, mockNext());

    expect(res.status).toHaveBeenCalledWith(201);
    expect(Conversation).toHaveBeenCalledWith(expect.objectContaining({
      dutyRelated: dutyId
    }));
    expect(Message).toHaveBeenCalledWith(expect.objectContaining({
      content: 'approved shift details',
      relatedDuty: dutyId
    }));
    expect(conversationInstances[0].incrementUnread).toHaveBeenCalledWith(expect.any(mongoose.Types.ObjectId));
    expect(messageInstances[0].save).toHaveBeenCalled();
  });
});
