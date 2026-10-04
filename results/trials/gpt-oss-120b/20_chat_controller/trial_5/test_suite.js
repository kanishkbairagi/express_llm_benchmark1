import { jest } from '@jest/globals';
import {
  getRoomHistory,
  sendMessage,
  ChatRoom,
  ChatMessage
} from '../dataset/20_chat_controller.js';

describe('Chat Controller - getRoomHistory', () => {
  const makeRes = () => {
    const res = {};
    res.status = jest.fn().mockReturnValue(res);
    res.json = jest.fn().mockReturnValue(res);
    return res;
  };

  beforeEach(() => {
    jest.clearAllMocks();
  });

  test('should return 401 when user is not authenticated', async () => {
    const req = { params: { roomId: 'room1' }, query: {} };
    const res = makeRes();

    await getRoomHistory(req, res);

    expect(res.status).toHaveBeenCalledWith(401);
    expect(res.json).toHaveBeenCalledWith({
      success: false,
      error: 'Authentication required'
    });
  });

  test('should return 400 when roomId is missing', async () => {
    const req = { params: {}, query: {}, user: { id: 'u1' } };
    const res = makeRes();

    await getRoomHistory(req, res);

    expect(res.status).toHaveBeenCalledWith(400);
    expect(res.json).toHaveBeenCalledWith({
      success: false,
      error: 'Room ID is required'
    });
  });

  test('should return 404 when chat room does not exist', async () => {
    const req = { params: { roomId: 'roomX' }, query: {}, user: { id: 'u1' } };
    const res = makeRes();

    ChatRoom.findById = jest.fn().mockResolvedValue(null);

    await getRoomHistory(req, res);

    expect(ChatRoom.findById).toHaveBeenCalledWith('roomX');
    expect(res.status).toHaveBeenCalledWith(404);
    expect(res.json).toHaveBeenCalledWith({
      success: false,
      error: 'Chat room not found'
    });
  });

  test('should return 403 when user is not a member', async () => {
    const req = { params: { roomId: 'room1' }, query: {}, user: { id: 'u1' } };
    const res = makeRes();

    ChatRoom.findById = jest.fn().mockResolvedValue({ id: 'room1' });
    ChatRoom.isMember = jest.fn().mockResolvedValue(false);

    await getRoomHistory(req, res);

    expect(ChatRoom.isMember).toHaveBeenCalledWith('room1', 'u1');
    expect(res.status).toHaveBeenCalledWith(403);
    expect(res.json).toHaveBeenCalledWith({
      success: false,
      error: 'Access denied: You are not a member of this chat room'
    });
  });

  test('should return 400 for invalid limit values', async () => {
    const req = {
      params: { roomId: 'room1' },
      query: { limit: '0' },
      user: { id: 'u1' }
    };
    const res = makeRes();

    ChatRoom.findById = jest.fn().mockResolvedValue({ id: 'room1' });
    ChatRoom.isMember = jest.fn().mockResolvedValue(true);

    await getRoomHistory(req, res);

    expect(res.status).toHaveBeenCalledWith(400);
    expect(res.json).toHaveBeenCalledWith({
      success: false,
      error: 'Limit must be an integer between 1 and 100'
    });
  });

  test('should return 400 for malformed before timestamp', async () => {
    const req = {
      params: { roomId: 'room1' },
      query: { before: 'invalid-date' },
      user: { id: 'u1' }
    };
    const res = makeRes();

    ChatRoom.findById = jest.fn().mockResolvedValue({ id: 'room1' });
    ChatRoom.isMember = jest.fn().mockResolvedValue(true);

    await getRoomHistory(req, res);

    expect(res.status).toHaveBeenCalledWith(400);
    expect(res.json).toHaveBeenCalledWith({
      success: false,
      error: 'Invalid before timestamp format'
    });
  });

  test('should successfully return messages with correct pagination flags', async () => {
    const messages = Array.from({ length: 5 }, (_, i) => ({
      id: `msg${i}`,
      content: `hello ${i}`
    }));
    const req = {
      params: { roomId: 'room1' },
      query: { limit: '5' },
      user: { id: 'u1' }
    };
    const res = makeRes();

    ChatRoom.findById = jest.fn().mockResolvedValue({ id: 'room1' });
    ChatRoom.isMember = jest.fn().mockResolvedValue(true);
    ChatMessage.findByRoom = jest.fn().mockResolvedValue(messages);

    await getRoomHistory(req, res);

    expect(ChatMessage.findByRoom).toHaveBeenCalledWith('room1', {
      limit: 5,
      before: null
    });
    expect(res.status).toHaveBeenCalledWith(200);
    expect(res.json).toHaveBeenCalledWith({
      success: true,
      data: {
        roomId: 'room1',
        count: 5,
        hasMore: false,
        messages
      }
    });
  });
});

describe('Chat Controller - sendMessage', () => {
  const makeRes = () => {
    const res = {};
    res.status = jest.fn().mockReturnValue(res);
    res.json = jest.fn().mockReturnValue(res);
    return res;
  };

  beforeEach(() => {
    jest.clearAllMocks();
  });

  test('should return 401 when sender is unauthenticated', async () => {
    const req = { params: { roomId: 'room1' }, body: { content: 'hi' } };
    const res = makeRes();

    await sendMessage(req, res);

    expect(res.status).toHaveBeenCalledWith(401);
    expect(res.json).toHaveBeenCalledWith({
      success: false,
      error: 'Authentication required'
    });
  });

  test('should return 400 when roomId is missing', async () => {
    const req = { params: {}, body: { content: 'hi' }, user: { id: 'u1' } };
    const res = makeRes();

    await sendMessage(req, res);

    expect(res.status).toHaveBeenCalledWith(400);
    expect(res.json).toHaveBeenCalledWith({
      success: false,
      error: 'Room ID is required'
    });
  });

  test('should return 400 when both content and attachment are absent', async () => {
    const req = { params: { roomId: 'room1' }, body: {}, user: { id: 'u1' } };
    const res = makeRes();

    await sendMessage(req, res);

    expect(res.status).toHaveBeenCalledWith(400);
    expect(res.json).toHaveBeenCalledWith({
      success: false,
      error: 'Message must contain either text content or an attachment'
    });
  });

  test('should return 400 when content exceeds 2000 characters', async () => {
    const longText = 'a'.repeat(2001);
    const req = {
      params: { roomId: 'room1' },
      body: { content: longText },
      user: { id: 'u1' }
    };
    const res = makeRes();

    await sendMessage(req, res);

    expect(res.status).toHaveBeenCalledWith(400);
    expect(res.json).toHaveBeenCalledWith({
      success: false,
      error: 'Message text cannot exceed 2000 characters'
    });
  });

  test('should return 404 when chat room does not exist', async () => {
    const req = {
      params: { roomId: 'roomX' },
      body: { content: 'hello' },
      user: { id: 'u1' }
    };
    const res = makeRes();

    ChatRoom.findById = jest.fn().mockResolvedValue(null);

    await sendMessage(req, res);

    expect(ChatRoom.findById).toHaveBeenCalledWith('roomX');
    expect(res.status).toHaveBeenCalledWith(404);
    expect(res.json).toHaveBeenCalledWith({
      success: false,
      error: 'Chat room not found'
    });
  });

  test('should return 400 when room is archived', async () => {
    const req = {
      params: { roomId: 'room1' },
      body: { content: 'hello' },
      user: { id: 'u1' }
    };
    const res = makeRes();

    ChatRoom.findById = jest.fn().mockResolvedValue({ id: 'room1', isArchived: true });

    await sendMessage(req, res);

    expect(res.status).toHaveBeenCalledWith(400);
    expect(res.json).toHaveBeenCalledWith({
      success: false,
      error: 'Cannot send messages in an archived room'
    });
  });

  test('should return 403 when sender is not a member of the room', async () => {
    const req = {
      params: { roomId: 'room1' },
      body: { content: 'hi' },
      user: { id: 'u1' }
    };
    const res = makeRes();

    ChatRoom.findById = jest.fn().mockResolvedValue({ id: 'room1', isArchived: false });
    ChatRoom.isMember = jest.fn().mockResolvedValue(false);

    await sendMessage(req, res);

    expect(ChatRoom.isMember).toHaveBeenCalledWith('room1', 'u1');
    expect(res.status).toHaveBeenCalledWith(403);
    expect(res.json).toHaveBeenCalledWith({
      success: false,
      error: 'You do not have permission to post in this room'
    });
  });

  test('should successfully create a message and update activity', async () => {
    const req = {
      params: { roomId: 'room1' },
      body: { content: '  hello world  ', attachmentUrl: '  http://img.com/pic.png  ' },
      user: { id: 'u1' }
    };
    const res = makeRes();

    const fakeMessage = { id: 'msg123', roomId: 'room1', senderId: 'u1', content: 'hello world', attachmentUrl: 'http://img.com/pic.png' };

    ChatRoom.findById = jest.fn().mockResolvedValue({ id: 'room1', isArchived: false });
    ChatRoom.isMember = jest.fn().mockResolvedValue(true);
    ChatMessage.create = jest.fn().mockResolvedValue(fakeMessage);
    ChatRoom.updateLastActivity = jest.fn().mockResolvedValue(true);

    await sendMessage(req, res);

    expect(ChatMessage.create).toHaveBeenCalledWith({
      roomId: 'room1',
      senderId: 'u1',
      content: 'hello world',
      attachmentUrl: 'http://img.com/pic.png'
    });
    expect(ChatRoom.updateLastActivity).toHaveBeenCalledWith('room1', expect.any(Date));
    expect(res.status).toHaveBeenCalledWith(201);
    expect(res.json).toHaveBeenCalledWith({
      success: true,
      data: fakeMessage
    });
  });
});