import { jest } from '@jest/globals';
import {
  ingestWebhook,
  getDeliveryStatus,
  WebhookEventStore,
  EventDispatcher
} from '../dataset/24_webhook_controller.js';

const mockResponse = () => {
  const res = {};
  res.status = jest.fn().mockReturnValue(res);
  res.json = jest.fn().mockReturnValue(res);
  return res;
};

describe('ingestWebhook', () => {
  const validToken = 'wh_secret_live_tok_abc123';
  const headers = { 'x-webhook-token': validToken };

  beforeEach(() => {
    jest.clearAllMocks();
  });

  test('returns 401 when token is missing', async () => {
    const req = { headers: {} };
    const res = mockResponse();

    await ingestWebhook(req, res);

    expect(res.status).toHaveBeenCalledWith(401);
    expect(res.json).toHaveBeenCalledWith(
      expect.objectContaining({ success: false })
    );
  });

  test('returns 401 when token is invalid', async () => {
    const req = { headers: { 'x-webhook-token': 'invalid' } };
    const res = mockResponse();

    await ingestWebhook(req, res);

    expect(res.status).toHaveBeenCalledWith(401);
    expect(res.json).toHaveBeenCalledWith(
      expect.objectContaining({ success: false })
    );
  });

  test('returns 400 when required payload fields are missing', async () => {
    const req = { headers, body: { eventId: 'e1' } };
    const res = mockResponse();

    await ingestWebhook(req, res);

    expect(res.status).toHaveBeenCalledWith(400);
    expect(res.json).toHaveBeenCalledWith(
      expect.objectContaining({ success: false })
    );
  });

  test('acknowledges duplicate event', async () => {
    jest.spyOn(WebhookEventStore, 'findEvent').mockResolvedValue({ id: 'e1' });
    const req = {
      headers,
      body: { eventId: 'e1', eventType: 'order.created', payload: {} }
    };
    const res = mockResponse();

    await ingestWebhook(req, res);

    expect(WebhookEventStore.findEvent).toHaveBeenCalledWith('e1');
    expect(res.status).toHaveBeenCalledWith(200);
    expect(res.json).toHaveBeenCalledWith(
      expect.objectContaining({ duplicate: true })
    );
  });

  test('processes new event and queues dispatch job', async () => {
    jest.spyOn(WebhookEventStore, 'findEvent').mockResolvedValue(null);
    const savedEvent = {
      id: 'e2',
      eventId: 'e2',
      eventType: 'order.created',
      timestamp: '2024-01-01T00:00:00Z',
      payload: { orderId: 123 },
      receivedAt: new Date()
    };
    jest
      .spyOn(WebhookEventStore, 'saveEvent')
      .mockImplementation(async (data) => ({ ...savedEvent, ...data }));
    const dispatchResult = { queued: true, queueId: 'job_12345' };
    jest.spyOn(EventDispatcher, 'dispatch').mockResolvedValue(dispatchResult);

    const req = {
      headers,
      body: {
        eventId: 'e2',
        eventType: 'order.created',
        payload: { orderId: 123 }
      }
    };
    const res = mockResponse();

    await ingestWebhook(req, res);

    expect(WebhookEventStore.findEvent).toHaveBeenCalledWith('e2');
    expect(WebhookEventStore.saveEvent).toHaveBeenCalledWith(
      expect.objectContaining({
        eventId: 'e2',
        eventType: 'order.created',
        payload: { orderId: 123 }
      })
    );
    expect(EventDispatcher.dispatch).toHaveBeenCalledWith(
      'order.created',
      { orderId: 123 }
    );
    expect(res.status).toHaveBeenCalledWith(202);
    expect(res.json).toHaveBeenCalledWith(
      expect.objectContaining({
        success: true,
        data: expect.objectContaining({
          eventId: savedEvent.id,
          queueJobId: dispatchResult.queueId,
          status: 'queued'
        })
      })
    );
  });

  test('handles unexpected errors with 500', async () => {
    jest.spyOn(WebhookEventStore, 'findEvent').mockRejectedValue(new Error('DB fail'));
    const req = {
      headers,
      body: {
        eventId: 'e3',
        eventType: 'order.created',
        payload: {}
      }
    };
    const res = mockResponse();

    await ingestWebhook(req, res);

    expect(res.status).toHaveBeenCalledWith(500);
    expect(res.json).toHaveBeenCalledWith(
      expect.objectContaining({ success: false, error: expect.any(String) })
    );
  });
});

describe('getDeliveryStatus', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  test('returns 400 when eventId param is missing', async () => {
    const req = { params: {} };
    const res = mockResponse();

    await getDeliveryStatus(req, res);

    expect(res.status).toHaveBeenCalledWith(400);
    expect(res.json).toHaveBeenCalledWith(
      expect.objectContaining({ success: false })
    );
  });

  test('returns 404 when status is not found', async () => {
    jest.spyOn(WebhookEventStore, 'getDeliveryStatus').mockResolvedValue(null);
    const req = { params: { eventId: 'missing' } };
    const res = mockResponse();

    await getDeliveryStatus(req, res);

    expect(WebhookEventStore.getDeliveryStatus).toHaveBeenCalledWith('missing');
    expect(res.status).toHaveBeenCalledWith(404);
    expect(res.json).toHaveBeenCalledWith(
      expect.objectContaining({ success: false })
    );
  });

  test('returns 200 with status data when found', async () => {
    const statusData = { delivered: true, attempts: 1 };
    jest.spyOn(WebhookEventStore, 'getDeliveryStatus').mockResolvedValue(statusData);
    const req = { params: { eventId: 'e4' } };
    const res = mockResponse();

    await getDeliveryStatus(req, res);

    expect(WebhookEventStore.getDeliveryStatus).toHaveBeenCalledWith('e4');
    expect(res.status).toHaveBeenCalledWith(200);
    expect(res.json).toHaveBeenCalledWith(
      expect.objectContaining({
        success: true,
        data: statusData
      })
    );
  });

  test('handles unexpected errors with 500', async () => {
    jest.spyOn(WebhookEventStore, 'getDeliveryStatus').mockRejectedValue(new Error('DB error'));
    const req = { params: { eventId: 'e5' } };
    const res = mockResponse();

    await getDeliveryStatus(req, res);

    expect(res.status).toHaveBeenCalledWith(500);
    expect(res.json).toHaveBeenCalledWith(
      expect.objectContaining({ success: false, error: expect.any(String) })
    );
  });
});