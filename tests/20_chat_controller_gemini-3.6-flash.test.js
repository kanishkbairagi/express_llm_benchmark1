import { jest } from '@jest/globals';
import { getRoomHistory, sendMessage, ChatRoom, ChatMessage } from '../dataset/20_chat_controller.js';

describe('20_chat_controller.js', () => {
  let req;
  let res;

  beforeEach(() => {
    req = {
      params: {},
      query: {},
      body: {},
      user: null
    };

    res = {
      status: jest.fn().mockReturnThis(),
      json: jest.fn().mockReturnThis()
    };

    jest.restoreAllMocks();
  });

  describe('getRoomHistory', () => {
    test('should return 401 if user is not authenticated', async () => {
      req.params = { roomId: 'room123' };

      await getRoomHistory(req, res);

      expect(res.status).toHaveBeenCalledWith(401);
      expect(res.json).toHaveBeenCalledWith({
        success: false,
        error: 'Authentication required'
      });
    });

    test('should return 400 if roomId is missing', async () => {
      req.user = { id: 'user123' };

      await getRoomHistory(req, res);

      expect(res.status).toHaveBeenCalledWith(400);
      expect(res.json).toHaveBeenCalledWith({
        success: false,
        error: 'Room ID is required'
      });
    });

    test('should return 404 if chat room does not exist', async () => {
      req.user = { id: 'user123' };
      req.params = { roomId: 'room123' };
      jest.spyOn(ChatRoom, 'findById').mockResolvedValue(null);

      await getRoomHistory(req, res);

      expect(ChatRoom.findById).toHaveBeenCalledWith('room123');
      expect(res.status).toHaveBeenCalledWith(404);
      expect(res.json).toHaveBeenCalledWith({
        success: false,
        error: 'Chat room not found'
      });
    });

    test('should return 403 if user is not a member of the room', async () => {
      req.query = { userId: 'user123' };
      req.params = { roomId: 'room123' };
      jest.spyOn(ChatRoom, 'findById').mockResolvedValue({ id: 'room123' });
      jest.spyOn(ChatRoom, 'isMember').mockResolvedValue(false);

      await getRoomHistory(req, res);

      expect(ChatRoom.isMember).toHaveBeenCalledWith('room123', 'user123');
      expect(res.status).toHaveBeenCalledWith(403);
      expect(res.json).toHaveBeenCalledWith({
        success: false,
        error: 'Access denied: You are not a member of this chat room'
      });
    });

    test.each([
      ['invalid_string', 'limit is NaN'],
      ['0', 'limit is less than 1'],
      ['101', 'limit is greater than 100']
    ])('should return 400 when limit is invalid: %s', async (limitValue) => {
      req.user = { id: 'user123' };
      req.params = { roomId: 'room123' };
      req.query = { limit: limitValue };

      jest.spyOn(ChatRoom, 'findById').mockResolvedValue({ id: 'room123' });
      jest.spyOn(ChatRoom, 'isMember').mockResolvedValue(true);

      await getRoomHistory(req, res);

      expect(res.status).toHaveBeenCalledWith(400);
      expect(res.json).toHaveBeenCalledWith({
        success: false,
        error: 'Limit must be an integer between 1 and 100'
      });
    });

    test('should return 400 if before timestamp is invalid', async () => {
      req.user = { id: 'user123' };
      req.params = { roomId: 'room123' };
      req.query = { before: 'invalid-date' };

      jest.spyOn(ChatRoom, 'findById').mockResolvedValue({ id: 'room123' });
      jest.spyOn(ChatRoom, 'isMember').mockResolvedValue(true);

      await getRoomHistory(req, res);

      expect(res.status).toHaveBeenCalledWith(400);
      expect(res.json).toHaveBeenCalledWith({
        success: false,
        error: 'Invalid before timestamp format'
      });
    });

    test('should return 200 and messages with pagination info', async () => {
      req.user = { id: 'user123' };
      req.params = { roomId: 'room123' };
      req.query = { limit: '2', before: '2023-01-01T00:00:00.000Z' };

      const mockMessages = [
        { id: 'msg1', content: 'hello' },
        { id: 'msg2', content: 'world' }
      ];

      jest.spyOn(ChatRoom, 'findById').mockResolvedValue({ id: 'room123' });
      jest.spyOn(ChatRoom, 'isMember').mockResolvedValue(true);
      jest.spyOn(ChatMessage, 'findByRoom').mockResolvedValue(mockMessages);

      await getRoomHistory(req, res);

      expect(ChatMessage.findByRoom).toHaveBeenCalledWith('room123', {
        limit: 2,
        before: new Date('2023-01-01T00:00:00.000Z')
      });
      expect(res.status).toHaveBeenCalledWith(200);
      expect(res.json).toHaveBeenCalledWith({
        success: true,
        data: {
          roomId: 'room123',
          count: 2,
          hasMore: true,
          messages: mockMessages
        }
      });
    });

    test('should set hasMore to false when returned messages count is less than limit', async () => {
      req.user = { id: 'user123' };
      req.params = { roomId: 'room123' };

      const mockMessages = [{ id: 'msg1', content: 'hello' }];

      jest.spyOn(ChatRoom, 'findById').mockResolvedValue({ id: 'room123' });
      jest.spyOn(ChatRoom, 'isMember').mockResolvedValue(true);
      jest.spyOn(ChatMessage, 'findByRoom').mockResolvedValue(mockMessages);

      await getRoomHistory(req, res);

      expect(res.status).toHaveBeenCalledWith(200);
      expect(res.json).toHaveBeenCalledWith({
        success: true,
        data: {
          roomId: 'room123',
          count: 1,
          hasMore: false,
          messages: mockMessages
        }
      });
    });

    test('should return 500 if an exception occurs', async () => {
      req.user = { id: 'user123' };
      req.params = { roomId: 'room123' };

      jest.spyOn(ChatRoom, 'findById').mockRejectedValue(new Error('Database connection failed'));

      await getRoomHistory(req, res);

      expect(res.status).toHaveBeenCalledWith(500);
      expect(res.json).toHaveBeenCalledWith({
        success: false,
        error: 'Failed to retrieve chat history',
        details: 'Database connection failed'
      });
    });
  });

  describe('sendMessage', () => {
    test('should return 401 if user/sender is not provided', async () => {
      req.params = { roomId: 'room123' };

      await sendMessage(req, res);

      expect(res.status).toHaveBeenCalledWith(401);
      expect(res.json).toHaveBeenCalledWith({
        success: false,
        error: 'Authentication required'
      });
    });

    test('should return 400 if roomId is missing', async () => {
      req.body = { senderId: 'user123', content: 'Hello' };

      await sendMessage(req, res);

      expect(res.status).toHaveBeenCalledWith(400);
      expect(res.json).toHaveBeenCalledWith({
        success: false,
        error: 'Room ID is required'
      });
    });

    test('should return 400 if neither content nor attachmentUrl is provided', async () => {
      req.user = { id: 'user123' };
      req.params = { roomId: 'room123' };
      req.body = { content: '   ', attachmentUrl: '' };

      await sendMessage(req, res);

      expect(res.status).toHaveBeenCalledWith(400);
      expect(res.json).toHaveBeenCalledWith({
        success: false,
        error: 'Message must contain either text content or an attachment'
      });
    });

    test('should return 400 if content exceeds 2000 characters', async () => {
      req.user = { id: 'user123' };
      req.params = { roomId: 'room123' };
      req.body = { content: 'a'.repeat(2001) };

      await sendMessage(req, res);

      expect(res.status).toHaveBeenCalledWith(400);
      expect(res.json).toHaveBeenCalledWith({
        success: false,
        error: 'Message text cannot exceed 2000 characters'
      });
    });

    test('should return 404 if chat room is not found', async () => {
      req.user = { id: 'user123' };
      req.params = { roomId: 'room123' };
      req.body = { content: 'Valid message' };

      jest.spyOn(ChatRoom, 'findById').mockResolvedValue(null);

      await sendMessage(req, res);

      expect(res.status).toHaveBeenCalledWith(404);
      expect(res.json).toHaveBeenCalledWith({
        success: false,
        error: 'Chat room not found'
      });
    });

    test('should return 400 if room is archived', async () => {
      req.user = { id: 'user123' };
      req.params = { roomId: 'room123' };
      req.body = { content: 'Valid message' };

      jest.spyOn(ChatRoom, 'findById').mockResolvedValue({ id: 'room123', isArchived: true });

      await sendMessage(req, res);

      expect(res.status).toHaveBeenCalledWith(400);
      expect(res.json).toHaveBeenCalledWith({
        success: false,
        error: 'Cannot send messages in an archived room'
      });
    });

    test('should return 403 if sender is not a member of the room', async () => {
      req.user = { id: 'user123' };
      req.params = { roomId: 'room123' };
      req.body = { content: 'Valid message' };

      jest.spyOn(ChatRoom, 'findById').mockResolvedValue({ id: 'room123', isArchived: false });
      jest.spyOn(ChatRoom, 'isMember').mockResolvedValue(false);

      await sendMessage(req, res);

      expect(res.status).toHaveBeenCalledWith(403);
      expect(res.json).toHaveBeenCalledWith({
        success: false,
        error: 'You do not have permission to post in this room'
      });
    });

    test('should return 201 and update last activity on successful message creation', async () => {
      req.user = { id: 'user123' };
      req.params = { roomId: 'room123' };
      req.body = { content: '  Hello world  ', attachmentUrl: '  http://example.com/file.png  ' };

      const createdMessage = {
        id: 'msg_1',
        roomId: 'room123',
        senderId: 'user123',
        content: 'Hello world',
        attachmentUrl: 'http://example.com/file.png'
      };

      jest.spyOn(ChatRoom, 'findById').mockResolvedValue({ id: 'room123', isArchived: false });
      jest.spyOn(ChatRoom, 'isMember').mockResolvedValue(true);
      jest.spyOn(ChatMessage, 'create').mockResolvedValue(createdMessage);
      jest.spyOn(ChatRoom, 'updateLastActivity').mockResolvedValue(true);

      await sendMessage(req, res);

      expect(ChatMessage.create).toHaveBeenCalledWith({
        roomId: 'room123',
        senderId: 'user123',
        content: 'Hello world',
        attachmentUrl: 'http://example.com/file.png'
      });
      expect(ChatRoom.updateLastActivity).toHaveBeenCalledWith('room123', expect.any(Date));
      expect(res.status).toHaveBeenCalledWith(201);
      expect(res.json).toHaveBeenCalledWith({
        success: true,
        data: createdMessage
      });
    });

    test('should send message with only an attachmentUrl', async () => {
      req.user = { id: 'user123' };
      req.params = { roomId: 'room123' };
      req.body = { attachmentUrl: 'http://example.com/file.png' };

      const createdMessage = {
        id: 'msg_2',
        roomId: 'room123',
        senderId: 'user123',
        content: null,
        attachmentUrl: 'http://example.com/file.png'
      };

      jest.spyOn(ChatRoom, 'findById').mockResolvedValue({ id: 'room123', isArchived: false });
      jest.spyOn(ChatRoom, 'isMember').mockResolvedValue(true);
      jest.spyOn(ChatMessage, 'create').mockResolvedValue(createdMessage);
      jest.spyOn(ChatRoom, 'updateLastActivity').mockResolvedValue(true);

      await sendMessage(req, res);

      expect(ChatMessage.create).toHaveBeenCalledWith({
        roomId: 'room123',
        senderId: 'user123',
        content: null,
        attachmentUrl: 'http://example.com/file.png'
      });
      expect(res.status).toHaveBeenCalledWith(201);
    });

    test('should return 500 if an error occurs while sending message', async () => {
      req.user = { id: 'user123' };
      req.params = { roomId: 'room123' };
      req.body = { content: 'Valid message' };

      jest.spyOn(ChatRoom, 'findById').mockRejectedValue(new Error('Write error'));

      await sendMessage(req, res);

      expect(res.status).toHaveBeenCalledWith(500);
      expect(res.json).toHaveBeenCalledWith({
        success: false,
        error: 'Failed to send message',
        details: 'Write error'
      });
    });
  });
});