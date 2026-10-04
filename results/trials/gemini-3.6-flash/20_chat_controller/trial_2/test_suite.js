import { jest } from '@jest/globals';
import { getRoomHistory, sendMessage, ChatRoom, ChatMessage } from '../dataset/20_chat_controller.js';

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
    jest.restoreAllMocks();
  });

  describe('getRoomHistory', () => {
    test('should return 401 if userId is missing', async () => {
      req.params = { roomId: 'room1' };

      await getRoomHistory(req, res);

      expect(res.status).toHaveBeenCalledWith(401);
      expect(res.json).toHaveBeenCalledWith({
        success: false,
        error: 'Authentication required'
      });
    });

    test('should return 400 if roomId is missing', async () => {
      req.user = { id: 'user1' };

      await getRoomHistory(req, res);

      expect(res.status).toHaveBeenCalledWith(400);
      expect(res.json).toHaveBeenCalledWith({
        success: false,
        error: 'Room ID is required'
      });
    });

    test('should return 404 if chat room is not found', async () => {
      req.user = { id: 'user1' };
      req.params = { roomId: 'room1' };
      jest.spyOn(ChatRoom, 'findById').mockResolvedValue(null);

      await getRoomHistory(req, res);

      expect(ChatRoom.findById).toHaveBeenCalledWith('room1');
      expect(res.status).toHaveBeenCalledWith(404);
      expect(res.json).toHaveBeenCalledWith({
        success: false,
        error: 'Chat room not found'
      });
    });

    test('should return 403 if user is not a member of the chat room', async () => {
      req.user = { id: 'user1' };
      req.params = { roomId: 'room1' };
      jest.spyOn(ChatRoom, 'findById').mockResolvedValue({ id: 'room1' });
      jest.spyOn(ChatRoom, 'isMember').mockResolvedValue(false);

      await getRoomHistory(req, res);

      expect(ChatRoom.isMember).toHaveBeenCalledWith('room1', 'user1');
      expect(res.status).toHaveBeenCalledWith(403);
      expect(res.json).toHaveBeenCalledWith({
        success: false,
        error: 'Access denied: You are not a member of this chat room'
      });
    });

    test('should return 400 if limit is less than 1 or greater than 100 or NaN', async () => {
      req.user = { id: 'user1' };
      req.params = { roomId: 'room1' };
      req.query = { limit: '0' };
      jest.spyOn(ChatRoom, 'findById').mockResolvedValue({ id: 'room1' });
      jest.spyOn(ChatRoom, 'isMember').mockResolvedValue(true);

      await getRoomHistory(req, res);

      expect(res.status).toHaveBeenCalledWith(400);
      expect(res.json).toHaveBeenCalledWith({
        success: false,
        error: 'Limit must be an integer between 1 and 100'
      });

      // Test limit > 100
      req.query = { limit: '101' };
      await getRoomHistory(req, res);
      expect(res.status).toHaveBeenCalledWith(400);

      // Test limit NaN
      req.query = { limit: 'invalid' };
      await getRoomHistory(req, res);
      expect(res.status).toHaveBeenCalledWith(400);
    });

    test('should return 400 if before date format is invalid', async () => {
      req.user = { id: 'user1' };
      req.params = { roomId: 'room1' };
      req.query = { before: 'not-a-date' };
      jest.spyOn(ChatRoom, 'findById').mockResolvedValue({ id: 'room1' });
      jest.spyOn(ChatRoom, 'isMember').mockResolvedValue(true);

      await getRoomHistory(req, res);

      expect(res.status).toHaveBeenCalledWith(400);
      expect(res.json).toHaveBeenCalledWith({
        success: false,
        error: 'Invalid before timestamp format'
      });
    });

    test('should return 200 with room history successfully (user from query)', async () => {
      req.query = { userId: 'user2', limit: '10', before: '2023-01-01T00:00:00.000Z' };
      req.params = { roomId: 'room1' };

      const mockMessages = [{ id: 'msg1', content: 'Hello' }];
      jest.spyOn(ChatRoom, 'findById').mockResolvedValue({ id: 'room1' });
      jest.spyOn(ChatRoom, 'isMember').mockResolvedValue(true);
      jest.spyOn(ChatMessage, 'findByRoom').mockResolvedValue(mockMessages);

      await getRoomHistory(req, res);

      expect(ChatMessage.findByRoom).toHaveBeenCalledWith('room1', {
        limit: 10,
        before: new Date('2023-01-01T00:00:00.000Z')
      });
      expect(res.status).toHaveBeenCalledWith(200);
      expect(res.json).toHaveBeenCalledWith({
        success: true,
        data: {
          roomId: 'room1',
          count: 1,
          hasMore: false,
          messages: mockMessages
        }
      });
    });

    test('should handle hasMore correctly when count equals limit', async () => {
      req.user = { id: 'user1' };
      req.params = { roomId: 'room1' };
      req.query = { limit: '2' };

      const mockMessages = [{ id: 'msg1' }, { id: 'msg2' }];
      jest.spyOn(ChatRoom, 'findById').mockResolvedValue({ id: 'room1' });
      jest.spyOn(ChatRoom, 'isMember').mockResolvedValue(true);
      jest.spyOn(ChatMessage, 'findByRoom').mockResolvedValue(mockMessages);

      await getRoomHistory(req, res);

      expect(res.status).toHaveBeenCalledWith(200);
      expect(res.json).toHaveBeenCalledWith({
        success: true,
        data: {
          roomId: 'room1',
          count: 2,
          hasMore: true,
          messages: mockMessages
        }
      });
    });

    test('should return 500 if an exception occurs', async () => {
      req.user = { id: 'user1' };
      req.params = { roomId: 'room1' };
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
      req.params = { roomId: 'room1' };
      req.body = { content: 'Hello' };

      await sendMessage(req, res);

      expect(res.status).toHaveBeenCalledWith(401);
      expect(res.json).toHaveBeenCalledWith({
        success: false,
        error: 'Authentication required'
      });
    });

    test('should return 400 if roomId is missing', async () => {
      req.user = { id: 'user1' };
      req.body = { content: 'Hello' };

      await sendMessage(req, res);

      expect(res.status).toHaveBeenCalledWith(400);
      expect(res.json).toHaveBeenCalledWith({
        success: false,
        error: 'Room ID is required'
      });
    });

    test('should return 400 if neither content nor attachmentUrl is provided', async () => {
      req.user = { id: 'user1' };
      req.params = { roomId: 'room1' };
      req.body = { content: '   ', attachmentUrl: '' };

      await sendMessage(req, res);

      expect(res.status).toHaveBeenCalledWith(400);
      expect(res.json).toHaveBeenCalledWith({
        success: false,
        error: 'Message must contain either text content or an attachment'
      });
    });

    test('should return 400 if text content exceeds 2000 characters', async () => {
      req.user = { id: 'user1' };
      req.params = { roomId: 'room1' };
      req.body = { content: 'a'.repeat(2001) };

      await sendMessage(req, res);

      expect(res.status).toHaveBeenCalledWith(400);
      expect(res.json).toHaveBeenCalledWith({
        success: false,
        error: 'Message text cannot exceed 2000 characters'
      });
    });

    test('should return 404 if chat room is not found', async () => {
      req.user = { id: 'user1' };
      req.params = { roomId: 'room1' };
      req.body = { content: 'Hello' };
      jest.spyOn(ChatRoom, 'findById').mockResolvedValue(null);

      await sendMessage(req, res);

      expect(res.status).toHaveBeenCalledWith(404);
      expect(res.json).toHaveBeenCalledWith({
        success: false,
        error: 'Chat room not found'
      });
    });

    test('should return 400 if chat room is archived', async () => {
      req.user = { id: 'user1' };
      req.params = { roomId: 'room1' };
      req.body = { content: 'Hello' };
      jest.spyOn(ChatRoom, 'findById').mockResolvedValue({ id: 'room1', isArchived: true });

      await sendMessage(req, res);

      expect(res.status).toHaveBeenCalledWith(400);
      expect(res.json).toHaveBeenCalledWith({
        success: false,
        error: 'Cannot send messages in an archived room'
      });
    });

    test('should return 403 if sender is not a member of the room', async () => {
      req.user = { id: 'user1' };
      req.params = { roomId: 'room1' };
      req.body = { content: 'Hello' };
      jest.spyOn(ChatRoom, 'findById').mockResolvedValue({ id: 'room1', isArchived: false });
      jest.spyOn(ChatRoom, 'isMember').mockResolvedValue(false);

      await sendMessage(req, res);

      expect(res.status).toHaveBeenCalledWith(403);
      expect(res.json).toHaveBeenCalledWith({
        success: false,
        error: 'You do not have permission to post in this room'
      });
    });

    test('should create message and update room last activity on success (senderId from body)', async () => {
      req.params = { roomId: 'room1' };
      req.body = {
        senderId: 'user2',
        content: '  Hello World  ',
        attachmentUrl: '  https://example.com/file.png  '
      };

      const createdMsg = {
        id: 'msg_123',
        roomId: 'room1',
        senderId: 'user2',
        content: 'Hello World',
        attachmentUrl: 'https://example.com/file.png'
      };

      jest.spyOn(ChatRoom, 'findById').mockResolvedValue({ id: 'room1' });
      jest.spyOn(ChatRoom, 'isMember').mockResolvedValue(true);
      jest.spyOn(ChatMessage, 'create').mockResolvedValue(createdMsg);
      jest.spyOn(ChatRoom, 'updateLastActivity').mockResolvedValue(true);

      await sendMessage(req, res);

      expect(ChatMessage.create).toHaveBeenCalledWith({
        roomId: 'room1',
        senderId: 'user2',
        content: 'Hello World',
        attachmentUrl: 'https://example.com/file.png'
      });
      expect(ChatRoom.updateLastActivity).toHaveBeenCalledWith('room1', expect.any(Date));
      expect(res.status).toHaveBeenCalledWith(201);
      expect(res.json).toHaveBeenCalledWith({
        success: true,
        data: createdMsg
      });
    });

    test('should create attachment-only message correctly', async () => {
      req.user = { id: 'user1' };
      req.params = { roomId: 'room1' };
      req.body = { attachmentUrl: 'https://example.com/file.png' };

      jest.spyOn(ChatRoom, 'findById').mockResolvedValue({ id: 'room1' });
      jest.spyOn(ChatRoom, 'isMember').mockResolvedValue(true);
      jest.spyOn(ChatMessage, 'create').mockResolvedValue({});
      jest.spyOn(ChatRoom, 'updateLastActivity').mockResolvedValue(true);

      await sendMessage(req, res);

      expect(ChatMessage.create).toHaveBeenCalledWith({
        roomId: 'room1',
        senderId: 'user1',
        content: null,
        attachmentUrl: 'https://example.com/file.png'
      });
      expect(res.status).toHaveBeenCalledWith(201);
    });

    test('should return 500 if an exception occurs during message sending', async () => {
      req.user = { id: 'user1' };
      req.params = { roomId: 'room1' };
      req.body = { content: 'Hello' };
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