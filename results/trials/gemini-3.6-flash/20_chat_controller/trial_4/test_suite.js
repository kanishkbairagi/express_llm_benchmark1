import { jest } from '@jest/globals';
import {
  getRoomHistory,
  sendMessage,
  ChatRoom,
  ChatMessage
} from '../dataset/20_chat_controller.js';

describe('20_chat_controller tests', () => {
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
    jest.clearAllMocks();
  });

  describe('getRoomHistory', () => {
    test('should return 401 if user is not authenticated', async () => {
      req.user = null;
      req.query = {};

      await getRoomHistory(req, res);

      expect(res.status).toHaveBeenCalledWith(401);
      expect(res.json).toHaveBeenCalledWith({
        success: false,
        error: 'Authentication required'
      });
    });

    test('should return 400 if roomId parameter is missing', async () => {
      req.user = { id: 'user_1' };
      req.params = {};

      await getRoomHistory(req, res);

      expect(res.status).toHaveBeenCalledWith(400);
      expect(res.json).toHaveBeenCalledWith({
        success: false,
        error: 'Room ID is required'
      });
    });

    test('should return 404 if chat room does not exist', async () => {
      req.user = { id: 'user_1' };
      req.params = { roomId: 'room_1' };
      jest.spyOn(ChatRoom, 'findById').mockResolvedValue(null);

      await getRoomHistory(req, res);

      expect(ChatRoom.findById).toHaveBeenCalledWith('room_1');
      expect(res.status).toHaveBeenCalledWith(404);
      expect(res.json).toHaveBeenCalledWith({
        success: false,
        error: 'Chat room not found'
      });
    });

    test('should return 403 if user is not a member of the room', async () => {
      req.user = { id: 'user_1' };
      req.params = { roomId: 'room_1' };
      jest.spyOn(ChatRoom, 'findById').mockResolvedValue({ id: 'room_1' });
      jest.spyOn(ChatRoom, 'isMember').mockResolvedValue(false);

      await getRoomHistory(req, res);

      expect(ChatRoom.isMember).toHaveBeenCalledWith('room_1', 'user_1');
      expect(res.status).toHaveBeenCalledWith(403);
      expect(res.json).toHaveBeenCalledWith({
        success: false,
        error: 'Access denied: You are not a member of this chat room'
      });
    });

    test('should return 400 for invalid limit values (< 1, > 100, NaN)', async () => {
      req.user = { id: 'user_1' };
      req.params = { roomId: 'room_1' };
      jest.spyOn(ChatRoom, 'findById').mockResolvedValue({ id: 'room_1' });
      jest.spyOn(ChatRoom, 'isMember').mockResolvedValue(true);

      req.query = { limit: 'invalid' };
      await getRoomHistory(req, res);
      expect(res.status).toHaveBeenCalledWith(400);

      req.query = { limit: '0' };
      await getRoomHistory(req, res);
      expect(res.status).toHaveBeenCalledWith(400);

      req.query = { limit: '101' };
      await getRoomHistory(req, res);
      expect(res.status).toHaveBeenCalledWith(400);
      expect(res.json).toHaveBeenCalledWith({
        success: false,
        error: 'Limit must be an integer between 1 and 100'
      });
    });

    test('should return 400 if before date format is invalid', async () => {
      req.user = { id: 'user_1' };
      req.params = { roomId: 'room_1' };
      req.query = { before: 'not-a-date' };

      jest.spyOn(ChatRoom, 'findById').mockResolvedValue({ id: 'room_1' });
      jest.spyOn(ChatRoom, 'isMember').mockResolvedValue(true);

      await getRoomHistory(req, res);

      expect(res.status).toHaveBeenCalledWith(400);
      expect(res.json).toHaveBeenCalledWith({
        success: false,
        error: 'Invalid before timestamp format'
      });
    });

    test('should successfully fetch room history with query userId and custom params', async () => {
      req.user = null;
      req.query = { userId: 'user_2', limit: '10', before: '2023-01-01T00:00:00.000Z' };
      req.params = { roomId: 'room_1' };

      const mockMessages = [{ id: 'msg_1', content: 'Hello' }];

      jest.spyOn(ChatRoom, 'findById').mockResolvedValue({ id: 'room_1' });
      jest.spyOn(ChatRoom, 'isMember').mockResolvedValue(true);
      jest.spyOn(ChatMessage, 'findByRoom').mockResolvedValue(mockMessages);

      await getRoomHistory(req, res);

      expect(ChatMessage.findByRoom).toHaveBeenCalledWith('room_1', {
        limit: 10,
        before: new Date('2023-01-01T00:00:00.000Z')
      });
      expect(res.status).toHaveBeenCalledWith(200);
      expect(res.json).toHaveBeenCalledWith({
        success: true,
        data: {
          roomId: 'room_1',
          count: 1,
          hasMore: false,
          messages: mockMessages
        }
      });
    });

    test('should set hasMore to true when retrieved messages count equals limit', async () => {
      req.user = { id: 'user_1' };
      req.params = { roomId: 'room_1' };
      req.query = { limit: '2' };

      const mockMessages = [
        { id: 'msg_1', content: 'One' },
        { id: 'msg_2', content: 'Two' }
      ];

      jest.spyOn(ChatRoom, 'findById').mockResolvedValue({ id: 'room_1' });
      jest.spyOn(ChatRoom, 'isMember').mockResolvedValue(true);
      jest.spyOn(ChatMessage, 'findByRoom').mockResolvedValue(mockMessages);

      await getRoomHistory(req, res);

      expect(res.status).toHaveBeenCalledWith(200);
      expect(res.json).toHaveBeenCalledWith({
        success: true,
        data: {
          roomId: 'room_1',
          count: 2,
          hasMore: true,
          messages: mockMessages
        }
      });
    });

    test('should handle internal server errors and return 500', async () => {
      req.user = { id: 'user_1' };
      req.params = { roomId: 'room_1' };

      jest.spyOn(ChatRoom, 'findById').mockRejectedValue(new Error('Database error'));

      await getRoomHistory(req, res);

      expect(res.status).toHaveBeenCalledWith(500);
      expect(res.json).toHaveBeenCalledWith({
        success: false,
        error: 'Failed to retrieve chat history',
        details: 'Database error'
      });
    });
  });

  describe('sendMessage', () => {
    test('should return 401 if senderId is missing', async () => {
      req.user = null;
      req.body = {};

      await sendMessage(req, res);

      expect(res.status).toHaveBeenCalledWith(401);
      expect(res.json).toHaveBeenCalledWith({
        success: false,
        error: 'Authentication required'
      });
    });

    test('should return 400 if roomId parameter is missing', async () => {
      req.user = { id: 'user_1' };
      req.params = {};

      await sendMessage(req, res);

      expect(res.status).toHaveBeenCalledWith(400);
      expect(res.json).toHaveBeenCalledWith({
        success: false,
        error: 'Room ID is required'
      });
    });

    test('should return 400 if both content and attachmentUrl are missing/empty', async () => {
      req.user = { id: 'user_1' };
      req.params = { roomId: 'room_1' };
      req.body = { content: '   ', attachmentUrl: '' };

      await sendMessage(req, res);

      expect(res.status).toHaveBeenCalledWith(400);
      expect(res.json).toHaveBeenCalledWith({
        success: false,
        error: 'Message must contain either text content or an attachment'
      });
    });

    test('should return 400 if content exceeds 2000 characters', async () => {
      req.user = { id: 'user_1' };
      req.params = { roomId: 'room_1' };
      req.body = { content: 'a'.repeat(2001) };

      await sendMessage(req, res);

      expect(res.status).toHaveBeenCalledWith(400);
      expect(res.json).toHaveBeenCalledWith({
        success: false,
        error: 'Message text cannot exceed 2000 characters'
      });
    });

    test('should return 404 if chat room does not exist', async () => {
      req.user = { id: 'user_1' };
      req.params = { roomId: 'room_1' };
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
      req.user = { id: 'user_1' };
      req.params = { roomId: 'room_1' };
      req.body = { content: 'Valid message' };

      jest.spyOn(ChatRoom, 'findById').mockResolvedValue({ id: 'room_1', isArchived: true });

      await sendMessage(req, res);

      expect(res.status).toHaveBeenCalledWith(400);
      expect(res.json).toHaveBeenCalledWith({
        success: false,
        error: 'Cannot send messages in an archived room'
      });
    });

    test('should return 403 if user is not a member of the room', async () => {
      req.user = { id: 'user_1' };
      req.params = { roomId: 'room_1' };
      req.body = { content: 'Valid message' };

      jest.spyOn(ChatRoom, 'findById').mockResolvedValue({ id: 'room_1', isArchived: false });
      jest.spyOn(ChatRoom, 'isMember').mockResolvedValue(false);

      await sendMessage(req, res);

      expect(res.status).toHaveBeenCalledWith(403);
      expect(res.json).toHaveBeenCalledWith({
        success: false,
        error: 'You do not have permission to post in this room'
      });
    });

    test('should successfully create message and update last activity with senderId in body', async () => {
      req.user = null;
      req.params = { roomId: 'room_1' };
      req.body = {
        senderId: 'user_1',
        content: ' Hello World ',
        attachmentUrl: ' http://example.com/file.jpg '
      };

      const createdMessage = {
        id: 'msg_123',
        roomId: 'room_1',
        senderId: 'user_1',
        content: 'Hello World',
        attachmentUrl: 'http://example.com/file.jpg',
        createdAt: new Date()
      };

      jest.spyOn(ChatRoom, 'findById').mockResolvedValue({ id: 'room_1', isArchived: false });
      jest.spyOn(ChatRoom, 'isMember').mockResolvedValue(true);
      jest.spyOn(ChatMessage, 'create').mockResolvedValue(createdMessage);
      jest.spyOn(ChatRoom, 'updateLastActivity').mockResolvedValue(true);

      await sendMessage(req, res);

      expect(ChatMessage.create).toHaveBeenCalledWith({
        roomId: 'room_1',
        senderId: 'user_1',
        content: 'Hello World',
        attachmentUrl: 'http://example.com/file.jpg'
      });
      expect(ChatRoom.updateLastActivity).toHaveBeenCalledWith('room_1', expect.any(Date));
      expect(res.status).toHaveBeenCalledWith(201);
      expect(res.json).toHaveBeenCalledWith({
        success: true,
        data: createdMessage
      });
    });

    test('should successfully send attachment-only message', async () => {
      req.user = { id: 'user_1' };
      req.params = { roomId: 'room_1' };
      req.body = { attachmentUrl: 'http://example.com/file.jpg' };

      jest.spyOn(ChatRoom, 'findById').mockResolvedValue({ id: 'room_1', isArchived: false });
      jest.spyOn(ChatRoom, 'isMember').mockResolvedValue(true);
      jest.spyOn(ChatMessage, 'create').mockResolvedValue({ id: 'msg_123' });
      jest.spyOn(ChatRoom, 'updateLastActivity').mockResolvedValue(true);

      await sendMessage(req, res);

      expect(ChatMessage.create).toHaveBeenCalledWith({
        roomId: 'room_1',
        senderId: 'user_1',
        content: null,
        attachmentUrl: 'http://example.com/file.jpg'
      });
      expect(res.status).toHaveBeenCalledWith(201);
    });

    test('should handle internal server errors and return 500', async () => {
      req.user = { id: 'user_1' };
      req.params = { roomId: 'room_1' };
      req.body = { content: 'Hello' };

      jest.spyOn(ChatRoom, 'findById').mockRejectedValue(new Error('Write failed'));

      await sendMessage(req, res);

      expect(res.status).toHaveBeenCalledWith(500);
      expect(res.json).toHaveBeenCalledWith({
        success: false,
        error: 'Failed to send message',
        details: 'Write failed'
      });
    });
  });
});