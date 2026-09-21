// 20_chat_controller.js - Direct Message Retrieval & Room History

// Mock Database Models
export const ChatRoom = {
  findById: async (roomId) => null,
  isMember: async (roomId, userId) => false,
  updateLastActivity: async (roomId, timestamp) => true
};

export const ChatMessage = {
  findByRoom: async (roomId, options) => [],
  create: async (data) => ({ id: `msg_${Date.now()}`, ...data, createdAt: new Date() })
};

export const getRoomHistory = async (req, res) => {
  try {
    const { roomId } = req.params || {};
    const { limit = 50, before } = req.query || {};
    const userId = req.user?.id || req.query?.userId;

    if (!userId) {
      return res.status(401).json({ success: false, error: 'Authentication required' });
    }

    if (!roomId) {
      return res.status(400).json({ success: false, error: 'Room ID is required' });
    }

    const room = await ChatRoom.findById(roomId);
    if (!room) {
      return res.status(404).json({ success: false, error: 'Chat room not found' });
    }

    const isMember = await ChatRoom.isMember(roomId, userId);
    if (!isMember) {
      return res.status(403).json({
        success: false,
        error: 'Access denied: You are not a member of this chat room'
      });
    }

    const parsedLimit = parseInt(limit, 10);
    if (isNaN(parsedLimit) || parsedLimit < 1 || parsedLimit > 100) {
      return res.status(400).json({
        success: false,
        error: 'Limit must be an integer between 1 and 100'
      });
    }

    let beforeDate = null;
    if (before) {
      beforeDate = new Date(before);
      if (isNaN(beforeDate.getTime())) {
        return res.status(400).json({ success: false, error: 'Invalid before timestamp format' });
      }
    }

    const messages = await ChatMessage.findByRoom(roomId, {
      limit: parsedLimit,
      before: beforeDate
    });

    return res.status(200).json({
      success: true,
      data: {
        roomId,
        count: messages.length,
        hasMore: messages.length === parsedLimit,
        messages
      }
    });
  } catch (error) {
    return res.status(500).json({
      success: false,
      error: 'Failed to retrieve chat history',
      details: error.message
    });
  }
};

export const sendMessage = async (req, res) => {
  try {
    const { roomId } = req.params || {};
    const { content, attachmentUrl } = req.body || {};
    const senderId = req.user?.id || req.body?.senderId;

    if (!senderId) {
      return res.status(401).json({ success: false, error: 'Authentication required' });
    }

    if (!roomId) {
      return res.status(400).json({ success: false, error: 'Room ID is required' });
    }

    const hasText = typeof content === 'string' && content.trim().length > 0;
    const hasAttachment = typeof attachmentUrl === 'string' && attachmentUrl.trim().length > 0;

    if (!hasText && !hasAttachment) {
      return res.status(400).json({
        success: false,
        error: 'Message must contain either text content or an attachment'
      });
    }

    if (hasText && content.length > 2000) {
      return res.status(400).json({
        success: false,
        error: 'Message text cannot exceed 2000 characters'
      });
    }

    const room = await ChatRoom.findById(roomId);
    if (!room) {
      return res.status(404).json({ success: false, error: 'Chat room not found' });
    }

    if (room.isArchived) {
      return res.status(400).json({
        success: false,
        error: 'Cannot send messages in an archived room'
      });
    }

    const isMember = await ChatRoom.isMember(roomId, senderId);
    if (!isMember) {
      return res.status(403).json({
        success: false,
        error: 'You do not have permission to post in this room'
      });
    }

    const message = await ChatMessage.create({
      roomId,
      senderId,
      content: hasText ? content.trim() : null,
      attachmentUrl: hasAttachment ? attachmentUrl.trim() : null
    });

    await ChatRoom.updateLastActivity(roomId, new Date());

    return res.status(201).json({
      success: true,
      data: message
    });
  } catch (error) {
    return res.status(500).json({
      success: false,
      error: 'Failed to send message',
      details: error.message
    });
  }
};
