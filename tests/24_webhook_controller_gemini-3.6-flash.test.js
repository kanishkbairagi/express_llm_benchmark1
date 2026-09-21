import { jest } from '@jest/globals';
import {
  WebhookEventStore,
  EventDispatcher,
  ingestWebhook,
  getDeliveryStatus
} from '../dataset/24_webhook_controller.js';

describe('24_webhook_controller Unit Tests', () => {
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

  describe('WebhookEventStore and EventDispatcher direct calls', () => {
    test('WebhookEventStore default implementations work', async () => {
      const findRes = await WebhookEventStore.findEvent('evt_123');
      expect(findRes).toBeNull();

      const saveRes = await WebhookEventStore.saveEvent({ eventId: 'evt_123', eventType: 'user.created' });
      expect(saveRes).toHaveProperty('id', 'evt_123');
      expect(saveRes).toHaveProperty('receivedAt');

      const statusRes = await WebhookEventStore.getDeliveryStatus('evt_123');
      expect(statusRes).toBeNull();
    });

    test('EventDispatcher default implementation works', async () => {
      const dispatchRes = await EventDispatcher.dispatch('user.created', { id: 1 });
      expect(dispatchRes.queued).toBe(true);
      expect(dispatchRes.queueId).toMatch(/^job_\d+/);
    });
  });

  describe('ingestWebhook', () => {
    const validToken = 'wh_secret_live_tok_abc123';

    test('should return 401 if headers object is missing or token is missing', async () => {
      req = {}; // no headers property

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

    test('should return 400 if req.body is missing or required fields are missing', async () => {
      req.headers = { 'x-webhook-token': validToken };
      req.body = { eventId: 'evt_123' }; // missing eventType & payload

      await ingestWebhook(req, res);

      expect(res.status).toHaveBeenCalledWith(400);
      expect(res.json).toHaveBeenCalledWith({
        success: false,
        error: 'Missing required payload fields: eventId, eventType, and payload are required'
      });
    });

    test('should return 400 if req.body is completely undefined', async () => {
      req.headers = { 'x-webhook-token': validToken };
      delete req.body;

      await ingestWebhook(req, res);

      expect(res.status).toHaveBeenCalledWith(400);
      expect(res.json).toHaveBeenCalledWith({
        success: false,
        error: 'Missing required payload fields: eventId, eventType, and payload are required'
      });
    });

    test('should return 200 if duplicate event exists', async () => {
      req.headers = { 'x-webhook-token': validToken };
      req.body = {
        eventId: 'evt_123',
        eventType: 'payment.succeeded',
        payload: { amount: 1000 }
      };

      jest.spyOn(WebhookEventStore, 'findEvent').mockResolvedValueOnce({ id: 'evt_123' });

      await ingestWebhook(req, res);

      expect(WebhookEventStore.findEvent).toHaveBeenCalledWith('evt_123');
      expect(res.status).toHaveBeenCalledWith(200);
      expect(res.json).toHaveBeenCalledWith({
        success: true,
        message: 'Duplicate event acknowledged',
        duplicate: true,
        eventId: 'evt_123'
      });
    });

    test('should return 202 on successful ingestion with custom timestamp', async () => {
      req.headers = { 'x-webhook-token': validToken };
      req.body = {
        eventId: 'evt_123',
        eventType: 'payment.succeeded',
        timestamp: '2023-01-01T00:00:00.000Z',
        payload: { amount: 1000 }
      };

      jest.spyOn(WebhookEventStore, 'findEvent').mockResolvedValueOnce(null);
      jest.spyOn(WebhookEventStore, 'saveEvent').mockResolvedValueOnce({ id: 'evt_123' });
      jest.spyOn(EventDispatcher, 'dispatch').mockResolvedValueOnce({ queueId: 'job_999' });

      await ingestWebhook(req, res);

      expect(WebhookEventStore.saveEvent).toHaveBeenCalledWith({
        eventId: 'evt_123',
        eventType: 'payment.succeeded',
        timestamp: '2023-01-01T00:00:00.000Z',
        payload: { amount: 1000 }
      });
      expect(EventDispatcher.dispatch).toHaveBeenCalledWith('payment.succeeded', { amount: 1000 });
      expect(res.status).toHaveBeenCalledWith(202);
      expect(res.json).toHaveBeenCalledWith({
        success: true,
        message: 'Event accepted for asynchronous processing',
        data: {
          eventId: 'evt_123',
          queueJobId: 'job_999',
          status: 'queued'
        }
      });
    });

    test('should generate ISO timestamp if not provided in payload', async () => {
      req.headers = { 'x-webhook-token': 'wh_secret_test_tok_xyz789' };
      req.body = {
        eventId: 'evt_456',
        eventType: 'order.created',
        payload: { orderId: 'ord_1' }
      };

      jest.spyOn(WebhookEventStore, 'findEvent').mockResolvedValueOnce(null);
      jest.spyOn(WebhookEventStore, 'saveEvent').mockResolvedValueOnce({ id: 'evt_456' });
      jest.spyOn(EventDispatcher, 'dispatch').mockResolvedValueOnce({ queueId: 'job_100' });

      await ingestWebhook(req, res);

      expect(WebhookEventStore.saveEvent).toHaveBeenCalledWith(
        expect.objectContaining({
          eventId: 'evt_456',
          timestamp: expect.any(String)
        })
      );
      expect(res.status).toHaveBeenCalledWith(202);
    });

    test('should return 500 when an internal exception occurs', async () => {
      req.headers = { 'x-webhook-token': validToken };
      req.body = {
        eventId: 'evt_err',
        eventType: 'payment.failed',
        payload: {}
      };

      jest.spyOn(WebhookEventStore, 'findEvent').mockRejectedValueOnce(new Error('Database Connection Failed'));

      await ingestWebhook(req, res);

      expect(res.status).toHaveBeenCalledWith(500);
      expect(res.json).toHaveBeenCalledWith({
        success: false,
        error: 'Failed to ingest webhook event',
        details: 'Database Connection Failed'
      });
    });
  });

  describe('getDeliveryStatus', () => {
    test('should return 400 if eventId parameter is missing or req.params undefined', async () => {
      req = {}; // req.params undefined

      await getDeliveryStatus(req, res);

      expect(res.status).toHaveBeenCalledWith(400);
      expect(res.json).toHaveBeenCalledWith({
        success: false,
        error: 'Event ID parameter is required'
      });
    });

    test('should return 404 if event status is not found', async () => {
      req.params = { eventId: 'evt_missing' };
      jest.spyOn(WebhookEventStore, 'getDeliveryStatus').mockResolvedValueOnce(null);

      await getDeliveryStatus(req, res);

      expect(WebhookEventStore.getDeliveryStatus).toHaveBeenCalledWith('evt_missing');
      expect(res.status).toHaveBeenCalledWith(404);
      expect(res.json).toHaveBeenCalledWith({
        success: false,
        error: 'Webhook event with ID evt_missing was not found'
      });
    });

    test('should return 200 with delivery status data when found', async () => {
      req.params = { eventId: 'evt_found' };
      const mockStatus = { status: 'delivered', attempts: 1 };
      jest.spyOn(WebhookEventStore, 'getDeliveryStatus').mockResolvedValueOnce(mockStatus);

      await getDeliveryStatus(req, res);

      expect(WebhookEventStore.getDeliveryStatus).toHaveBeenCalledWith('evt_found');
      expect(res.status).toHaveBeenCalledWith(200);
      expect(res.json).toHaveBeenCalledWith({
        success: true,
        data: mockStatus
      });
    });

    test('should return 500 when an internal error occurs', async () => {
      req.params = { eventId: 'evt_err' };
      jest.spyOn(WebhookEventStore, 'getDeliveryStatus').mockRejectedValueOnce(new Error('Read Failure'));

      await getDeliveryStatus(req, res);

      expect(res.status).toHaveBeenCalledWith(500);
      expect(res.json).toHaveBeenCalledWith({
        success: false,
        error: 'Failed to check event delivery status',
        details: 'Read Failure'
      });
    });
  });
});