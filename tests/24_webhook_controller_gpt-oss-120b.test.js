import { jest } from '@jest/globals';
import {
  ingestWebhook,
  getDeliveryStatus,
  WebhookEventStore,
  EventDispatcher
} from '../dataset/24_webhook_controller.js';

describe('ingestWebhook controller', () => {
  const mockRes = () => {
    const res = {};
    res.status = jest.fn().mockReturnValue(res);
    res.json = jest.fn().mockReturnValue(res);
    return res;
  };

  beforeEach(() => {
    jest.clearAllMocks();
  });

  test('returns 401 when token is missing', async () => {
    const req = { headers: {}, body: {} };
    const res = mockRes();

    await ingestWebhook(req, res);

    expect(res.status).toHaveBeenCalledWith(401);
    expect(res.json).toHaveBeenCalledWith({
      success: false,
      error: 'Unauthorized: Invalid or missing x-webhook-token header'
    });
  });

  test('returns 401 when token is invalid', async () => {
    const req = { headers: { 'x-webhook-token': 'invalid_token' }, body: {} };
    const res = mockRes();

    await ingestWebhook(req, res);

    expect(res.status).toHaveBeenCalledWith(401);
    expect(res.json).toHaveBeenCalledWith({
      success: false,
      error: 'Unauthorized: Invalid or missing x-webhook-token header'
    });
  });

  test('returns 400 when required payload fields are missing', async () => {
    const req = {
      headers: { 'x-webhook-token': 'wh_secret_test_tok_xyz789' },
      body: { eventId: 'e1' } // missing eventType and payload
    };
    const res = mockRes();

    await ingestWebhook(req, res);

    expect(res.status).toHaveBeenCalledWith(400);
    expect(res.json).toHaveBeenCalledWith({
      success: false,
      error: 'Missing required payload fields: eventId, eventType, and payload are required'
    });
  });

  test('returns 200 for duplicate event', async () => {
    const req = {
      headers: { 'x-webhook-token': 'wh_secret_live_tok_abc123' },
      body: {
        eventId: 'dup-123',
        eventType: 'order.created',
        payload: { orderId: 42 }
      }
    };
    const res = mockRes();

    jest.spyOn(WebhookEventStore, 'findEvent').mockResolvedValue({ id: 'dup-123' });

    await ingestWebhook(req, res);

    expect(WebhookEventStore.findEvent).toHaveBeenCalledWith('dup-123');
    expect(res.status).toHaveBeenCalledWith(200);
    expect(res.json).toHaveBeenCalledWith({
      success: true,
      message: 'Duplicate event acknowledged',
      duplicate: true,
      eventId: 'dup-123'
    });
  });

  test('processes new event successfully', async () => {
    const req = {
      headers: { 'x-webhook-token': 'wh_secret_live_tok_abc123' },
      body: {
        eventId: 'new-456',
        eventType: 'payment.succeeded',
        timestamp: '2023-01-01T00:00:00Z',
        payload: { amount: 100 }
      }
    };
    const res = mockRes();

    jest.spyOn(WebhookEventStore, 'findEvent').mockResolvedValue(null);
    const savedRecord = { id: 'new-456', eventId: 'new-456', eventType: 'payment.succeeded', timestamp: '2023-01-01T00:00:00Z', payload: { amount: 100 }, receivedAt: new Date() };
    jest.spyOn(WebhookEventStore, 'saveEvent').mockResolvedValue(savedRecord);
    const dispatchResult = { queued: true, queueId: 'job_12345' };
    jest.spyOn(EventDispatcher, 'dispatch').mockResolvedValue(dispatchResult);

    await ingestWebhook(req, res);

    expect(WebhookEventStore.findEvent).toHaveBeenCalledWith('new-456');
    expect(WebhookEventStore.saveEvent).toHaveBeenCalledWith({
      eventId: 'new-456',
      eventType: 'payment.succeeded',
      timestamp: '2023-01-01T00:00:00Z',
      payload: { amount: 100 }
    });
    expect(EventDispatcher.dispatch).toHaveBeenCalledWith('payment.succeeded', { amount: 100 });

    expect(res.status).toHaveBeenCalledWith(202);
    expect(res.json).toHaveBeenCalledWith({
      success: true,
      message: 'Event accepted for asynchronous processing',
      data: {
        eventId: savedRecord.id,
        queueJobId: dispatchResult.queueId,
        status: 'queued'
      }
    });
  });

  test('handles unexpected errors with 500', async () => {
    const req = {
      headers: { 'x-webhook-token': 'wh_secret_live_tok_abc123' },
      body: {
        eventId: 'err-789',
        eventType: 'user.signup',
        payload: { userId: 7 }
      }
    };
    const res = mockRes();

    jest.spyOn(WebhookEventStore, 'findEvent').mockResolvedValue(null);
    jest.spyOn(WebhookEventStore, 'saveEvent').mockRejectedValue(new Error('DB failure'));

    await ingestWebhook(req, res);

    expect(res.status).toHaveBeenCalledWith(500);
    expect(res.json).toHaveBeenCalledWith({
      success: false,
      error: 'Failed to ingest webhook event',
      details: 'DB failure'
    });
  });
});

describe('getDeliveryStatus controller', () => {
  const mockRes = () => {
    const res = {};
    res.status = jest.fn().mockReturnValue(res);
    res.json = jest.fn().mockReturnValue(res);
    return res;
  };

  beforeEach(() => {
    jest.clearAllMocks();
  });

  test('returns 400 when eventId param is missing', async () => {
    const req = { params: {} };
    const res = mockRes();

    await getDeliveryStatus(req, res);

    expect(res.status).toHaveBeenCalledWith(400);
    expect(res.json).toHaveBeenCalledWith({
      success: false,
      error: 'Event ID parameter is required'
    });
  });

  test('returns 404 when event status is not found', async () => {
    const req = { params: { eventId: 'unknown-1' } };
    const res = mockRes();

    jest.spyOn(WebhookEventStore, 'getDeliveryStatus').mockResolvedValue(null);

    await getDeliveryStatus(req, res);

    expect(WebhookEventStore.getDeliveryStatus).toHaveBeenCalledWith('unknown-1');
    expect(res.status).toHaveBeenCalledWith(404);
    expect(res.json).toHaveBeenCalledWith({
      success: false,
      error: 'Webhook event with ID unknown-1 was not found'
    });
  });

  test('returns 200 with status data when found', async () => {
    const req = { params: { eventId: 'found-2' } };
    const res = mockRes();

    const statusData = { deliveredAt: '2023-01-02T12:00:00Z', status: 'delivered' };
    jest.spyOn(WebhookEventStore, 'getDeliveryStatus').mockResolvedValue(statusData);

    await getDeliveryStatus(req, res);

    expect(WebhookEventStore.getDeliveryStatus).toHaveBeenCalledWith('found-2');
    expect(res.status).toHaveBeenCalledWith(200);
    expect(res.json).toHaveBeenCalledWith({
      success: true,
      data: statusData
    });
  });

  test('handles unexpected errors with 500', async () => {
    const req = { params: { eventId: 'error-3' } };
    const res = mockRes();

    jest.spyOn(WebhookEventStore, 'getDeliveryStatus').mockRejectedValue(new Error('Redis down'));

    await getDeliveryStatus(req, res);

    expect(res.status).toHaveBeenCalledWith(500);
    expect(res.json).toHaveBeenCalledWith({
      success: false,
      error: 'Failed to check event delivery status',
      details: 'Redis down'
    });
  });
});