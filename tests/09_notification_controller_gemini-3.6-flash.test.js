import { jest } from '@jest/globals';
import {
  NotificationModel,
  getNotifications,
  markAsRead,
  markAllAsRead
} from '../dataset/09_notification_controller.js';

const mockResponse = () => {
  const res = {};
  res.status = jest.fn().mockReturnValue(res);
  res.json = jest.fn().mockReturnValue(res);
  return res;
};

describe('Notification Controller Unit Tests', () => {
  afterEach(() => {
    jest.restoreAllMocks();
  });

  describe('getNotifications', () => {
    it('should return 401 if userId is missing', async () => {
      const req = { query: {} };
      const res = mockResponse();

      await getNotifications(req, res);

      expect(res.status).toHaveBeenCalledWith(401);
      expect(res.json).toHaveBeenCalledWith({
        success: false,
        error: 'Authentication required'
      });
    });

    it('should return 400 if limit is not an integer between 1 and 50', async () => {
      const req = { user: { id: 'user1' }, query: { limit: '100' } };
      const res = mockResponse();

      await getNotifications(req, res);

      expect(res.status).toHaveBeenCalledWith(400);
      expect(res.json).toHaveBeenCalledWith({
        success: false,
        error: 'Limit must be an integer between 1 and 50'
      });
    });

    it('should return 400 if limit is less than 1', async () => {
      const req = { user: { id: 'user1' }, query: { limit: '0' } };
      const res = mockResponse();

      await getNotifications(req, res);

      expect(res.status).toHaveBeenCalledWith(400);
    });

    it('should return 400 if limit is NaN', async () => {
      const req = { user: { id: 'user1' }, query: { limit: 'invalid' } };
      const res = mockResponse();

      await getNotifications(req, res);

      expect(res.status).toHaveBeenCalledWith(400);
    });

    it('should successfully retrieve notifications with default query params', async () => {
      const mockResult = {
        unreadCount: 2,
        notifications: [{ id: '1', title: 'Test Alert' }]
      };
      jest.spyOn(NotificationModel, 'findByUser').mockResolvedValue(mockResult);

      const req = { user: { id: 'user1' } };
      const res = mockResponse();

      await getNotifications(req, res);

      expect(NotificationModel.findByUser).toHaveBeenCalledWith('user1', {
        unreadOnly: false,
        limit: 20
      });
      expect(res.status).toHaveBeenCalledWith(200);
      expect(res.json).toHaveBeenCalledWith({
        success: true,
        data: {
          unreadCount: 2,
          notifications: [{ id: '1', title: 'Test Alert' }]
        }
      });
    });

    it('should retrieve notifications using req.query.userId and handle unreadOnly=true', async () => {
      const mockResult = { unreadCount: 1, notifications: [] };
      jest.spyOn(NotificationModel, 'findByUser').mockResolvedValue(mockResult);

      const req = {
        query: { userId: 'query_user', unreadOnly: 'true', limit: '10' }
      };
      const res = mockResponse();

      await getNotifications(req, res);

      expect(NotificationModel.findByUser).toHaveBeenCalledWith('query_user', {
        unreadOnly: true,
        limit: 10
      });
      expect(res.status).toHaveBeenCalledWith(200);
    });

    it('should return 500 when database query throws an error', async () => {
      jest.spyOn(NotificationModel, 'findByUser').mockRejectedValue(new Error('DB Error'));

      const req = { user: { id: 'user1' } };
      const res = mockResponse();

      await getNotifications(req, res);

      expect(res.status).toHaveBeenCalledWith(500);
      expect(res.json).toHaveBeenCalledWith({
        success: false,
        error: 'Failed to fetch notifications',
        details: 'DB Error'
      });
    });
  });

  describe('markAsRead', () => {
    it('should return 401 if user is unauthenticated', async () => {
      const req = { params: { notificationId: 'n1' } };
      const res = mockResponse();

      await markAsRead(req, res);

      expect(res.status).toHaveBeenCalledWith(401);
      expect(res.json).toHaveBeenCalledWith({
        success: false,
        error: 'Authentication required'
      });
    });

    it('should return 400 if notificationId is missing', async () => {
      const req = { user: { id: 'user1' }, params: {} };
      const res = mockResponse();

      await markAsRead(req, res);

      expect(res.status).toHaveBeenCalledWith(400);
      expect(res.json).toHaveBeenCalledWith({
        success: false,
        error: 'Notification ID is required'
      });
    });

    it('should return 404 if notification is not found', async () => {
      jest.spyOn(NotificationModel, 'findById').mockResolvedValue(null);

      const req = { user: { id: 'user1' }, params: { notificationId: 'n999' } };
      const res = mockResponse();

      await markAsRead(req, res);

      expect(res.status).toHaveBeenCalledWith(404);
      expect(res.json).toHaveBeenCalledWith({
        success: false,
        error: 'Notification not found'
      });
    });

    it('should return 403 if notification belongs to another user', async () => {
      jest.spyOn(NotificationModel, 'findById').mockResolvedValue({
        id: 'n1',
        userId: 'other_user'
      });

      const req = { user: { id: 'user1' }, params: { notificationId: 'n1' } };
      const res = mockResponse();

      await markAsRead(req, res);

      expect(res.status).toHaveBeenCalledWith(403);
      expect(res.json).toHaveBeenCalledWith({
        success: false,
        error: 'Access denied: You can only update your own notifications'
      });
    });

    it('should return 200 with already read message if notification is read', async () => {
      const notification = {
        id: 'n1',
        userId: 'user1',
        isRead: true
      };
      jest.spyOn(NotificationModel, 'findById').mockResolvedValue(notification);

      const req = { user: { id: 'user1' }, params: { notificationId: 'n1' } };
      const res = mockResponse();

      await markAsRead(req, res);

      expect(res.status).toHaveBeenCalledWith(200);
      expect(res.json).toHaveBeenCalledWith({
        success: true,
        message: 'Notification is already marked as read',
        data: notification
      });
    });

    it('should update notification successfully if unread and owned by user', async () => {
      const notification = {
        id: 'n1',
        userId: 'user1',
        isRead: false
      };
      const updatedNotification = {
        ...notification,
        isRead: true,
        readAt: expect.any(Date)
      };

      jest.spyOn(NotificationModel, 'findById').mockResolvedValue(notification);
      jest.spyOn(NotificationModel, 'update').mockResolvedValue(updatedNotification);

      const req = { body: { userId: 'user1' }, params: { notificationId: 'n1' } };
      const res = mockResponse();

      await markAsRead(req, res);

      expect(NotificationModel.update).toHaveBeenCalledWith('n1', {
        isRead: true,
        readAt: expect.any(Date)
      });
      expect(res.status).toHaveBeenCalledWith(200);
      expect(res.json).toHaveBeenCalledWith({
        success: true,
        message: 'Notification marked as read',
        data: updatedNotification
      });
    });

    it('should return 500 if database operation fails', async () => {
      jest.spyOn(NotificationModel, 'findById').mockRejectedValue(new Error('Update error'));

      const req = { user: { id: 'user1' }, params: { notificationId: 'n1' } };
      const res = mockResponse();

      await markAsRead(req, res);

      expect(res.status).toHaveBeenCalledWith(500);
      expect(res.json).toHaveBeenCalledWith({
        success: false,
        error: 'Failed to update notification',
        details: 'Update error'
      });
    });
  });

  describe('markAllAsRead', () => {
    it('should return 401 if userId is missing', async () => {
      const req = {};
      const res = mockResponse();

      await markAllAsRead(req, res);

      expect(res.status).toHaveBeenCalledWith(401);
      expect(res.json).toHaveBeenCalledWith({
        success: false,
        error: 'Authentication required'
      });
    });

    it('should mark all notifications as read successfully', async () => {
      jest.spyOn(NotificationModel, 'markAllReadForUser').mockResolvedValue({ count: 5 });

      const req = { user: { id: 'user1' } };
      const res = mockResponse();

      await markAllAsRead(req, res);

      expect(NotificationModel.markAllReadForUser).toHaveBeenCalledWith('user1');
      expect(res.status).toHaveBeenCalledWith(200);
      expect(res.json).toHaveBeenCalledWith({
        success: true,
        message: 'All notifications marked as read',
        data: {
          updatedCount: 5
        }
      });
    });

    it('should fallback to body.userId if req.user is undefined', async () => {
      jest.spyOn(NotificationModel, 'markAllReadForUser').mockResolvedValue({ count: 3 });

      const req = { body: { userId: 'user_body' } };
      const res = mockResponse();

      await markAllAsRead(req, res);

      expect(NotificationModel.markAllReadForUser).toHaveBeenCalledWith('user_body');
      expect(res.status).toHaveBeenCalledWith(200);
    });

    it('should return 500 when database call fails', async () => {
      jest.spyOn(NotificationModel, 'markAllReadForUser').mockRejectedValue(new Error('Bulk update failed'));

      const req = { user: { id: 'user1' } };
      const res = mockResponse();

      await markAllAsRead(req, res);

      expect(res.status).toHaveBeenCalledWith(500);
      expect(res.json).toHaveBeenCalledWith({
        success: false,
        error: 'Failed to mark notifications as read',
        details: 'Bulk update failed'
      });
    });
  });

  describe('NotificationModel default methods', () => {
    it('should execute default mock methods', async () => {
      await expect(NotificationModel.findByUser('1', {})).resolves.toEqual({
        unreadCount: 0,
        notifications: []
      });
      await expect(NotificationModel.findById('1')).resolves.toBeNull();
      await expect(NotificationModel.update('1', { isRead: true })).resolves.toEqual({
        id: '1',
        isRead: true
      });
      await expect(NotificationModel.markAllReadForUser('1')).resolves.toEqual({ count: 0 });
    });
  });
});