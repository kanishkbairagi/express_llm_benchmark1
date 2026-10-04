import { jest } from '@jest/globals';
import {
  handleStripeWebhook,
  Order,
  Subscription,
  WebhookLog,
  StripeService
} from '../dataset/03_payment_controller.js';

describe('handleStripeWebhook', () => {
  const mockRes = () => {
    const res = {};
    res.status = jest.fn().mockReturnValue(res);
    res.json = jest.fn().mockReturnValue(res);
    return res;
  };

  const defaultEnv = process.env;

  beforeEach(() => {
    jest.restoreAllMocks();
    process.env = { ...defaultEnv };
    // default mocks
    jest.spyOn(Order, 'findById').mockResolvedValue({ id: 'order-1' });
    jest.spyOn(Order, 'updateStatus').mockResolvedValue({});
    jest.spyOn(Subscription, 'updateStatus').mockResolvedValue({});
    jest.spyOn(WebhookLog, 'findOne').mockResolvedValue(null);
    jest.spyOn(WebhookLog, 'create').mockResolvedValue({ id: 'log-123' });
    jest.spyOn(StripeService, 'constructEvent').mockImplementation((payload) =>
      typeof payload === 'string' ? JSON.parse(payload) : payload
    );
  });

  afterAll(() => {
    process.env = defaultEnv;
  });

  test('returns 400 when stripe-signature header is missing', async () => {
    const req = { headers: {}, body: '{}' };
    const res = mockRes();

    await handleStripeWebhook(req, res);

    expect(res.status).toHaveBeenCalledWith(400);
    expect(res.json).toHaveBeenCalledWith(
      expect.objectContaining({ success: false, error: 'Missing stripe-signature header' })
    );
  });

  test('returns 400 when signature verification fails', async () => {
    const req = {
      headers: { 'stripe-signature': 'invalid_signature' },
      body: '{}'
    };
    const res = mockRes();

    await handleStripeWebhook(req, res);

    expect(res.status).toHaveBeenCalledWith(400);
    expect(res.json).toHaveBeenCalledWith(
      expect.objectContaining({
        success: false,
        error: expect.stringContaining('Webhook signature verification failed')
      })
    );
  });

  test('returns 200 when event has already been processed', async () => {
    const event = { id: 'evt-123', type: 'payment_intent.succeeded', data: { object: {} } };
    WebhookLog.findOne.mockResolvedValue({ id: 'log-123' });
    const req = {
      headers: { 'stripe-signature': 'valid_sig' },
      body: JSON.stringify(event)
    };
    const res = mockRes();

    await handleStripeWebhook(req, res);

    expect(res.status).toHaveBeenCalledWith(200);
    expect(res.json).toHaveBeenCalledWith({
      received: true,
      message: 'Event already processed'
    });
  });

  test('processes payment_intent.succeeded successfully', async () => {
    const event = {
      id: 'evt-456',
      type: 'payment_intent.succeeded',
      data: {
        object: {
          id: 'pi_123',
          amount_received: 2000,
          metadata: { orderId: 'order-1' }
        }
      }
    };
    const req = {
      headers: { 'stripe-signature': 'valid_sig' },
      body: JSON.stringify(event)
    };
    const res = mockRes();

    await handleStripeWebhook(req, res);

    expect(Order.findById).toHaveBeenCalledWith('order-1');
    expect(Order.updateStatus).toHaveBeenCalledWith('order-1', 'paid', {
      transactionId: 'pi_123',
      amountPaid: 2000
    });
    expect(WebhookLog.create).toHaveBeenCalledWith(
      expect.objectContaining({
        eventId: 'evt-456',
        eventType: 'payment_intent.succeeded',
        status: 'processed'
      })
    );
    expect(res.status).toHaveBeenCalledWith(200);
    expect(res.json).toHaveBeenCalledWith({
      received: true,
      eventType: 'payment_intent.succeeded'
    });
  });

  test('returns 422 when payment_intent.succeeded missing orderId', async () => {
    const event = {
      id: 'evt-789',
      type: 'payment_intent.succeeded',
      data: { object: { metadata: {} } }
    };
    const req = {
      headers: { 'stripe-signature': 'valid_sig' },
      body: JSON.stringify(event)
    };
    const res = mockRes();

    await handleStripeWebhook(req, res);

    expect(res.status).toHaveBeenCalledWith(422);
    expect(res.json).toHaveBeenCalledWith(
      expect.objectContaining({
        success: false,
        error: 'Payment intent succeeded but missing orderId metadata'
      })
    );
  });

  test('returns 404 when order not found for succeeded payment', async () => {
    Order.findById.mockResolvedValue(null);
    const event = {
      id: 'evt-101',
      type: 'payment_intent.succeeded',
      data: {
        object: {
          metadata: { orderId: 'missing-order' }
        }
      }
    };
    const req = {
      headers: { 'stripe-signature': 'valid_sig' },
      body: JSON.stringify(event)
    };
    const res = mockRes();

    await handleStripeWebhook(req, res);

    expect(res.status).toHaveBeenCalledWith(404);
    expect(res.json).toHaveBeenCalledWith(
      expect.objectContaining({
        success: false,
        error: 'Order missing-order not found'
      })
    );
  });

  test('processes payment_intent.payment_failed with orderId', async () => {
    const event = {
      id: 'evt-202',
      type: 'payment_intent.payment_failed',
      data: {
        object: {
          metadata: { orderId: 'order-1' },
          last_payment_error: { message: 'Card declined' }
        }
      }
    };
    const req = {
      headers: { 'stripe-signature': 'valid_sig' },
      body: JSON.stringify(event)
    };
    const res = mockRes();

    await handleStripeWebhook(req, res);

    expect(Order.updateStatus).toHaveBeenCalledWith('order-1', 'payment_failed', {
      failureMessage: 'Card declined'
    });
    expect(res.status).toHaveBeenCalledWith(200);
    expect(res.json).toHaveBeenCalledWith({
      received: true,
      eventType: 'payment_intent.payment_failed'
    });
  });

  test('processes customer.subscription.deleted event', async () => {
    const event = {
      id: 'evt-303',
      type: 'customer.subscription.deleted',
      data: {
        object: { id: 'sub_123' }
      }
    };
    const req = {
      headers: { 'stripe-signature': 'valid_sig' },
      body: JSON.stringify(event)
    };
    const res = mockRes();

    await handleStripeWebhook(req, res);

    expect(Subscription.updateStatus).toHaveBeenCalledWith('sub_123', 'canceled');
    expect(res.status).toHaveBeenCalledWith(200);
    expect(res.json).toHaveBeenCalledWith({
      received: true,
      eventType: 'customer.subscription.deleted'
    });
  });

  test('handles unexpected error with 500 response', async () => {
    const error = new Error('DB failure');
    Order.findById.mockRejectedValue(error);
    const event = {
      id: 'evt-404',
      type: 'payment_intent.succeeded',
      data: {
        object: {
          metadata: { orderId: 'order-1' }
        }
      }
    };
    const req = {
      headers: { 'stripe-signature': 'valid_sig' },
      body: JSON.stringify(event)
    };
    const res = mockRes();

    await handleStripeWebhook(req, res);

    expect(res.status).toHaveBeenCalledWith(500);
    expect(res.json).toHaveBeenCalledWith(
      expect.objectContaining({
        success: false,
        error: 'Error processing webhook event',
        details: 'DB failure'
      })
    );
  });
});