import { jest } from '@jest/globals';
import {
  getRoomHistory,
  sendMessage,
  ChatRoom,
  ChatMessage
} from '../dataset/20_chat_controller.js';

const mockRes = () => {
  const res = {};
  res.status = jest.fn().mockReturnValue(res);
  res.json = jest.fn().mockReturnValue(res);
  return res;
};

describe('getRoomHistory', () => {
  const defaultReq = {
    params: { roomId: 'room1' },
    query: { limit: '10' },
    user: { id: 'user1' }
  };

  beforeEach(() => {
    jest.clearAllMocks();
    ChatRoom.findById = jest.fn().mockResolvedValue({ id: 'room1' });
    ChatRoom.isMember = jest.fn().mockResolvedValue(true);
    ChatMessage.findByRoom = jest.fn().mockResolvedValue([]);
  });

  test('returns 401 when authentication is missing', async () => {
    const req = { ...defaultReq, user: undefined, query: {} };
    const res = mockRes();

    await getRoomHistory(req, res);
    expect(res.status).toHaveBeenCalledWith(401);
    expect(res.json).toHaveBeenCalledWith({
      success: false,
      error: 'Authentication required'
    });
  });

  test('returns 400 when roomId is missing', async () => {
    const req = { ...defaultReq, params: {} };
    const res = mockRes();

    await getRoomHistory(req, res);
    expect(res.status).toHaveBeenCalledWith(400);
    expect(res.json).toHaveBeenCalledWith({
      success: false,
      error: 'Room ID is required'
    });
  });

  test('returns 404 when room does not exist', async () => {
    ChatRoom.findById.mockResolvedValue(null);
    const req = { ...defaultReq };
    const res = mockRes();

    await getRoomHistory(req, res);
    expect(res.status).toHaveBeenCalledWith(404);
    expect(res.json).toHaveBeenCalledWith({
      success: false,
      error: 'Chat room not found'
    });
  });

  test('returns 403 when user is not a member', async () => {
    ChatRoom.isMember.mockResolvedValue(false);
    const req = { ...defaultReq };
    const res = mockRes();

    await getRoomHistory(req, res);
    expect(res.status).toHaveBeenCalledWith(403);
    expect(res.json).toHaveBeenCalledWith({
      success: false,
      error: 'Access denied: You are not a member of this chat room'
    });
  });

  test('returns 400 for invalid limit values', async () => {
    const req = { ...defaultReq, query: { limit: '0' } };
    const res = mockRes();

    await getRoomHistory(req, res);
    expect(res.status).toHaveBeenCalledWith(400);
    expect(res.json).toHaveBeenCalledWith({
      success: false,
      error: 'Limit must be an integer between 1 and 100'
    });
  });

  test('returns 400 for malformed before timestamp', async () => {
    const req = { ...defaultReq, query: { limit: '10', before: 'not-a-date' } };
    const res = mockRes();

    await getRoomHistory(req, res);
    expect(res.status).toHaveBeenCalledWith(400);
    expect(res.json).toHaveBeenCalledWith({
      success: false,
      error: 'Invalid before timestamp format'
    });
  });

  test('returns messages with hasMore true when limit reached', async () => {
    const msgs = Array.from({ length: 10 }, (_, i) => ({ id: `msg${i}` }));
    ChatMessage.findByRoom.mockResolvedValue(msgs);
    const req = { ...defaultReq, query: { limit: '10' } };
    const res = mockRes();

    await getRoomHistory(req, res);
    expect(ChatMessage.findByRoom).toHaveBeenCalledWith('room1', {
      limit: 10,
      before: null
    });
    expect(res.status).toHaveBeenCalledWith(200);
    expect(res.json).toHaveBeenCalledWith({
      success: true,
      data: {
        roomId: 'room1',
        count: 10,
        hasMore: true,
        messages: msgs
      }
    });
  });

  test('returns messages with hasMore false when fewer than limit', async () => {
    const msgs = [{ id: 'msg1' }, { id: 'msg2' }];
    ChatMessage.findByRoom.mockResolvedValue(msgs);
    const req = { ...defaultReq, query: { limit: '5' } };
    const res = mockRes();

    await getRoomHistory(req, res);
    expect(res.status).toHaveBeenCalledWith(200);
    expect(res.json.mock.calls[0][0].data).toMatchObject({
      count: 2,
      hasMore: false,
      messages: msgs
    });
  });
});

describe('sendMessage', () => {
  const defaultReq = {
    params: { roomId: 'room1' },
    body: { content: 'Hello', attachmentUrl: '' },
    user: { id: 'user1' }
  };

  beforeEach(() => {
    jest.clearAllMocks();
    ChatRoom.findById = jest.fn().mockResolvedValue({ id: 'room1', isArchived: false });
    ChatRoom.isMember = jest.fn().mockResolvedValue(true);
    ChatMessage.create = jest.fn().mockImplementation((data) =>
      Promise.resolve({ id: 'msg123', ...data, createdAt: new Date() })
    );
    ChatRoom.updateLastActivity = jest.fn().mockResolvedValue(true);
  });

  test('returns 401 when authentication is missing', async () => {
    const req = { ...defaultReq, user: undefined, body: { ...defaultReq.body, senderId: undefined } };
    const res = mockRes();

    await sendMessage(req, res);
    expect(res.status).toHaveBeenCalledWith(401);
    expect(res.json).toHaveBeenCalledWith({
      success: false,
      error: 'Authentication required'
    });
  });

  test('returns 400 when roomId is missing', async () => {
    const req = { ...defaultReq, params: {} };
    const res = mockRes();

    await sendMessage(req, res);
    expect(res.status).toHaveBeenCalledWith(400);
    expect(res.json).toHaveBeenCalledWith({
      success: false,
      error: 'Room ID is required'
    });
  });

  test('returns 400 when both content and attachment are empty', async () => {
    const req = {
      ...defaultReq,
      body: { content: '   ', attachmentUrl: '   ' }
    };
    const res = mockRes();

    await sendMessage(req, res);
    expect(res.status).toHaveBeenCalledWith(400);
    expect(res.json).toHaveBeenCalledWith({
      success: false,
      error: 'Message must contain either text content or an attachment'
    });
  });

  test('returns 400 when content exceeds 2000 characters', async () => {
    const longText = 'a'.repeat(2001);
    const req = {
      ...defaultReq,
      body: { content: longText, attachmentUrl: '' }
    };
    const res = mockRes();

    await sendMessage(req, res);
    expect(res.status).toHaveBeenCalledWith(400);
    expect(res.json).toHaveBeenCalledWith({
      success: false,
      error: 'Message text cannot exceed 2000 characters'
    });
  });

  test('returns 404 when chat room does not exist', async () => {
    ChatRoom.findById.mockResolvedValue(null);
    const req = { ...defaultReq };
    const res = mockRes();

    await sendMessage(req, res);
    expect(res.status).toHaveBeenCalledWith(404);
    expect(res.json).toHaveBeenCalledWith({
      success: false,
      error: 'Chat room not found'
    });
  });

  test('returns 400 when room is archived', async () => {
    ChatRoom.findById.mockResolvedValue({ id: 'room1', isArchived: true });
    const req = { ...defaultReq };
    const res = mockRes();

    await sendMessage(req, res);
    expect(res.status).toHaveBeenCalledWith(400);
    expect(res.json).toHaveBeenCalledWith({
      success: false,
      error: 'Cannot send messages in an archived room'
    });
  });

  test('returns 403 when user is not a member', async () => {
    ChatRoom.isMember.mockResolvedValue(false);
    const req = { ...defaultReq };
    const res = mockRes();

    await sendMessage(req, res);
    expect(res.status).toHaveBeenCalledWith(403);
    expect(res.json).toHaveBeenCalledWith({
      success: false,
      error: 'You do not have permission to post in this room'
    });
  });

  test('creates a message and returns 201 on success (text only)', async () => {
    const req = { ...defaultReq };
    const res = mockRes();

    await sendMessage(req, res);
    expect(ChatMessage.create).toHaveBeenCalledWith({
      roomId: 'room1',
      senderId: 'user1',
      content: 'Hello',
      attachmentUrl: null
    });
    expect(ChatRoom.updateLastActivity).toHaveBeenCalled();
    expect(res.status).toHaveBeenCalledWith(201);
    const jsonPayload = res.json.mock.calls[0][0];
    expect(jsonPayload.success).toBe(true);
    expect(jsonPayload.data).toMatchObject({
      roomId: 'room1',
      senderId: 'user1',
      content: 'Hello',
      attachmentUrl: null
    });
  });

  test('creates a message with attachment only', async () => {
    const req = {
      ...defaultReq,
      body: { content: '', attachmentUrl: 'http://example.com/file.png' }
    };
    const res = mockRes();

    await sendMessage(req, res);
    expect(ChatMessage.create).toHaveBeenCalledWith({
      roomId: 'room1',
      senderId: 'user1',
      content: null,
      attachmentUrl: 'http://example.com/file.png'
    });
    expect(res.status).toHaveBeenCalledWith(201);
  });
});