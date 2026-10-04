import { jest } from '@jest/globals';
import {
  ingestWebhook,
  getDeliveryStatus,
  WebhookEventStore,
  EventDispatcher
} from '../dataset/24_webhook_controller.js';

describe('Webhook Controller', () => {
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
    jest.clearAllMocks();
  });

  describe('ingestWebhook', () => {
    const validToken = 'wh_secret_live_tok_abc123';
    const validPayload = {
      eventId: 'evt_123',
      eventType: 'payment.succeeded',
      payload: { amount: 1000, currency: 'usd' }
    };

    it('should return 401 if req.headers is missing or token is absent', async () => {
      req.headers = undefined;

      await ingestWebhook(req, res);

      expect(res.status).toHaveBeenCalledWith(401);
      expect(res.json).toHaveBeenCalledWith({
        success: false,
        error: 'Unauthorized: Invalid or missing x-webhook-token header'
      });
    });

    it('should return 401 if x-webhook-token is unauthorized', async () => {
      req.headers['x-webhook-token'] = 'invalid_token';

      await ingestWebhook(req, res);

      expect(res.status).toHaveBeenCalledWith(401);
      expect(res.json).toHaveBeenCalledWith({
        success: false,
        error: 'Unauthorized: Invalid or missing x-webhook-token header'
      });
    });

    it('should return 400 if required payload fields are missing', async () => {
      req.headers['x-webhook-token'] = validToken;
      req.body = { eventId: 'evt_123' }; // Missing eventType and payload

      await ingestWebhook(req, res);

      expect(res.status).toHaveBeenCalledWith(400);
      expect(res.json).toHaveBeenCalledWith({
        success: false,
        error: 'Missing required payload fields: eventId, eventType, and payload are required'
      });
    });

    it('should acknowledge duplicate event with 200 status', async () => {
      req.headers['x-webhook-token'] = validToken;
      req.body = validPayload;

      jest.spyOn(WebhookEventStore, 'findEvent').mockResolvedValueOnce({
        id: 'evt_123',
        eventType: 'payment.succeeded'
      });

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

    it('should successfully ingest new event and return 202 status (provided timestamp)', async () => {
      const timestamp = '2023-10-01T12:00:00Z';
      req.headers['x-webhook-token'] = validToken;
      req.body = { ...validPayload, timestamp };

      jest.spyOn(WebhookEventStore, 'findEvent').mockResolvedValueOnce(null);
      jest.spyOn(WebhookEventStore, 'saveEvent').mockResolvedValueOnce({
        id: 'evt_123',
        eventType: 'payment.succeeded',
        timestamp,
        payload: validPayload.payload
      });
      jest.spyOn(EventDispatcher, 'dispatch').mockResolvedValueOnce({
        queued: true,
        queueId: 'job_999'
      });

      await ingestWebhook(req, res);

      expect(WebhookEventStore.saveEvent).toHaveBeenCalledWith({
        eventId: 'evt_123',
        eventType: 'payment.succeeded',
        timestamp,
        payload: validPayload.payload
      });
      expect(EventDispatcher.dispatch).toHaveBeenCalledWith('payment.succeeded', validPayload.payload);
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

    it('should use default ISO timestamp if timestamp is not provided', async () => {
      req.headers['x-webhook-token'] = 'wh_secret_test_tok_xyz789';
      req.body = validPayload;

      jest.spyOn(WebhookEventStore, 'findEvent').mockResolvedValueOnce(null);
      jest.spyOn(WebhookEventStore, 'saveEvent').mockResolvedValueOnce({
        id: 'evt_123',
        eventType: 'payment.succeeded',
        payload: validPayload.payload
      });
      jest.spyOn(EventDispatcher, 'dispatch').mockResolvedValueOnce({
        queued: true,
        queueId: 'job_888'
      });

      await ingestWebhook(req, res);

      expect(WebhookEventStore.saveEvent).toHaveBeenCalledWith(
        expect.objectContaining({
          eventId: 'evt_123',
          timestamp: expect.any(String)
        })
      );
      expect(res.status).toHaveBeenCalledWith(202);
    });

    it('should return 500 when an internal server error occurs', async () => {
      req.headers['x-webhook-token'] = validToken;
      req.body = validPayload;

      jest.spyOn(WebhookEventStore, 'findEvent').mockRejectedValueOnce(new Error('Database error'));

      await ingestWebhook(req, res);

      expect(res.status).toHaveBeenCalledWith(500);
      expect(res.json).toHaveBeenCalledWith({
        success: false,
        error: 'Failed to ingest webhook event',
        details: 'Database error'
      });
    });
  });

  describe('getDeliveryStatus', () => {
    it('should return 400 if eventId parameter is missing', async () => {
      req.params = {};

      await getDeliveryStatus(req, res);

      expect(res.status).toHaveBeenCalledWith(400);
      expect(res.json).toHaveBeenCalledWith({
        success: false,
        error: 'Event ID parameter is required'
      });
    });

    it('should return 404 if status is not found', async () => {
      req.params = { eventId: 'evt_404' };
      jest.spyOn(WebhookEventStore, 'getDeliveryStatus').mockResolvedValueOnce(null);

      await getDeliveryStatus(req, res);

      expect(WebhookEventStore.getDeliveryStatus).toHaveBeenCalledWith('evt_404');
      expect(res.status).toHaveBeenCalledWith(404);
      expect(res.json).toHaveBeenCalledWith({
        success: false,
        error: 'Webhook event with ID evt_404 was not found'
      });
    });

    it('should return 200 with delivery status data if found', async () => {
      const mockStatus = { eventId: 'evt_123', delivered: true, attempts: 1 };
      req.params = { eventId: 'evt_123' };
      jest.spyOn(WebhookEventStore, 'getDeliveryStatus').mockResolvedValueOnce(mockStatus);

      await getDeliveryStatus(req, res);

      expect(WebhookEventStore.getDeliveryStatus).toHaveBeenCalledWith('evt_123');
      expect(res.status).toHaveBeenCalledWith(200);
      expect(res.json).toHaveBeenCalledWith({
        success: true,
        data: mockStatus
      });
    });

    it('should return 500 when an error occurs while getting status', async () => {
      req.params = { eventId: 'evt_500' };
      jest.spyOn(WebhookEventStore, 'getDeliveryStatus').mockRejectedValueOnce(new Error('Read failure'));

      await getDeliveryStatus(req, res);

      expect(res.status).toHaveBeenCalledWith(500);
      expect(res.json).toHaveBeenCalledWith({
        success: false,
        error: 'Failed to check event delivery status',
        details: 'Read failure'
      });
    });
  });
});