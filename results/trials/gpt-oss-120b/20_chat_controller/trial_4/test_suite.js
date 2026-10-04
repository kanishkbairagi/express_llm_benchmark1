import { jest } from '@jest/globals';
import {
  getRoomHistory,
  sendMessage,
  ChatRoom,
  ChatMessage
} from '../dataset/20_chat_controller.js';

describe('Chat Controller - getRoomHistory', () => {
  let req;
  let res;

  beforeEach(() => {
    req = { params: {}, query: {}, user: {} };
    res = {
      status: jest.fn().mockReturnThis(),
      json: jest.fn()
    };
    jest.clearAllMocks();
  });

  test('should return 401 when authentication is missing', async () => {
    await getRoomHistory(req, res);
    expect(res.status).toHaveBeenCalledWith(401);
    expect(res.json).toHaveBeenCalledWith({
      success: false,
      error: 'Authentication required'
    });
  });

  test('should return 400 when roomId is not provided', async () => {
    req.user.id = 'user1';
    await getRoomHistory(req, res);
    expect(res.status).toHaveBeenCalledWith(400);
    expect(res.json).toHaveBeenCalledWith({
      success: false,
      error: 'Room ID is required'
    });
  });

  test('should return 404 when chat room does not exist', async () => {
    req.user.id = 'user1';
    req.params.roomId = 'roomX';
    jest.spyOn(ChatRoom, 'findById').mockResolvedValue(null);
    await getRoomHistory(req, res);
    expect(res.status).toHaveBeenCalledWith(404);
    expect(res.json).toHaveBeenCalledWith({
      success: false,
      error: 'Chat room not found'
    });
  });

  test('should return 403 when user is not a member of the room', async () => {
    req.user.id = 'user1';
    req.params.roomId = 'room1';
    jest.spyOn(ChatRoom, 'findById').mockResolvedValue({ id: 'room1' });
    jest.spyOn(ChatRoom, 'isMember').mockResolvedValue(false);
    await getRoomHistory(req, res);
    expect(res.status).toHaveBeenCalledWith(403);
    expect(res.json).toHaveBeenCalledWith({
      success: false,
      error: 'Access denied: You are not a member of this chat room'
    });
  });

  test('should return 400 for invalid limit values', async () => {
    req.user.id = 'user1';
    req.params.roomId = 'room1';
    req.query.limit = '0';
    jest.spyOn(ChatRoom, 'findById').mockResolvedValue({ id: 'room1' });
    jest.spyOn(ChatRoom, 'isMember').mockResolvedValue(true);
    await getRoomHistory(req, res);
    expect(res.status).toHaveBeenCalledWith(400);
    expect(res.json).toHaveBeenCalledWith({
      success: false,
      error: 'Limit must be an integer between 1 and 100'
    });
  });

  test('should return 400 for malformed before timestamp', async () => {
    req.user.id = 'user1';
    req.params.roomId = 'room1';
    req.query.before = 'invalid-date';
    jest.spyOn(ChatRoom, 'findById').mockResolvedValue({ id: 'room1' });
    jest.spyOn(ChatRoom, 'isMember').mockResolvedValue(true);
    await getRoomHistory(req, res);
    expect(res.status).toHaveBeenCalledWith(400);
    expect(res.json).toHaveBeenCalledWith({
      success: false,
      error: 'Invalid before timestamp format'
    });
  });

  test('should return 200 with messages and correct hasMore flag', async () => {
    req.user.id = 'user1';
    req.params.roomId = 'room1';
    req.query.limit = '3';
    const mockMessages = [
      { id: 'm1' },
      { id: 'm2' },
      { id: 'm3' }
    ];
    jest.spyOn(ChatRoom, 'findById').mockResolvedValue({ id: 'room1' });
    jest.spyOn(ChatRoom, 'isMember').mockResolvedValue(true);
    jest.spyOn(ChatMessage, 'findByRoom').mockResolvedValue(mockMessages);

    await getRoomHistory(req, res);

    expect(ChatMessage.findByRoom).toHaveBeenCalledWith('room1', {
      limit: 3,
      before: null
    });
    expect(res.status).toHaveBeenCalledWith(200);
    expect(res.json).toHaveBeenCalledWith({
      success: true,
      data: {
        roomId: 'room1',
        count: 3,
        hasMore: true,
        messages: mockMessages
      }
    });
  });

  test('should set hasMore false when fewer messages than limit', async () => {
    req.user.id = 'user1';
    req.params.roomId = 'room1';
    req.query.limit = '5';
    const mockMessages = [{ id: 'm1' }, { id: 'm2' }]; // 2 < limit
    jest.spyOn(ChatRoom, 'findById').mockResolvedValue({ id: 'room1' });
    jest.spyOn(ChatRoom, 'isMember').mockResolvedValue(true);
    jest.spyOn(ChatMessage, 'findByRoom').mockResolvedValue(mockMessages);

    await getRoomHistory(req, res);

    expect(res.status).toHaveBeenCalledWith(200);
    expect(res.json).toHaveBeenCalledWith(expect.objectContaining({
      data: expect.objectContaining({
        hasMore: false,
        count: 2,
        messages: mockMessages
      })
    }));
  });
});

describe('Chat Controller - sendMessage', () => {
  let req;
  let res;

  beforeEach(() => {
    req = { params: {}, body: {}, user: {} };
    res = {
      status: jest.fn().mockReturnThis(),
      json: jest.fn()
    };
    jest.clearAllMocks();
  });

  test('should return 401 when authentication is missing', async () => {
    await sendMessage(req, res);
    expect(res.status).toHaveBeenCalledWith(401);
    expect(res.json).toHaveBeenCalledWith({
      success: false,
      error: 'Authentication required'
    });
  });

  test('should return 400 when roomId is missing', async () => {
    req.user.id = 'user1';
    req.body.content = 'Hello';
    await sendMessage(req, res);
    expect(res.status).toHaveBeenCalledWith(400);
    expect(res.json).toHaveBeenCalledWith({
      success: false,
      error: 'Room ID is required'
    });
  });

  test('should return 400 when both content and attachment are absent', async () => {
    req.user.id = 'user1';
    req.params.roomId = 'room1';
    await sendMessage(req, res);
    expect(res.status).toHaveBeenCalledWith(400);
    expect(res.json).toHaveBeenCalledWith({
      success: false,
      error: 'Message must contain either text content or an attachment'
    });
  });

  test('should return 400 when content exceeds 2000 characters', async () => {
    req.user.id = 'user1';
    req.params.roomId = 'room1';
    req.body.content = 'a'.repeat(2001);
    await sendMessage(req, res);
    expect(res.status).toHaveBeenCalledWith(400);
    expect(res.json).toHaveBeenCalledWith({
      success: false,
      error: 'Message text cannot exceed 2000 characters'
    });
  });

  test('should return 404 when chat room does not exist', async () => {
    req.user.id = 'user1';
    req.params.roomId = 'roomX';
    req.body.content = 'Hello';
    jest.spyOn(ChatRoom, 'findById').mockResolvedValue(null);
    await sendMessage(req, res);
    expect(res.status).toHaveBeenCalledWith(404);
    expect(res.json).toHaveBeenCalledWith({
      success: false,
      error: 'Chat room not found'
    });
  });

  test('should return 400 when room is archived', async () => {
    req.user.id = 'user1';
    req.params.roomId = 'room1';
    req.body.content = 'Hello';
    jest.spyOn(ChatRoom, 'findById').mockResolvedValue({ id: 'room1', isArchived: true });
    await sendMessage(req, res);
    expect(res.status).toHaveBeenCalledWith(400);
    expect(res.json).toHaveBeenCalledWith({
      success: false,
      error: 'Cannot send messages in an archived room'
    });
  });

  test('should return 403 when user is not a member', async () => {
    req.user.id = 'user1';
    req.params.roomId = 'room1';
    req.body.content = 'Hi';
    jest.spyOn(ChatRoom, 'findById').mockResolvedValue({ id: 'room1', isArchived: false });
    jest.spyOn(ChatRoom, 'isMember').mockResolvedValue(false);
    await sendMessage(req, res);
    expect(res.status).toHaveBeenCalledWith(403);
    expect(res.json).toHaveBeenCalledWith({
      success: false,
      error: 'You do not have permission to post in this room'
    });
  });

  test('should successfully send a text message', async () => {
    req.user.id = 'user1';
    req.params.roomId = 'room1';
    req.body.content = 'Hello world';
    jest.spyOn(ChatRoom, 'findById').mockResolvedValue({ id: 'room1', isArchived: false });
    jest.spyOn(ChatRoom, 'isMember').mockResolvedValue(true);
    const mockMessage = { id: 'msg123', roomId: 'room1', senderId: 'user1', content: 'Hello world', attachmentUrl: null };
    jest.spyOn(ChatMessage, 'create').mockResolvedValue(mockMessage);
    jest.spyOn(ChatRoom, 'updateLastActivity').mockResolvedValue(true);

    await sendMessage(req, res);

    expect(ChatMessage.create).toHaveBeenCalledWith({
      roomId: 'room1',
      senderId: 'user1',
      content: 'Hello world',
      attachmentUrl: null
    });
    expect(ChatRoom.updateLastActivity).toHaveBeenCalledWith('room1', expect.any(Date));
    expect(res.status).toHaveBeenCalledWith(201);
    expect(res.json).toHaveBeenCalledWith({
      success: true,
      data: mockMessage
    });
  });

  test('should successfully send a message with attachment only', async () => {
    req.user.id = 'user1';
    req.params.roomId = 'room1';
    req.body.attachmentUrl = 'http://example.com/image.png';
    jest.spyOn(ChatRoom, 'findById').mockResolvedValue({ id: 'room1', isArchived: false });
    jest.spyOn(ChatRoom, 'isMember').mockResolvedValue(true);
    const mockMessage = { id: 'msg124', roomId: 'room1', senderId: 'user1', content: null, attachmentUrl: 'http://example.com/image.png' };
    jest.spyOn(ChatMessage, 'create').mockResolvedValue(mockMessage);
    jest.spyOn(ChatRoom, 'updateLastActivity').mockResolvedValue(true);

    await sendMessage(req, res);

    expect(ChatMessage.create).toHaveBeenCalledWith({
      roomId: 'room1',
      senderId: 'user1',
      content: null,
      attachmentUrl: 'http://example.com/image.png'
    });
    expect(res.status).toHaveBeenCalledWith(201);
    expect(res.json).toHaveBeenCalledWith({
      success: true,
      data: mockMessage
    });
  });
});