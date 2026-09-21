// 09_notification_controller.js - User Alert Feeds & Read Statuses

// Mock Database Model
export const NotificationModel = {
  findByUser: async (userId, options) => ({
    unreadCount: 0,
    notifications: []
  }),
  findById: async (id) => null,
  update: async (id, data) => ({ id, ...data }),
  markAllReadForUser: async (userId) => ({ count: 0 })
};

export const getNotifications = async (req, res) => {
  try {
    const userId = req.user?.id || req.query?.userId;
    const { unreadOnly = 'false', limit = 20 } = req.query || {};

    if (!userId) {
      return res.status(401).json({
        success: false,
        error: 'Authentication required'
      });
    }

    const parsedLimit = parseInt(limit, 10);
    if (isNaN(parsedLimit) || parsedLimit < 1 || parsedLimit > 50) {
      return res.status(400).json({
        success: false,
        error: 'Limit must be an integer between 1 and 50'
      });
    }

    const filterUnread = unreadOnly === 'true' || unreadOnly === true;

    const result = await NotificationModel.findByUser(userId, {
      unreadOnly: filterUnread,
      limit: parsedLimit
    });

    return res.status(200).json({
      success: true,
      data: {
        unreadCount: result.unreadCount,
        notifications: result.notifications
      }
    });
  } catch (error) {
    return res.status(500).json({
      success: false,
      error: 'Failed to fetch notifications',
      details: error.message
    });
  }
};

export const markAsRead = async (req, res) => {
  try {
    const { notificationId } = req.params || {};
    const userId = req.user?.id || req.body?.userId;

    if (!userId) {
      return res.status(401).json({ success: false, error: 'Authentication required' });
    }

    if (!notificationId) {
      return res.status(400).json({ success: false, error: 'Notification ID is required' });
    }

    const notification = await NotificationModel.findById(notificationId);
    if (!notification) {
      return res.status(404).json({ success: false, error: 'Notification not found' });
    }

    if (notification.userId !== userId) {
      return res.status(403).json({
        success: false,
        error: 'Access denied: You can only update your own notifications'
      });
    }

    if (notification.isRead) {
      return res.status(200).json({
        success: true,
        message: 'Notification is already marked as read',
        data: notification
      });
    }

    const updated = await NotificationModel.update(notificationId, {
      isRead: true,
      readAt: new Date()
    });

    return res.status(200).json({
      success: true,
      message: 'Notification marked as read',
      data: updated
    });
  } catch (error) {
    return res.status(500).json({
      success: false,
      error: 'Failed to update notification',
      details: error.message
    });
  }
};

export const markAllAsRead = async (req, res) => {
  try {
    const userId = req.user?.id || req.body?.userId;

    if (!userId) {
      return res.status(401).json({ success: false, error: 'Authentication required' });
    }

    const result = await NotificationModel.markAllReadForUser(userId);

    return res.status(200).json({
      success: true,
      message: 'All notifications marked as read',
      data: {
        updatedCount: result.count
      }
    });
  } catch (error) {
    return res.status(500).json({
      success: false,
      error: 'Failed to mark notifications as read',
      details: error.message
    });
  }
};
