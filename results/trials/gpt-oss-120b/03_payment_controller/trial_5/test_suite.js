import { jest } from '@jest/globals';
import {
  handleStripeWebhook,
  Order,
  Subscription,
  WebhookLog,
  StripeService
} from '../dataset/03_payment_controller.js';

const mockResponse = () => {
  const res = {};
  res.status = jest.fn().mockReturnValue(res);
  res.json = jest.fn().mockReturnValue(res);
  return res;
};

describe('handleStripeWebhook', () => {
  const originalEnv = process.env;

  beforeEach(() => {
    jest.clearAllMocks();
    process.env = { ...originalEnv, STRIPE_WEBHOOK_SECRET: 'whsec_test_secret' };
  });

  afterAll(() => {
    process.env = originalEnv;
  });

  test('returns 400 when signature header is missing', async () => {
    const req = { headers: {}, body: {} };
    const res = mockResponse();

    await handleStripeWebhook(req, res);

    expect(res.status).toHaveBeenCalledWith(400);
    expect(res.json).toHaveBeenCalledWith({
      success: false,
      error: 'Missing stripe-signature header'
    });
  });

  test('returns 400 on invalid signature verification', async () => {
    const req = {
      headers: { 'stripe-signature': 'invalid_signature' },
      body: {}
    };
    const res = mockResponse();

    await handleStripeWebhook(req, res);

    expect(res.status).toHaveBeenCalledWith(400);
    expect(res.json).toHaveBeenCalledWith(
      expect.objectContaining({
        success: false,
        error: expect.stringContaining('Webhook signature verification failed')
      })
    );
  });

  test('returns 400 for malformed event object', async () => {
    jest.spyOn(StripeService, 'constructEvent').mockReturnValue({}); // missing id & type
    const req = {
      headers: { 'stripe-signature': 'valid_sig' },
      body: {}
    };
    const res = mockResponse();

    await handleStripeWebhook(req, res);

    expect(res.status).toHaveBeenCalledWith(400);
    expect(res.json).toHaveBeenCalledWith({
      success: false,
      error: 'Malformed event object'
    });
  });

  test('acknowledges already processed event', async () => {
    const event = { id: 'evt_1', type: 'payment_intent.succeeded', data: { object: {} } };
    jest.spyOn(StripeService, 'constructEvent').mockReturnValue(event);
    jest.spyOn(WebhookLog, 'findOne').mockResolvedValue({ id: 'log-123' });

    const req = {
      headers: { 'stripe-signature': 'valid_sig' },
      body: {}
    };
    const res = mockResponse();

    await handleStripeWebhook(req, res);

    expect(WebhookLog.findOne).toHaveBeenCalledWith({ eventId: 'evt_1' });
    expect(res.status).toHaveBeenCalledWith(200);
    expect(res.json).toHaveBeenCalledWith({
      received: true,
      message: 'Event already processed'
    });
  });

  test('payment_intent.succeeded missing orderId metadata returns 422', async () => {
    const event = {
      id: 'evt_2',
      type: 'payment_intent.succeeded',
      data: { object: { id: 'pi_123', amount_received: 5000, metadata: {} } }
    };
    jest.spyOn(StripeService, 'constructEvent').mockReturnValue(event);
    jest.spyOn(WebhookLog, 'findOne').mockResolvedValue(null);

    const req = { headers: { 'stripe-signature': 'valid_sig' }, body: {} };
    const res = mockResponse();

    await handleStripeWebhook(req, res);

    expect(res.status).toHaveBeenCalledWith(422);
    expect(res.json).toHaveBeenCalledWith({
      success: false,
      error: 'Payment intent succeeded but missing orderId metadata'
    });
  });

  test('payment_intent.succeeded order not found returns 404', async () => {
    const event = {
      id: 'evt_3',
      type: 'payment_intent.succeeded',
      data: {
        object: {
          id: 'pi_456',
          amount_received: 8000,
          metadata: { orderId: 'order_999' }
        }
      }
    };
    jest.spyOn(StripeService, 'constructEvent').mockReturnValue(event);
    jest.spyOn(WebhookLog, 'findOne').mockResolvedValue(null);
    jest.spyOn(Order, 'findById').mockResolvedValue(null);

    const req = { headers: { 'stripe-signature': 'valid_sig' }, body: {} };
    const res = mockResponse();

    await handleStripeWebhook(req, res);

    expect(Order.findById).toHaveBeenCalledWith('order_999');
    expect(res.status).toHaveBeenCalledWith(404);
    expect(res.json).toHaveBeenCalledWith({
      success: false,
      error: 'Order order_999 not found'
    });
  });

  test('successful payment_intent.succeeded updates order and logs event', async () => {
    const event = {
      id: 'evt_4',
      type: 'payment_intent.succeeded',
      data: {
        object: {
          id: 'pi_789',
          amount_received: 12000,
          metadata: { orderId: 'order_123' }
        }
      }
    };
    jest.spyOn(StripeService, 'constructEvent').mockReturnValue(event);
    jest.spyOn(WebhookLog, 'findOne').mockResolvedValue(null);
    jest.spyOn(Order, 'findById').mockResolvedValue({ id: 'order_123' });
    const updateStatusMock = jest.spyOn(Order, 'updateStatus').mockResolvedValue({});
    const createLogMock = jest.spyOn(WebhookLog, 'create').mockResolvedValue({});

    const req = { headers: { 'stripe-signature': 'valid_sig' }, body: {} };
    const res = mockResponse();

    await handleStripeWebhook(req, res);

    expect(updateStatusMock).toHaveBeenCalledWith('order_123', 'paid', {
      transactionId: 'pi_789',
      amountPaid: 12000
    });
    expect(createLogMock).toHaveBeenCalledWith(
      expect.objectContaining({
        eventId: 'evt_4',
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

  test('payment_intent.payment_failed updates order status when orderId present', async () => {
    const event = {
      id: 'evt_5',
      type: 'payment_intent.payment_failed',
      data: {
        object: {
          id: 'pi_111',
          metadata: { orderId: 'order_456' },
          last_payment_error: { message: 'Card declined' }
        }
      }
    };
    jest.spyOn(StripeService, 'constructEvent').mockReturnValue(event);
    jest.spyOn(WebhookLog, 'findOne').mockResolvedValue(null);
    const updateStatusMock = jest.spyOn(Order, 'updateStatus').mockResolvedValue({});
    const createLogMock = jest.spyOn(WebhookLog, 'create').mockResolvedValue({});

    const req = { headers: { 'stripe-signature': 'valid_sig' }, body: {} };
    const res = mockResponse();

    await handleStripeWebhook(req, res);

    expect(updateStatusMock).toHaveBeenCalledWith('order_456', 'payment_failed', {
      failureMessage: 'Card declined'
    });
    expect(createLogMock).toHaveBeenCalled();
    expect(res.status).toHaveBeenCalledWith(200);
    expect(res.json).toHaveBeenCalledWith({
      received: true,
      eventType: 'payment_intent.payment_failed'
    });
  });

  test('customer.subscription.deleted cancels subscription', async () => {
    const event = {
      id: 'evt_6',
      type: 'customer.subscription.deleted',
      data: { object: { id: 'sub_abc' } }
    };
    jest.spyOn(StripeService, 'constructEvent').mockReturnValue(event);
    jest.spyOn(WebhookLog, 'findOne').mockResolvedValue(null);
    const subUpdateMock = jest.spyOn(Subscription, 'updateStatus').mockResolvedValue({});
    const createLogMock = jest.spyOn(WebhookLog, 'create').mockResolvedValue({});

    const req = { headers: { 'stripe-signature': 'valid_sig' }, body: {} };
    const res = mockResponse();

    await handleStripeWebhook(req, res);

    expect(subUpdateMock).toHaveBeenCalledWith('sub_abc', 'canceled');
    expect(createLogMock).toHaveBeenCalled();
    expect(res.status).toHaveBeenCalledWith(200);
    expect(res.json).toHaveBeenCalledWith({
      received: true,
      eventType: 'customer.subscription.deleted'
    });
  });

  test('unknown event type is logged and acknowledged', async () => {
    const event = {
      id: 'evt_7',
      type: 'checkout.session.completed',
      data: { object: {} }
    };
    jest.spyOn(StripeService, 'constructEvent').mockReturnValue(event);
    jest.spyOn(WebhookLog, 'findOne').mockResolvedValue(null);
    const createLogMock = jest.spyOn(WebhookLog, 'create').mockResolvedValue({});

    const req = { headers: { 'stripe-signature': 'valid_sig' }, body: {} };
    const res = mockResponse();

    await handleStripeWebhook(req, res);

    expect(createLogMock).toHaveBeenCalledWith(
      expect.objectContaining({
        eventId: 'evt_7',
        eventType: 'checkout.session.completed',
        status: 'processed'
      })
    );
    expect(res.status).toHaveBeenCalledWith(200);
    expect(res.json).toHaveBeenCalledWith({
      received: true,
      eventType: 'checkout.session.completed'
    });
  });

  test('handles internal errors and returns 500', async () => {
    const event = {
      id: 'evt_8',
      type: 'payment_intent.succeeded',
      data: { object: { metadata: { orderId: 'order_err' } } }
    };
    jest.spyOn(StripeService, 'constructEvent').mockReturnValue(event);
    jest.spyOn(WebhookLog, 'findOne').mockResolvedValue(null);
    jest.spyOn(Order, 'findById').mockRejectedValue(new Error('DB failure'));

    const req = { headers: { 'stripe-signature': 'valid_sig' }, body: {} };
    const res = mockResponse();

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