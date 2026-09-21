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
  beforeEach(() => {
    jest.clearAllMocks();
    // default successful mocks
    ChatRoom.findById = jest.fn().mockResolvedValue({ id: 'room1' });
    ChatRoom.isMember = jest.fn().mockResolvedValue(true);
    ChatMessage.findByRoom = jest.fn().mockResolvedValue([]);
  });

  test('returns 401 when user is not authenticated', async () => {
    const req = { params: { roomId: 'room1' }, query: {} };
    const res = mockRes();

    await getRoomHistory(req, res);

    expect(res.status).toHaveBeenCalledWith(401);
    expect(res.json).toHaveBeenCalledWith({
      success: false,
      error: 'Authentication required'
    });
  });

  test('returns 400 when roomId is missing', async () => {
    const req = { user: { id: 'u1' }, params: {}, query: {} };
    const res = mockRes();

    await getRoomHistory(req, res);

    expect(res.status).toHaveBeenCalledWith(400);
    expect(res.json).toHaveBeenCalledWith({
      success: false,
      error: 'Room ID is required'
    });
  });

  test('returns 404 when chat room does not exist', async () => {
    ChatRoom.findById.mockResolvedValue(null);
    const req = { user: { id: 'u1' }, params: { roomId: 'roomX' }, query: {} };
    const res = mockRes();

    await getRoomHistory(req, res);

    expect(res.status).toHaveBeenCalledWith(404);
    expect(res.json).toHaveBeenCalledWith({
      success: false,
      error: 'Chat room not found'
    });
  });

  test('returns 403 when user is not a member of the room', async () => {
    ChatRoom.isMember.mockResolvedValue(false);
    const req = { user: { id: 'u1' }, params: { roomId: 'room1' }, query: {} };
    const res = mockRes();

    await getRoomHistory(req, res);

    expect(res.status).toHaveBeenCalledWith(403);
    expect(res.json).toHaveBeenCalledWith({
      success: false,
      error: 'Access denied: You are not a member of this chat room'
    });
  });

  test('returns 400 for invalid limit parameter', async () => {
    const req = {
      user: { id: 'u1' },
      params: { roomId: 'room1' },
      query: { limit: '200' }
    };
    const res = mockRes();

    await getRoomHistory(req, res);

    expect(res.status).toHaveBeenCalledWith(400);
    expect(res.json).toHaveBeenCalledWith({
      success: false,
      error: 'Limit must be an integer between 1 and 100'
    });
  });

  test('returns 400 for malformed before timestamp', async () => {
    const req = {
      user: { id: 'u1' },
      params: { roomId: 'room1' },
      query: { before: 'not-a-date' }
    };
    const res = mockRes();

    await getRoomHistory(req, res);

    expect(res.status).toHaveBeenCalledWith(400);
    expect(res.json).toHaveBeenCalledWith({
      success: false,
      error: 'Invalid before timestamp format'
    });
  });

  test('returns 200 with correct data when successful (hasMore false)', async () => {
    const messages = [{ id: 'm1' }, { id: 'm2' }];
    ChatMessage.findByRoom.mockResolvedValue(messages);
    const req = {
      user: { id: 'u1' },
      params: { roomId: 'room1' },
      query: { limit: '5' }
    };
    const res = mockRes();

    await getRoomHistory(req, res);

    expect(res.status).toHaveBeenCalledWith(200);
    expect(res.json).toHaveBeenCalledWith({
      success: true,
      data: {
        roomId: 'room1',
        count: messages.length,
        hasMore: false, // messages length < limit
        messages
      }
    });
  });

  test('sets hasMore true when number of messages equals limit', async () => {
    const limit = 3;
    const messages = [{ id: 'a' }, { id: 'b' }, { id: 'c' }];
    ChatMessage.findByRoom.mockResolvedValue(messages);
    const req = {
      user: { id: 'u1' },
      params: { roomId: 'room1' },
      query: { limit: String(limit) }
    };
    const res = mockRes();

    await getRoomHistory(req, res);

    expect(res.status).toHaveBeenCalledWith(200);
    expect(res.json).toHaveBeenCalledWith({
      success: true,
      data: {
        roomId: 'room1',
        count: limit,
        hasMore: true,
        messages
      }
    });
  });

  test('returns 500 when an unexpected error occurs', async () => {
    ChatRoom.findById.mockRejectedValue(new Error('DB failure'));
    const req = { user: { id: 'u1' }, params: { roomId: 'room1' }, query: {} };
    const res = mockRes();

    await getRoomHistory(req, res);

    expect(res.status).toHaveBeenCalledWith(500);
    expect(res.json).toHaveBeenCalledWith(
      expect.objectContaining({
        success: false,
        error: 'Failed to retrieve chat history',
        details: 'DB failure'
      })
    );
  });
});

describe('sendMessage', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    ChatRoom.findById = jest.fn().mockResolvedValue({ id: 'room1', isArchived: false });
    ChatRoom.isMember = jest.fn().mockResolvedValue(true);
    ChatRoom.updateLastActivity = jest.fn().mockResolvedValue(true);
    ChatMessage.create = jest.fn().mockImplementation((data) => ({
      id: `msg_${Date.now()}`,
      ...data,
      createdAt: new Date()
    }));
  });

  test('returns 401 when sender is not authenticated', async () => {
    const req = { params: { roomId: 'room1' }, body: { content: 'Hello' } };
    const res = mockRes();

    await sendMessage(req, res);

    expect(res.status).toHaveBeenCalledWith(401);
    expect(res.json).toHaveBeenCalledWith({
      success: false,
      error: 'Authentication required'
    });
  });

  test('returns 400 when roomId is missing', async () => {
    const req = { user: { id: 'u1' }, body: { content: 'Hi' } };
    const res = mockRes();

    await sendMessage(req, res);

    expect(res.status).toHaveBeenCalledWith(400);
    expect(res.json).toHaveBeenCalledWith({
      success: false,
      error: 'Room ID is required'
    });
  });

  test('returns 400 when both content and attachment are absent', async () => {
    const req = { user: { id: 'u1' }, params: { roomId: 'room1' }, body: {} };
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
      user: { id: 'u1' },
      params: { roomId: 'room1' },
      body: { content: longText }
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
    const req = {
      user: { id: 'u1' },
      params: { roomId: 'unknown' },
      body: { content: 'Hello' }
    };
    const res = mockRes();

    await sendMessage(req, res);

    expect(res.status).toHaveBeenCalledWith(404);
    expect(res.json).toHaveBeenCalledWith({
      success: false,
      error: 'Chat room not found'
    });
  });

  test('returns 400 when attempting to send in an archived room', async () => {
    ChatRoom.findById.mockResolvedValue({ id: 'room1', isArchived: true });
    const req = {
      user: { id: 'u1' },
      params: { roomId: 'room1' },
      body: { content: 'Hello' }
    };
    const res = mockRes();

    await sendMessage(req, res);

    expect(res.status).toHaveBeenCalledWith(400);
    expect(res.json).toHaveBeenCalledWith({
      success: false,
      error: 'Cannot send messages in an archived room'
    });
  });

  test('returns 403 when user is not a member of the room', async () => {
    ChatRoom.isMember.mockResolvedValue(false);
    const req = {
      user: { id: 'u1' },
      params: { roomId: 'room1' },
      body: { content: 'Hi there' }
    };
    const res = mockRes();

    await sendMessage(req, res);

    expect(res.status).toHaveBeenCalledWith(403);
    expect(res.json).toHaveBeenCalledWith({
      success: false,
      error: 'You do not have permission to post in this room'
    });
  });

  test('successfully creates a text message and updates activity', async () => {
    const req = {
      user: { id: 'u1' },
      params: { roomId: 'room1' },
      body: { content: '  Hello world  ' }
    };
    const res = mockRes();

    await sendMessage(req, res);

    expect(ChatMessage.create).toHaveBeenCalledWith({
      roomId: 'room1',
      senderId: 'u1',
      content: 'Hello world',
      attachmentUrl: null
    });
    expect(ChatRoom.updateLastActivity).toHaveBeenCalledWith('room1', expect.any(Date));
    expect(res.status).toHaveBeenCalledWith(201);
    expect(res.json).toHaveBeenCalledWith(
      expect.objectContaining({
        success: true,
        data: expect.objectContaining({
          roomId: 'room1',
          senderId: 'u1',
          content: 'Hello world',
          attachmentUrl: null
        })
      })
    );
  });

  test('successfully creates a message with attachment only', async () => {
    const req = {
      user: { id: 'u1' },
      params: { roomId: 'room1' },
      body: { attachmentUrl: '  https://example.com/img.png  ' }
    };
    const res = mockRes();

    await sendMessage(req, res);