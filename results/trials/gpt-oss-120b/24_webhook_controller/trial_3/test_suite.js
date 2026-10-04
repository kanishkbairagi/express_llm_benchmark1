import { jest } from '@jest/globals';
import {
  ingestWebhook,
  getDeliveryStatus,
  WebhookEventStore,
  EventDispatcher
} from '../dataset/24_webhook_controller.js';

describe('Webhook Controller - ingestWebhook', () => {
  const makeRes = () => {
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
    const res = makeRes();

    await ingestWebhook(req, res);

    expect(res.status).toHaveBeenCalledWith(401);
    expect(res.json).toHaveBeenCalledWith({
      success: false,
      error: 'Unauthorized: Invalid or missing x-webhook-token header'
    });
  });

  test('returns 401 when token is invalid', async () => {
    const req = { headers: { 'x-webhook-token': 'invalid' }, body: {} };
    const res = makeRes();

    await ingestWebhook(req, res);

    expect(res.status).toHaveBeenCalledWith(401);
  });

  test('returns 400 when required payload fields are missing', async () => {
    const req = {
      headers: { 'x-webhook-token': 'wh_secret_test_tok_xyz789' },
      body: { eventId: 'e1' } // missing eventType and payload
    };
    const res = makeRes();

    await ingestWebhook(req, res);

    expect(res.status).toHaveBeenCalledWith(400);
    expect(res.json).toHaveBeenCalledWith({
      success: false,
      error: 'Missing required payload fields: eventId, eventType, and payload are required'
    });
  });

  test('acknowledges duplicate event', async () => {
    const existing = { id: 'e1' };
    jest.spyOn(WebhookEventStore, 'findEvent').mockResolvedValue(existing);

    const req = {
      headers: { 'x-webhook-token': 'wh_secret_live_tok_abc123' },
      body: { eventId: 'e1', eventType: 'order.created', payload: { foo: 'bar' } }
    };
    const res = makeRes();

    await ingestWebhook(req, res);

    expect(WebhookEventStore.findEvent).toHaveBeenCalledWith('e1');
    expect(res.status).toHaveBeenCalledWith(200);
    expect(res.json).toHaveBeenCalledWith({
      success: true,
      message: 'Duplicate event acknowledged',
      duplicate: true,
      eventId: 'e1'
    });
  });

  test('processes new event successfully', async () => {
    jest.spyOn(WebhookEventStore, 'findEvent').mockResolvedValue(null);
    const saved = { id: 'e2', eventId: 'e2' };
    jest.spyOn(WebhookEventStore, 'saveEvent').mockResolvedValue(saved);
    const dispatched = { queued: true, queueId: 'job_12345' };
    jest.spyOn(EventDispatcher, 'dispatch').mockResolvedValue(dispatched);

    const req = {
      headers: { 'x-webhook-token': 'wh_secret_test_tok_xyz789' },
      body: {
        eventId: 'e2',
        eventType: 'user.signup',
        timestamp: '2024-01-01T00:00:00Z',
        payload: { userId: 42 }
      }
    };
    const res = makeRes();

    await ingestWebhook(req, res);

    expect(WebhookEventStore.findEvent).toHaveBeenCalledWith('e2');
    expect(WebhookEventStore.saveEvent).toHaveBeenCalledWith({
      eventId: 'e2',
      eventType: 'user.signup',
      timestamp: '2024-01-01T00:00:00Z',
      payload: { userId: 42 }
    });
    expect(EventDispatcher.dispatch).toHaveBeenCalledWith('user.signup', { userId: 42 });

    expect(res.status).toHaveBeenCalledWith(202);
    expect(res.json).toHaveBeenCalledWith({
      success: true,
      message: 'Event accepted for asynchronous processing',
      data: {
        eventId: saved.id,
        queueJobId: dispatched.queueId,
        status: 'queued'
      }
    });
  });

  test('handles unexpected errors with 500', async () => {
    jest.spyOn(WebhookEventStore, 'findEvent').mockImplementation(() => {
      throw new Error('DB failure');
    });

    const req = {
      headers: { 'x-webhook-token': 'wh_secret_live_tok_abc123' },
      body: {
        eventId: 'e3',
        eventType: 'order.canceled',
        payload: {}
      }
    };
    const res = makeRes();

    await ingestWebhook(req, res);

    expect(res.status).toHaveBeenCalledWith(500);
    expect(res.json).toHaveBeenCalledWith(
      expect.objectContaining({
        success: false,
        error: 'Failed to ingest webhook event',
        details: 'DB failure'
      })
    );
  });
});

describe('Webhook Controller - getDeliveryStatus', () => {
  const makeRes = () => {
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
    const res = makeRes();

    await getDeliveryStatus(req, res);

    expect(res.status).toHaveBeenCalledWith(400);
    expect(res.json).toHaveBeenCalledWith({
      success: false,
      error: 'Event ID parameter is required'
    });
  });

  test('returns 404 when status not found', async () => {
    jest.spyOn(WebhookEventStore, 'getDeliveryStatus').mockResolvedValue(null);

    const req = { params: { eventId: 'not-found' } };
    const res = makeRes();

    await getDeliveryStatus(req, res);

    expect(WebhookEventStore.getDeliveryStatus).toHaveBeenCalledWith('not-found');
    expect(res.status).toHaveBeenCalledWith(404);
    expect(res.json).toHaveBeenCalledWith({
      success: false,
      error: 'Webhook event with ID not-found was not found'
    });
  });

  test('returns 200 with status data on success', async () => {
    const statusData = { deliveredAt: '2024-01-02T12:00:00Z', status: 'delivered' };
    jest.spyOn(WebhookEventStore, 'getDeliveryStatus').mockResolvedValue(statusData);

    const req = { params: { eventId: 'e4' } };
    const res = makeRes();

    await getDeliveryStatus(req, res);

    expect(WebhookEventStore.getDeliveryStatus).toHaveBeenCalledWith('e4');
    expect(res.status).toHaveBeenCalledWith(200);
    expect(res.json).toHaveBeenCalledWith({
      success: true,
      data: statusData
    });
  });

  test('handles unexpected errors with 500', async () => {
    jest.spyOn(WebhookEventStore, 'getDeliveryStatus').mockImplementation(() => {
      throw new Error('Unexpected DB error');
    });

    const req = { params: { eventId: 'e5' } };
    const res = makeRes();

    await getDeliveryStatus(req, res);

    expect(res.status).toHaveBeenCalledWith(500);
    expect(res.json).toHaveBeenCalledWith(
      expect.objectContaining({
        success: false,
        error: 'Failed to check event delivery status',
        details: 'Unexpected DB error'
      })
    );
  });
});