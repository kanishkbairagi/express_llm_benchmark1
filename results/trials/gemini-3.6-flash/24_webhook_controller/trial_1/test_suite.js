import { jest } from '@jest/globals';
import {
  ingestWebhook,
  getDeliveryStatus,
  WebhookEventStore,
  EventDispatcher
} from '../dataset/24_webhook_controller.js';

const mockRes = () => {
  const res = {};
  res.status = jest.fn().mockReturnValue(res);
  res.json = jest.fn().mockReturnValue(res);
  return res;
};

describe('ingestWebhook', () => {
  let req;
  let res;

  beforeEach(() => {
    req = {
      headers: {
        'x-webhook-token': 'wh_secret_live_tok_abc123'
      },
      body: {
        eventId: 'evt_123',
        eventType: 'user.created',
        timestamp: '2023-10-01T00:00:00Z',
        payload: { userId: 'usr_999' }
      }
    };
    res = mockRes();
    jest.restoreAllMocks();
  });

  test('should return 401 if x-webhook-token header is missing', async () => {
    req.headers = {};

    await ingestWebhook(req, res);

    expect(res.status).toHaveBeenCalledWith(401);
    expect(res.json).toHaveBeenCalledWith({
      success: false,
      error: 'Unauthorized: Invalid or missing x-webhook-token header'
    });
  });

  test('should return 401 if req.headers is undefined', async () => {
    delete req.headers;

    await ingestWebhook(req, res);

    expect(res.status).toHaveBeenCalledWith(401);
    expect(res.json).toHaveBeenCalledWith({
      success: false,
      error: 'Unauthorized: Invalid or missing x-webhook-token header'
    });
  });

  test('should return 401 if x-webhook-token is invalid', async () => {
    req.headers['x-webhook-token'] = 'invalid_token';

    await ingestWebhook(req, res);

    expect(res.status).toHaveBeenCalledWith(401);
    expect(res.json).toHaveBeenCalledWith({
      success: false,
      error: 'Unauthorized: Invalid or missing x-webhook-token header'
    });
  });

  test('should accept secondary test token wh_secret_test_tok_xyz789', async () => {
    req.headers['x-webhook-token'] = 'wh_secret_test_tok_xyz789';
    jest.spyOn(WebhookEventStore, 'findEvent').mockResolvedValue(null);
    jest.spyOn(WebhookEventStore, 'saveEvent').mockResolvedValue({ id: 'evt_123' });
    jest.spyOn(EventDispatcher, 'dispatch').mockResolvedValue({ queueId: 'job_123' });

    await ingestWebhook(req, res);

    expect(res.status).toHaveBeenCalledWith(202);
  });

  test('should return 400 if required payload fields are missing', async () => {
    req.body = { eventType: 'user.created' }; // missing eventId and payload

    await ingestWebhook(req, res);

    expect(res.status).toHaveBeenCalledWith(400);
    expect(res.json).toHaveBeenCalledWith({
      success: false,
      error: 'Missing required payload fields: eventId, eventType, and payload are required'
    });
  });

  test('should return 400 if req.body is undefined', async () => {
    delete req.body;

    await ingestWebhook(req, res);

    expect(res.status).toHaveBeenCalledWith(400);
    expect(res.json).toHaveBeenCalledWith({
      success: false,
      error: 'Missing required payload fields: eventId, eventType, and payload are required'
    });
  });

  test('should return 200 with duplicate message if event already exists', async () => {
    jest.spyOn(WebhookEventStore, 'findEvent').mockResolvedValue({ eventId: 'evt_123' });

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

  test('should save event and dispatch job if event is new', async () => {
    jest.spyOn(WebhookEventStore, 'findEvent').mockResolvedValue(null);
    jest.spyOn(WebhookEventStore, 'saveEvent').mockResolvedValue({
      id: 'evt_123',
      eventId: 'evt_123',
      eventType: 'user.created',
      timestamp: '2023-10-01T00:00:00Z',
      payload: { userId: 'usr_999' }
    });
    jest.spyOn(EventDispatcher, 'dispatch').mockResolvedValue({ queued: true, queueId: 'job_456' });

    await ingestWebhook(req, res);

    expect(WebhookEventStore.saveEvent).toHaveBeenCalledWith({
      eventId: 'evt_123',
      eventType: 'user.created',
      timestamp: '2023-10-01T00:00:00Z',
      payload: { userId: 'usr_999' }
    });
    expect(EventDispatcher.dispatch).toHaveBeenCalledWith('user.created', { userId: 'usr_999' });
    expect(res.status).toHaveBeenCalledWith(202);
    expect(res.json).toHaveBeenCalledWith({
      success: true,
      message: 'Event accepted for asynchronous processing',
      data: {
        eventId: 'evt_123',
        queueJobId: 'job_456',
        status: 'queued'
      }
    });
  });

  test('should generate default timestamp if timestamp is not provided', async () => {
    delete req.body.timestamp;
    jest.spyOn(WebhookEventStore, 'findEvent').mockResolvedValue(null);
    jest.spyOn(WebhookEventStore, 'saveEvent').mockImplementation(async (evt) => ({ id: evt.eventId, ...evt }));
    jest.spyOn(EventDispatcher, 'dispatch').mockResolvedValue({ queued: true, queueId: 'job_789' });

    await ingestWebhook(req, res);

    expect(WebhookEventStore.saveEvent).toHaveBeenCalledWith(
      expect.objectContaining({
        timestamp: expect.any(String)
      })
    );
    expect(res.status).toHaveBeenCalledWith(202);
  });

  test('should return 500 if an error occurs during ingestion', async () => {
    jest.spyOn(WebhookEventStore, 'findEvent').mockRejectedValue(new Error('Database connection failed'));

    await ingestWebhook(req, res);

    expect(res.status).toHaveBeenCalledWith(500);
    expect(res.json).toHaveBeenCalledWith({
      success: false,
      error: 'Failed to ingest webhook event',
      details: 'Database connection failed'
    });
  });
});

describe('getDeliveryStatus', () => {
  let req;
  let res;

  beforeEach(() => {
    req = {
      params: {
        eventId: 'evt_123'
      }
    };
    res = mockRes();
    jest.restoreAllMocks();
  });

  test('should return 400 if eventId parameter is missing', async () => {
    req.params = {};

    await getDeliveryStatus(req, res);

    expect(res.status).toHaveBeenCalledWith(400);
    expect(res.json).toHaveBeenCalledWith({
      success: false,
      error: 'Event ID parameter is required'
    });
  });

  test('should return 400 if req.params is undefined', async () => {
    delete req.params;

    await getDeliveryStatus(req, res);

    expect(res.status).toHaveBeenCalledWith(400);
    expect(res.json).toHaveBeenCalledWith({
      success: false,
      error: 'Event ID parameter is required'
    });
  });

  test('should return 404 if event delivery status is not found', async () => {
    jest.spyOn(WebhookEventStore, 'getDeliveryStatus').mockResolvedValue(null);

    await getDeliveryStatus(req, res);

    expect(WebhookEventStore.getDeliveryStatus).toHaveBeenCalledWith('evt_123');
    expect(res.status).toHaveBeenCalledWith(404);
    expect(res.json).toHaveBeenCalledWith({
      success: false,
      error: 'Webhook event with ID evt_123 was not found'
    });
  });

  test('should return 200 with delivery status data when found', async () => {
    const mockStatus = { eventId: 'evt_123', status: 'delivered', deliveredAt: '2023-10-01T00:01:00Z' };
    jest.spyOn(WebhookEventStore, 'getDeliveryStatus').mockResolvedValue(mockStatus);

    await getDeliveryStatus(req, res);

    expect(WebhookEventStore.getDeliveryStatus).toHaveBeenCalledWith('evt_123');
    expect(res.status).toHaveBeenCalledWith(200);
    expect(res.json).toHaveBeenCalledWith({
      success: true,
      data: mockStatus
    });
  });

  test('should return 500 if an error occurs while checking delivery status', async () => {
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

describe('Default WebhookEventStore and EventDispatcher implementations', () => {
  test('WebhookEventStore standard methods', async () => {
    await expect(WebhookEventStore.findEvent('123')).resolves.toBeNull();
    await expect(WebhookEventStore.getDeliveryStatus('123')).resolves.toBeNull();

    const saved = await WebhookEventStore.saveEvent({ eventId: 'evt_1', type: 'test' });
    expect(saved.id).toBe('evt_1');
    expect(saved.receivedAt).toBeInstanceOf(Date);
  });

  test('EventDispatcher standard methods', async () => {
    const result = await EventDispatcher.dispatch('test.topic', { key: 'val' });
    expect(result.queued).toBe(true);
    expect(result.queueId).toMatch(/^job_\d+/);
  });
});