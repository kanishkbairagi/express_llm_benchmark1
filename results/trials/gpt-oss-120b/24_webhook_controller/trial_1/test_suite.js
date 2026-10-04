import { jest } from '@jest/globals';
import {
  ingestWebhook,
  getDeliveryStatus,
  WebhookEventStore,
  EventDispatcher
} from '../dataset/24_webhook_controller.js';

describe('ingestWebhook', () => {
  const makeRes = () => {
    const res = {};
    res.status = jest.fn().mockReturnValue(res);
    res.json = jest.fn().mockReturnValue(res);
    return res;
  };

  afterEach(() => {
    jest.restoreAllMocks();
  });

  test('returns 401 when token header is missing', async () => {
    const req = { headers: {}, body: {} };
    const res = makeRes();

    await ingestWebhook(req, res);

    expect(res.status).toHaveBeenCalledWith(401);
    expect(res.json).toHaveBeenCalledWith({
      success: false,
      error: 'Unauthorized: Invalid or missing x-webhook-token header'
    });
  });

  test('returns 401 when token header is invalid', async () => {
    const req = { headers: { 'x-webhook-token': 'invalid_token' }, body: {} };
    const res = makeRes();

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
    const res = makeRes();

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
      body: { eventId: 'dup-id', eventType: 'typeA', payload: { foo: 'bar' } }
    };
    const res = makeRes();

    jest.spyOn(WebhookEventStore, 'findEvent').mockResolvedValue({ id: 'dup-id' });

    await ingestWebhook(req, res);

    expect(WebhookEventStore.findEvent).toHaveBeenCalledWith('dup-id');
    expect(res.status).toHaveBeenCalledWith(200);
    expect(res.json).toHaveBeenCalledWith({
      success: true,
      message: 'Duplicate event acknowledged',
      duplicate: true,
      eventId: 'dup-id'
    });
  });

  test('processes new event successfully and returns 202', async () => {
    const req = {
      headers: { 'x-webhook-token': 'wh_secret_live_tok_abc123' },
      body: {
        eventId: 'new-id',
        eventType: 'typeB',
        timestamp: '2023-01-01T00:00:00Z',
        payload: { data: 123 }
      }
    };
    const res = makeRes();

    jest.spyOn(WebhookEventStore, 'findEvent').mockResolvedValue(null);
    const savedEvent = {
      id: 'new-id',
      eventId: 'new-id',
      eventType: 'typeB',
      timestamp: '2023-01-01T00:00:00Z',
      payload: { data: 123 },
      receivedAt: new Date()
    };
    jest.spyOn(WebhookEventStore, 'saveEvent').mockResolvedValue(savedEvent);
    const dispatched = { queued: true, queueId: 'job_12345' };
    jest.spyOn(EventDispatcher, 'dispatch').mockResolvedValue(dispatched);

    await ingestWebhook(req, res);

    expect(WebhookEventStore.findEvent).toHaveBeenCalledWith('new-id');
    expect(WebhookEventStore.saveEvent).toHaveBeenCalledWith({
      eventId: 'new-id',
      eventType: 'typeB',
      timestamp: '2023-01-01T00:00:00Z',
      payload: { data: 123 }
    });
    expect(EventDispatcher.dispatch).toHaveBeenCalledWith('typeB', { data: 123 });
    expect(res.status).toHaveBeenCalledWith(202);
    expect(res.json).toHaveBeenCalledWith({
      success: true,
      message: 'Event accepted for asynchronous processing',
      data: {
        eventId: savedEvent.id,
        queueJobId: dispatched.queueId,
        status: 'queued'
      }
    });
  });

  test('catches unexpected errors and returns 500', async () => {
    const req = {
      headers: { 'x-webhook-token': 'wh_secret_live_tok_abc123' },
      body: {
        eventId: 'error-id',
        eventType: 'typeC',
        payload: { a: 1 }
      }
    };
    const res = makeRes();

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

describe('getDeliveryStatus', () => {
  const makeRes = () => {
    const res = {};
    res.status = jest.fn().mockReturnValue(res);
    res.json = jest.fn().mockReturnValue(res);
    return res;
  };

  afterEach(() => {
    jest.restoreAllMocks();
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

  test('returns 404 when event delivery status is not found', async () => {
    const req = { params: { eventId: 'unknown-id' } };
    const res = makeRes();

    jest.spyOn(WebhookEventStore, 'getDeliveryStatus').mockResolvedValue(null);

    await getDeliveryStatus(req, res);

    expect(WebhookEventStore.getDeliveryStatus).toHaveBeenCalledWith('unknown-id');
    expect(res.status).toHaveBeenCalledWith(404);
    expect(res.json).toHaveBeenCalledWith({
      success: false,
      error: 'Webhook event with ID unknown-id was not found'
    });
  });

  test('returns 200 with delivery status when found', async () => {
    const req = { params: { eventId: 'found-id' } };
    const res = makeRes();

    const status = { delivered: true, timestamp: '2023-02-02T12:00:00Z' };
    jest.spyOn(WebhookEventStore, 'getDeliveryStatus').mockResolvedValue(status);

    await getDeliveryStatus(req, res);

    expect(WebhookEventStore.getDeliveryStatus).toHaveBeenCalledWith('found-id');
    expect(res.status).toHaveBeenCalledWith(200);
    expect(res.json).toHaveBeenCalledWith({
      success: true,
      data: status
    });
  });

  test('catches unexpected errors and returns 500', async () => {
    const req = { params: { eventId: 'error-id' } };
    const res = makeRes();

    jest.spyOn(WebhookEventStore, 'getDeliveryStatus').mockRejectedValue(new Error('DB error'));

    await getDeliveryStatus(req, res);

    expect(res.status).toHaveBeenCalledWith(500);
    expect(res.json).toHaveBeenCalledWith({
      success: false,
      error: 'Failed to check event delivery status',
      details: 'DB error'
    });
  });
});