import { jest } from '@jest/globals';
import {
  getNotifications,
  markAsRead,
  markAllAsRead,
  NotificationModel
} from '../dataset/09_notification_controller.js';

const mockRes = () => {
  const res = {};
  res.status = jest.fn().mockReturnValue(res);
  res.json = jest.fn().mockReturnValue(res);
  return res;
};

describe('Notification Controller', () => {
  afterEach(() => {
    jest.restoreAllMocks();
  });

  // ---------- getNotifications ----------
  describe('getNotifications', () => {
    it('should return 401 when userId is missing', async () => {
      const req = { query: {} };
      const res = mockRes();

      await getNotifications(req, res);

      expect(res.status).toHaveBeenCalledWith(401);
      expect(res.json).toHaveBeenCalledWith({
        success: false,
        error: 'Authentication required'
      });
    });

    it('should return 400 for invalid limit', async () => {
      const req = { user: { id: 'u1' }, query: { limit: 'abc' } };
      const res = mockRes();

      await getNotifications(req, res);

      expect(res.status).toHaveBeenCalledWith(400);
      expect(res.json).toHaveBeenCalledWith({
        success: false,
        error: 'Limit must be an integer between 1 and 50'
      });
    });

    it('should call NotificationModel.findByUser with correct params and return data', async () => {
      const findByUserMock = jest
        .spyOn(NotificationModel, 'findByUser')
        .mockResolvedValue({
          unreadCount: 2,
          notifications: [{ id: 'n1' }, { id: 'n2' }]
        });

      const req = {
        user: { id: 'user123' },
        query: { unreadOnly: 'true', limit: '10' }
      };
      const res = mockRes();

      await getNotifications(req, res);

      expect(findByUserMock).toHaveBeenCalledWith('user123', {
        unreadOnly: true,
        limit: 10
      });
      expect(res.status).toHaveBeenCalledWith(200);
      expect(res.json).toHaveBeenCalledWith({
        success: true,
        data: {
          unreadCount: 2,
          notifications: [{ id: 'n1' }, { id: 'n2' }]
        }
      });
    });

    it('should handle internal errors and respond with 500', async () => {
      jest
        .spyOn(NotificationModel, 'findByUser')
        .mockRejectedValue(new Error('DB failure'));

      const req = { user: { id: 'u' }, query: {} };
      const res = mockRes();

      await getNotifications(req, res);

      expect(res.status).toHaveBeenCalledWith(500);
      expect(res.json).toHaveBeenCalledWith({
        success: false,
        error: 'Failed to fetch notifications',
        details: 'DB failure'
      });
    });
  });

  // ---------- markAsRead ----------
  describe('markAsRead', () => {
    const baseReq = { user: { id: 'uid' }, params: { notificationId: 'nid' } };

    it('should return 401 when userId missing', async () => {
      const req = { params: { notificationId: 'nid' } };
      const res = mockRes();

      await markAsRead(req, res);

      expect(res.status).toHaveBeenCalledWith(401);
      expect(res.json).toHaveBeenCalledWith({
        success: false,
        error: 'Authentication required'
      });
    });

    it('should return 400 when notificationId missing', async () => {
      const req = { user: { id: 'uid' }, params: {} };
      const res = mockRes();

      await markAsRead(req, res);

      expect(res.status).toHaveBeenCalledWith(400);
      expect(res.json).toHaveBeenCalledWith({
        success: false,
        error: 'Notification ID is required'
      });
    });

    it('should return 404 when notification not found', async () => {
      jest.spyOn(NotificationModel, 'findById').mockResolvedValue(null);
      const req = { ...baseReq };
      const res = mockRes();

      await markAsRead(req, res);

      expect(res.status).toHaveBeenCalledWith(404);
      expect(res.json).toHaveBeenCalledWith({
        success: false,
        error: 'Notification not found'
      });
    });

    it('should return 403 when user tries to update another user\'s notification', async () => {
      jest.spyOn(NotificationModel, 'findById').mockResolvedValue({
        id: 'nid',
        userId: 'otherUser',
        isRead: false
      });
      const req = { ...baseReq };
      const res = mockRes();

      await markAsRead(req, res);

      expect(res.status).toHaveBeenCalledWith(403);
      expect(res.json).toHaveBeenCalledWith({
        success: false,
        error: 'Access denied: You can only update your own notifications'
      });
    });

    it('should return 200 with message when notification already read', async () => {
      const notification = {
        id: 'nid',
        userId: 'uid',
        isRead: true,
        readAt: new Date()
      };
      jest.spyOn(NotificationModel, 'findById').mockResolvedValue(notification);

      const req = { ...baseReq };
      const res = mockRes();

      await markAsRead(req, res);

      expect(res.status).toHaveBeenCalledWith(200);
      expect(res.json).toHaveBeenCalledWith({
        success: true,
        message: 'Notification is already marked as read',
        data: notification
      });
    });

    it('should mark unread notification as read and return updated object', async () => {
      const original = {
        id: 'nid',
        userId: 'uid',
        isRead: false
      };
      const updated = {
        id: 'nid',
        userId: 'uid',
        isRead: true,
        readAt: expect.any(Date)
      };
      jest.spyOn(NotificationModel, 'findById').mockResolvedValue(original);
      const updateSpy = jest
        .spyOn(NotificationModel, 'update')
        .mockImplementation((id, data) => Promise.resolve({ id, ...data }));

      const req = { ...baseReq };
      const res = mockRes();

      await markAsRead(req, res);

      expect(updateSpy).toHaveBeenCalledWith('nid', {
        isRead: true,
        readAt: expect.any(Date)
      });
      expect(res.status).toHaveBeenCalledWith(200);
      expect(res.json).toHaveBeenCalledWith({
        success: true,
        message: 'Notification marked as read',
        data: updated
      });
    });

    it('should handle internal errors with 500', async () => {
      jest.spyOn(NotificationModel, 'findById').mockRejectedValue(new Error('boom'));

      const req = { ...baseReq };
      const res = mockRes();

      await markAsRead(req, res);

      expect(res.status).toHaveBeenCalledWith(500);
      expect(res.json).toHaveBeenCalledWith({
        success: false,
        error: 'Failed to update notification',
        details: 'boom'
      });
    });
  });

  // ---------- markAllAsRead ----------
  describe('markAllAsRead', () => {
    it('should return 401 when userId missing', async () => {
      const req = {};
      const res = mockRes();

      await markAllAsRead(req, res);

      expect(res.status).toHaveBeenCalledWith(401);
      expect(res.json).toHaveBeenCalledWith({
        success: false,
        error: 'Authentication required'
      });
    });

    it('should mark all notifications as read and return count', async () => {
      const markAllSpy = jest
        .spyOn(NotificationModel, 'markAllReadForUser')
        .mockResolvedValue({ count: 5 });

      const req = { user: { id: 'uid' } };
      const res = mockRes();

      await markAllAsRead(req, res);

      expect(markAllSpy).toHaveBeenCalledWith('uid');
      expect(res.status).toHaveBeenCalledWith(200);
      expect(res.json).toHaveBeenCalledWith({
        success: true,
        message: 'All notifications marked as read',
        data: { updatedCount: 5 }
      });
    });

    it('should handle internal errors with 500', async () => {
      jest
        .spyOn(NotificationModel, 'markAllReadForUser')
        .mockRejectedValue(new Error('db error'));

      const req = { user: { id: 'uid' } };
      const res = mockRes();

      await markAllAsRead(req, res);

      expect(res.status).toHaveBeenCalledWith(500);
      expect(res.json).toHaveBeenCalledWith({
        success: false,
        error: 'Failed to mark notifications as read',
        details: 'db error'
      });
    });
  });
});