import { jest } from '@jest/globals';
import {
  ingestWebhook,
  getDeliveryStatus,
  WebhookEventStore,
  EventDispatcher
} from '../dataset/24_webhook_controller.js';

describe('24_webhook_controller tests', () => {
  let req;
  let res;

  beforeEach(() => {
    req = {
      headers: {},
      body: {},
      params: {}
    };
    res = {
      status: jest.fn().mockReturnThis(),
      json: jest.fn().mockReturnThis()
    };
    jest.restoreAllMocks();
  });

  describe('WebhookEventStore and EventDispatcher default methods', () => {
    test('default WebhookEventStore methods behave as expected', async () => {
      expect(await WebhookEventStore.findEvent('evt_1')).toBeNull();
      const saved = await WebhookEventStore.saveEvent({ eventId: 'evt_1', type: 'test' });
      expect(saved.id).toBe('evt_1');
      expect(saved.receivedAt).toBeInstanceOf(Date);
      expect(await WebhookEventStore.getDeliveryStatus('evt_1')).toBeNull();
    });

    test('default EventDispatcher method behaves as expected', async () => {
      const dispatched = await EventDispatcher.dispatch('user.created', { id: 1 });
      expect(dispatched.queued).toBe(true);
      expect(dispatched.queueId).toMatch(/^job_/);
    });
  });

  describe('ingestWebhook', () => {
    test('should return 401 if req.headers is undefined or token is missing', async () => {
      delete req.headers;
      await ingestWebhook(req, res);
      expect(res.status).toHaveBeenCalledWith(401);
      expect(res.json).toHaveBeenCalledWith({
        success: false,
        error: 'Unauthorized: Invalid or missing x-webhook-token header'
      });
    });

    test('should return 401 if token is invalid', async () => {
      req.headers = { 'x-webhook-token': 'invalid_token' };
      await ingestWebhook(req, res);
      expect(res.status).toHaveBeenCalledWith(401);
      expect(res.json).toHaveBeenCalledWith({
        success: false,
        error: 'Unauthorized: Invalid or missing x-webhook-token header'
      });
    });

    test('should return 400 if required body fields are missing', async () => {
      req.headers = { 'x-webhook-token': 'wh_secret_live_tok_abc123' };
      req.body = { eventId: 'evt_100', eventType: 'order.created' };

      await ingestWebhook(req, res);
      expect(res.status).toHaveBeenCalledWith(400);
      expect(res.json).toHaveBeenCalledWith({
        success: false,
        error: 'Missing required payload fields: eventId, eventType, and payload are required'
      });
    });

    test('should return 400 if req.body is null', async () => {
      req.headers = { 'x-webhook-token': 'wh_secret_live_tok_abc123' };
      req.body = null;

      await ingestWebhook(req, res);
      expect(res.status).toHaveBeenCalledWith(400);
      expect(res.json).toHaveBeenCalledWith({
        success: false,
        error: 'Missing required payload fields: eventId, eventType, and payload are required'
      });
    });

    test('should return 200 if duplicate event is found', async () => {
      req.headers = { 'x-webhook-token': 'wh_secret_live_tok_abc123' };
      req.body = {
        eventId: 'evt_dup',
        eventType: 'payment.succeeded',
        payload: { amount: 100 }
      };

      jest.spyOn(WebhookEventStore, 'findEvent').mockResolvedValue({ id: 'evt_dup' });

      await ingestWebhook(req, res);
      expect(res.status).toHaveBeenCalledWith(200);
      expect(res.json).toHaveBeenCalledWith({
        success: true,
        message: 'Duplicate event acknowledged',
        duplicate: true,
        eventId: 'evt_dup'
      });
    });

    test('should accept and queue event successfully when payload is valid', async () => {
      req.headers = { 'x-webhook-token': 'wh_secret_test_tok_xyz789' };
      req.body = {
        eventId: 'evt_new',
        eventType: 'user.registered',
        timestamp: '2026-01-01T00:00:00.000Z',
        payload: { userId: 'usr_123' }
      };

      jest.spyOn(WebhookEventStore, 'findEvent').mockResolvedValue(null);
      jest.spyOn(WebhookEventStore, 'saveEvent').mockResolvedValue({ id: 'evt_new' });
      jest.spyOn(EventDispatcher, 'dispatch').mockResolvedValue({ queued: true, queueId: 'job_999' });

      await ingestWebhook(req, res);

      expect(WebhookEventStore.saveEvent).toHaveBeenCalledWith({
        eventId: 'evt_new',
        eventType: 'user.registered',
        timestamp: '2026-01-01T00:00:00.000Z',
        payload: { userId: 'usr_123' }
      });
      expect(EventDispatcher.dispatch).toHaveBeenCalledWith('user.registered', { userId: 'usr_123' });
      expect(res.status).toHaveBeenCalledWith(202);
      expect(res.json).toHaveBeenCalledWith({
        success: true,
        message: 'Event accepted for asynchronous processing',
        data: {
          eventId: 'evt_new',
          queueJobId: 'job_999',
          status: 'queued'
        }
      });
    });

    test('should use generated timestamp if timestamp is not provided', async () => {
      req.headers = { 'x-webhook-token': 'wh_secret_live_tok_abc123' };
      req.body = {
        eventId: 'evt_no_ts',
        eventType: 'item.updated',
        payload: { itemId: 'item_1' }
      };

      jest.spyOn(WebhookEventStore, 'findEvent').mockResolvedValue(null);
      jest.spyOn(WebhookEventStore, 'saveEvent').mockImplementation(async (data) => ({ id: data.eventId }));

      await ingestWebhook(req, res);

      expect(WebhookEventStore.saveEvent).toHaveBeenCalledWith(
        expect.objectContaining({
          eventId: 'evt_no_ts',
          timestamp: expect.any(String)
        })
      );
      expect(res.status).toHaveBeenCalledWith(202);
    });

    test('should handle internal errors and return 500', async () => {
      req.headers = { 'x-webhook-token': 'wh_secret_live_tok_abc123' };
      req.body = {
        eventId: 'evt_err',
        eventType: 'error.test',
        payload: {}
      };

      jest.spyOn(WebhookEventStore, 'findEvent').mockRejectedValue(new Error('DB Connection Failed'));

      await ingestWebhook(req, res);

      expect(res.status).toHaveBeenCalledWith(500);
      expect(res.json).toHaveBeenCalledWith({
        success: false,
        error: 'Failed to ingest webhook event',
        details: 'DB Connection Failed'
      });
    });
  });

  describe('getDeliveryStatus', () => {
    test('should return 400 if eventId is missing from req.params', async () => {
      req.params = {};
      await getDeliveryStatus(req, res);
      expect(res.status).toHaveBeenCalledWith(400);
      expect(res.json).toHaveBeenCalledWith({
        success: false,
        error: 'Event ID parameter is required'
      });
    });

    test('should return 400 if req.params is null', async () => {
      req.params = null;
      await getDeliveryStatus(req, res);
      expect(res.status).toHaveBeenCalledWith(400);
      expect(res.json).toHaveBeenCalledWith({
        success: false,
        error: 'Event ID parameter is required'
      });
    });

    test('should return 404 if status is not found', async () => {
      req.params = { eventId: 'evt_missing' };
      jest.spyOn(WebhookEventStore, 'getDeliveryStatus').mockResolvedValue(null);

      await getDeliveryStatus(req, res);
      expect(res.status).toHaveBeenCalledWith(404);
      expect(res.json).toHaveBeenCalledWith({
        success: false,
        error: 'Webhook event with ID evt_missing was not found'
      });
    });

    test('should return 200 with delivery status data if found', async () => {
      req.params = { eventId: 'evt_found' };
      const statusData = { eventId: 'evt_found', status: 'delivered', attempts: 1 };
      jest.spyOn(WebhookEventStore, 'getDeliveryStatus').mockResolvedValue(statusData);

      await getDeliveryStatus(req, res);
      expect(res.status).toHaveBeenCalledWith(200);
      expect(res.json).toHaveBeenCalledWith({
        success: true,
        data: statusData
      });
    });

    test('should return 500 if an error occurs', async () => {
      req.params = { eventId: 'evt_500' };
      jest.spyOn(WebhookEventStore, 'getDeliveryStatus').mockRejectedValue(new Error('Database timeout'));

      await getDeliveryStatus(req, res);
      expect(res.status).toHaveBeenCalledWith(500);
      expect(res.json).toHaveBeenCalledWith({
        success: false,
        error: 'Failed to check event delivery status',
        details: 'Database timeout'
      });
    });
  });
});