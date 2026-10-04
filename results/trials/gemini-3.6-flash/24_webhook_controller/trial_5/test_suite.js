import { jest } from '@jest/globals';
import {
  ingestWebhook,
  getDeliveryStatus,
  WebhookEventStore,
  EventDispatcher
} from '../dataset/24_webhook_controller.js';

describe('Webhook Controller Unit Tests', () => {
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
    jest.restoreAllMocks();
  });

  describe('ingestWebhook', () => {
    it('should return 401 if x-webhook-token header is missing', async () => {
      req.headers = null;

      await ingestWebhook(req, res);

      expect(res.status).toHaveBeenCalledWith(401);
      expect(res.json).toHaveBeenCalledWith({
        success: false,
        error: 'Unauthorized: Invalid or missing x-webhook-token header'
      });
    });

    it('should return 401 if x-webhook-token is unauthorized', async () => {
      req.headers = { 'x-webhook-token': 'unauthorized_token' };

      await ingestWebhook(req, res);

      expect(res.status).toHaveBeenCalledWith(401);
      expect(res.json).toHaveBeenCalledWith({
        success: false,
        error: 'Unauthorized: Invalid or missing x-webhook-token header'
      });
    });

    it('should return 400 if eventId, eventType, or payload is missing', async () => {
      req.headers = { 'x-webhook-token': 'wh_secret_live_tok_abc123' };
      req.body = { eventId: 'evt_101', eventType: 'user.created' }; // payload missing

      await ingestWebhook(req, res);

      expect(res.status).toHaveBeenCalledWith(400);
      expect(res.json).toHaveBeenCalledWith({
        success: false,
        error: 'Missing required payload fields: eventId, eventType, and payload are required'
      });
    });

    it('should return 200 with duplicate flag if event already exists', async () => {
      req.headers = { 'x-webhook-token': 'wh_secret_live_tok_abc123' };
      req.body = {
        eventId: 'evt_duplicate',
        eventType: 'user.created',
        payload: { userId: 'usr_1' }
      };

      jest.spyOn(WebhookEventStore, 'findEvent').mockResolvedValue({ id: 'evt_duplicate' });

      await ingestWebhook(req, res);

      expect(WebhookEventStore.findEvent).toHaveBeenCalledWith('evt_duplicate');
      expect(res.status).toHaveBeenCalledWith(200);
      expect(res.json).toHaveBeenCalledWith({
        success: true,
        message: 'Duplicate event acknowledged',
        duplicate: true,
        eventId: 'evt_duplicate'
      });
    });

    it('should return 202 and process event successfully when valid', async () => {
      req.headers = { 'x-webhook-token': 'wh_secret_test_tok_xyz789' };
      req.body = {
        eventId: 'evt_new_1',
        eventType: 'order.placed',
        timestamp: '2023-10-01T12:00:00Z',
        payload: { orderId: 'ord_555' }
      };

      jest.spyOn(WebhookEventStore, 'findEvent').mockResolvedValue(null);
      jest.spyOn(WebhookEventStore, 'saveEvent').mockResolvedValue({
        id: 'evt_new_1',
        eventId: 'evt_new_1',
        eventType: 'order.placed',
        timestamp: '2023-10-01T12:00:00Z',
        payload: { orderId: 'ord_555' }
      });
      jest.spyOn(EventDispatcher, 'dispatch').mockResolvedValue({
        queued: true,
        queueId: 'job_999'
      });

      await ingestWebhook(req, res);

      expect(WebhookEventStore.saveEvent).toHaveBeenCalledWith({
        eventId: 'evt_new_1',
        eventType: 'order.placed',
        timestamp: '2023-10-01T12:00:00Z',
        payload: { orderId: 'ord_555' }
      });
      expect(EventDispatcher.dispatch).toHaveBeenCalledWith('order.placed', { orderId: 'ord_555' });
      expect(res.status).toHaveBeenCalledWith(202);
      expect(res.json).toHaveBeenCalledWith({
        success: true,
        message: 'Event accepted for asynchronous processing',
        data: {
          eventId: 'evt_new_1',
          queueJobId: 'job_999',
          status: 'queued'
        }
      });
    });

    it('should generate a timestamp if not provided in the request body', async () => {
      req.headers = { 'x-webhook-token': 'wh_secret_live_tok_abc123' };
      req.body = {
        eventId: 'evt_no_ts',
        eventType: 'payment.succeeded',
        payload: { amount: 100 }
      };

      jest.spyOn(WebhookEventStore, 'findEvent').mockResolvedValue(null);
      jest.spyOn(WebhookEventStore, 'saveEvent').mockImplementation(async (data) => ({
        id: data.eventId,
        ...data
      }));
      jest.spyOn(EventDispatcher, 'dispatch').mockResolvedValue({ queueId: 'job_123' });

      await ingestWebhook(req, res);

      expect(WebhookEventStore.saveEvent).toHaveBeenCalledWith(
        expect.objectContaining({
          eventId: 'evt_no_ts',
          eventType: 'payment.succeeded',
          timestamp: expect.any(String),
          payload: { amount: 100 }
        })
      );
      expect(res.status).toHaveBeenCalledWith(202);
    });

    it('should return 500 if an internal error occurs during ingestion', async () => {
      req.headers = { 'x-webhook-token': 'wh_secret_live_tok_abc123' };
      req.body = {
        eventId: 'evt_err',
        eventType: 'test.event',
        payload: {}
      };

      jest.spyOn(WebhookEventStore, 'findEvent').mockRejectedValue(new Error('Database error'));

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
      req.params = null;

      await getDeliveryStatus(req, res);

      expect(res.status).toHaveBeenCalledWith(400);
      expect(res.json).toHaveBeenCalledWith({
        success: false,
        error: 'Event ID parameter is required'
      });
    });

    it('should return 404 if event delivery status is not found', async () => {
      req.params = { eventId: 'evt_missing' };

      jest.spyOn(WebhookEventStore, 'getDeliveryStatus').mockResolvedValue(null);

      await getDeliveryStatus(req, res);

      expect(WebhookEventStore.getDeliveryStatus).toHaveBeenCalledWith('evt_missing');
      expect(res.status).toHaveBeenCalledWith(404);
      expect(res.json).toHaveBeenCalledWith({
        success: false,
        error: 'Webhook event with ID evt_missing was not found'
      });
    });

    it('should return 200 with delivery status data when found', async () => {
      req.params = { eventId: 'evt_found' };
      const statusData = { status: 'delivered', attempts: 1, deliveredAt: '2023-10-01' };

      jest.spyOn(WebhookEventStore, 'getDeliveryStatus').mockResolvedValue(statusData);

      await getDeliveryStatus(req, res);

      expect(WebhookEventStore.getDeliveryStatus).toHaveBeenCalledWith('evt_found');
      expect(res.status).toHaveBeenCalledWith(200);
      expect(res.json).toHaveBeenCalledWith({
        success: true,
        data: statusData
      });
    });

    it('should return 500 if checking delivery status throws an error', async () => {
      req.params = { eventId: 'evt_error' };

      jest.spyOn(WebhookEventStore, 'getDeliveryStatus').mockRejectedValue(new Error('Store failure'));

      await getDeliveryStatus(req, res);

      expect(res.status).toHaveBeenCalledWith(500);
      expect(res.json).toHaveBeenCalledWith({
        success: false,
        error: 'Failed to check event delivery status',
        details: 'Store failure'
      });
    });
  });
});