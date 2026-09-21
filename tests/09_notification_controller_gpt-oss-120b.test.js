import { jest } from '@jest/globals';
import {
  getNotifications,
  markAsRead,
  markAllAsRead,
  NotificationModel
} from '../dataset/09_notification_controller.js';

describe('Notification Controller', () => {
  const createRes = () => {
    const res = {};
    res.status = jest.fn().mockReturnValue(res);
    res.json = jest.fn().mockReturnValue(res);
    return res;
  };

  afterEach(() => {
    jest.restoreAllMocks();
    jest.clearAllMocks();
  });

  describe('getNotifications', () => {
    it('should return 401 when userId is missing', async () => {
      const req = { query: {} };
      const res = createRes();

      await getNotifications(req, res);

      expect(res.status).toHaveBeenCalledWith(401);
      expect(res.json).toHaveBeenCalledWith({
        success: false,
        error: 'Authentication required'
      });
    });

    it('should return 400 for invalid limit values', async () => {
      const req = {
        user: { id: 'u1' },
        query: { limit: '0' }
      };
      const res = createRes();

      await getNotifications(req, res);

      expect(res.status).toHaveBeenCalledWith(400);
      expect(res.json).toHaveBeenCalledWith({
        success: false,
        error: 'Limit must be an integer between 1 and 50'
      });
    });

    it('should forward unreadOnly flag correctly (string true)', async () => {
      const mockResult = {
        unreadCount: 2,
        notifications: [{ id: 'n1' }, { id: 'n2' }]
      };
      const findByUserSpy = jest
        .spyOn(NotificationModel, 'findByUser')
        .mockResolvedValue(mockResult);

      const req = {
        user: { id: 'u1' },
        query: { unreadOnly: 'true', limit: '5' }
      };
      const res = createRes();

      await getNotifications(req, res);

      expect(findByUserSpy).toHaveBeenCalledWith('u1', {
        unreadOnly: true,
        limit: 5
      });
      expect(res.status).toHaveBeenCalledWith(200);
      expect(res.json).toHaveBeenCalledWith({
        success: true,
        data: mockResult
      });
    });

    it('should forward unreadOnly flag correctly (boolean true)', async () => {
      const mockResult = {
        unreadCount: 1,
        notifications: [{ id: 'n3' }]
      };
      const findByUserSpy = jest
        .spyOn(NotificationModel, 'findByUser')
        .mockResolvedValue(mockResult);

      const req = {
        user: { id: 'u2' },
        query: { unreadOnly: true, limit: '10' }
      };
      const res = createRes();

      await getNotifications(req, res);

      expect(findByUserSpy).toHaveBeenCalledWith('u2', {
        unreadOnly: true,
        limit: 10
      });
      expect(res.status).toHaveBeenCalledWith(200);
      expect(res.json).toHaveBeenCalledWith({
        success: true,
        data: mockResult
      });
    });
  });

  describe('markAsRead', () => {
    const baseReq = {
      user: { id: 'userA' },
      params: { notificationId: 'notif123' }
    };

    it('should return 401 when userId is missing', async () => {
      const req = { params: { notificationId: 'x' } };
      const res = createRes();

      await markAsRead(req, res);

      expect(res.status).toHaveBeenCalledWith(401);
      expect(res.json).toHaveBeenCalledWith({
        success: false,
        error: 'Authentication required'
      });
    });

    it('should return 400 when notificationId is missing', async () => {
      const req = { user: { id: 'u' } };
      const res = createRes();

      await markAsRead(req, res);

      expect(res.status).toHaveBeenCalledWith(400);
      expect(res.json).toHaveBeenCalledWith({
        success: false,
        error: 'Notification ID is required'
      });
    });

    it('should return 404 when notification not found', async () => {
      jest.spyOn(NotificationModel, 'findById').mockResolvedValue(null);
      const req = { ...baseReq, user: { id: 'userA' } };
      const res = createRes();

      await markAsRead(req, res);

      expect(res.status).toHaveBeenCalledWith(404);
      expect(res.json).toHaveBeenCalledWith({
        success: false,
        error: 'Notification not found'
      });
    });

    it('should return 403 when notification belongs to another user', async () => {
      const notification = { id: 'notif123', userId: 'otherUser', isRead: false };
      jest.spyOn(NotificationModel, 'findById').mockResolvedValue(notification);
      const req = { ...baseReq, user: { id: 'userA' } };
      const res = createRes();

      await markAsRead(req, res);

      expect(res.status).toHaveBeenCalledWith(403);
      expect(res.json).toHaveBeenCalledWith({
        success: false,
        error: 'Access denied: You can only update your own notifications'
      });
    });

    it('should return 200 with message when notification already read', async () => {
      const notification = { id: 'notif123', userId: 'userA', isRead: true };
      jest.spyOn(NotificationModel, 'findById').mockResolvedValue(notification);
      const req = { ...baseReq, user: { id: 'userA' } };
      const res = createRes();

      await markAsRead(req, res);

      expect(res.status).toHaveBeenCalledWith(200);
      expect(res.json).toHaveBeenCalledWith({
        success: true,
        message: 'Notification is already marked as read',
        data: notification
      });
    });

    it('should update and return updated notification when unread', async () => {
      const notification = { id: 'notif123', userId: 'userA', isRead: false };
      jest.spyOn(NotificationModel, 'findById').mockResolvedValue(notification);
      const updated = { id: 'notif123', isRead: true, readAt: new Date() };
      jest.spyOn(NotificationModel, 'update').mockResolvedValue(updated);

      const req = { ...baseReq, user: { id: 'userA' } };
      const res = createRes();

      await markAsRead(req, res);

      expect(NotificationModel.update).toHaveBeenCalledWith('notif123', expect.objectContaining({
        isRead: true,
        readAt: expect.any(Date)
      }));
      expect(res.status).toHaveBeenCalledWith(200);
      expect(res.json).toHaveBeenCalledWith({
        success: true,
        message: 'Notification marked as read',
        data: updated
      });
    });
  });

  describe('markAllAsRead', () => {
    it('should return 401 when userId missing', async () => {
      const req = { body: {} };
      const res = createRes();

      await markAllAsRead(req, res);

      expect(res.status).toHaveBeenCalledWith(401);
      expect(res.json).toHaveBeenCalledWith({
        success: false,
        error: 'Authentication required'
      });
    });

    it('should mark all as read and return count', async () => {
      const result = { count: 7 };
      jest.spyOn(NotificationModel, 'markAllReadForUser').mockResolvedValue(result);
      const req = { user: { id: 'userB' } };
      const res = createRes();

      await markAllAsRead(req, res);

      expect(NotificationModel.markAllReadForUser).toHaveBeenCalledWith('userB');
      expect(res.status).toHaveBeenCalledWith(200);
      expect(res.json).toHaveBeenCalledWith({
        success: true,
        message: 'All notifications marked as read',
        data: { updatedCount: 7 }
      });
    });
  });
});