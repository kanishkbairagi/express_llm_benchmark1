import { jest } from '@jest/globals';
import {
  handleStripeWebhook,
  Order,
  Subscription,
  WebhookLog,
  StripeService
} from '../dataset/03_payment_controller.js';

describe('handleStripeWebhook', () => {
  const createMockRes = () => {
    const res = {};
    res.status = jest.fn().mockReturnValue(res);
    res.json = jest.fn().mockReturnValue(res);
    return res;
  };

  const defaultEnv = process.env.STRIPE_WEBHOOK_SECRET;
  afterAll(() => {
    process.env.STRIPE_WEBHOOK_SECRET = defaultEnv;
  });

  beforeEach(() => {
    jest.clearAllMocks();
    process.env.STRIPE_WEBHOOK_SECRET = 'whsec_test_secret';
  });

  test('returns 400 when stripe-signature header is missing', async () => {
    const req = { headers: {}, body: '{}' };
    const res = createMockRes();

    await handleStripeWebhook(req, res);

    expect(res.status).toHaveBeenCalledWith(400);
    expect(res.json).toHaveBeenCalledWith({
      success: false,
      error: 'Missing stripe-signature header'
    });
  });

  test('returns 400 when signature verification fails', async () => {
    const req = {
      headers: { 'stripe-signature': 'invalid_signature' },
      body: '{}'
    };
    const res = createMockRes();

    jest.spyOn(StripeService, 'constructEvent').mockImplementation(() => {
      throw new Error('Invalid signature verification failed');
    });

    await handleStripeWebhook(req, res);

    expect(res.status).toHaveBeenCalledWith(400);
    expect(res.json).toHaveBeenCalledWith({
      success: false,
      error: expect.stringContaining('Webhook signature verification failed')
    });
  });

  test('returns 400 for malformed event object', async () => {
    const req = {
      headers: { 'stripe-signature': 'valid_sig' },
      body: '{}'
    };
    const res = createMockRes();

    jest.spyOn(StripeService, 'constructEvent').mockReturnValue({}); // missing id & type

    await handleStripeWebhook(req, res);

    expect(res.status).toHaveBeenCalledWith(400);
    expect(res.json).toHaveBeenCalledWith({
      success: false,
      error: 'Malformed event object'
    });
  });

  test('returns 200 when event already processed', async () => {
    const event = { id: 'evt_123', type: 'payment_intent.succeeded', data: {} };
    const req = {
      headers: { 'stripe-signature': 'valid_sig' },
      body: JSON.stringify(event)
    };
    const res = createMockRes();

    jest.spyOn(StripeService, 'constructEvent').mockReturnValue(event);
    jest.spyOn(WebhookLog, 'findOne').mockResolvedValue({ id: 'log-1' });

    await handleStripeWebhook(req, res);

    expect(WebhookLog.findOne).toHaveBeenCalledWith({ eventId: 'evt_123' });
    expect(res.status).toHaveBeenCalledWith(200);
    expect(res.json).toHaveBeenCalledWith({
      received: true,
      message: 'Event already processed'
    });
  });

  test('payment_intent.succeeded missing orderId metadata returns 422', async () => {
    const event = {
      id: 'evt_124',
      type: 'payment_intent.succeeded',
      data: { object: { metadata: {} } }
    };
    const req = {
      headers: { 'stripe-signature': 'valid_sig' },
      body: JSON.stringify(event)
    };
    const res = createMockRes();

    jest.spyOn(StripeService, 'constructEvent').mockReturnValue(event);
    jest.spyOn(WebhookLog, 'findOne').mockResolvedValue(null);

    await handleStripeWebhook(req, res);

    expect(res.status).toHaveBeenCalledWith(422);
    expect(res.json).toHaveBeenCalledWith({
      success: false,
      error: 'Payment intent succeeded but missing orderId metadata'
    });
  });

  test('payment_intent.succeeded order not found returns 404', async () => {
    const event = {
      id: 'evt_125',
      type: 'payment_intent.succeeded',
      data: { object: { metadata: { orderId: 'order-1' }, id: 'pi_1', amount_received: 5000 } }
    };
    const req = {
      headers: { 'stripe-signature': 'valid_sig' },
      body: JSON.stringify(event)
    };
    const res = createMockRes();

    jest.spyOn(StripeService, 'constructEvent').mockReturnValue(event);
    jest.spyOn(WebhookLog, 'findOne').mockResolvedValue(null);
    jest.spyOn(Order, 'findById').mockResolvedValue(null);

    await handleStripeWebhook(req, res);

    expect(Order.findById).toHaveBeenCalledWith('order-1');
    expect(res.status).toHaveBeenCalledWith(404);
    expect(res.json).toHaveBeenCalledWith({
      success: false,
      error: 'Order order-1 not found'
    });
  });

  test('payment_intent.succeeded processes order successfully', async () => {
    const event = {
      id: 'evt_126',
      type: 'payment_intent.succeeded',
      data: {
        object: {
          metadata: { orderId: 'order-2' },
          id: 'pi_2',
          amount_received: 7500
        }
      }
    };
    const req = {
      headers: { 'stripe-signature': 'valid_sig' },
      body: JSON.stringify(event)
    };
    const res = createMockRes();

    jest.spyOn(StripeService, 'constructEvent').mockReturnValue(event);
    jest.spyOn(WebhookLog, 'findOne').mockResolvedValue(null);
    jest.spyOn(Order, 'findById').mockResolvedValue({ id: 'order-2' });
    jest.spyOn(Order, 'updateStatus').mockResolvedValue({});
    jest.spyOn(WebhookLog, 'create').mockResolvedValue({});

    await handleStripeWebhook(req, res);

    expect(Order.updateStatus).toHaveBeenCalledWith('order-2', 'paid', {
      transactionId: 'pi_2',
      amountPaid: 7500
    });
    expect(WebhookLog.create).toHaveBeenCalledWith(
      expect.objectContaining({
        eventId: 'evt_126',
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
      id: 'evt_127',
      type: 'payment_intent.payment_failed',
      data: {
        object: {
          metadata: { orderId: 'order-3' },
          last_payment_error: { message: 'Card declined' }
        }
      }
    };
    const req = {
      headers: { 'stripe-signature': 'valid_sig' },
      body: JSON.stringify(event)
    };
    const res = createMockRes();

    jest.spyOn(StripeService, 'constructEvent').mockReturnValue(event);
    jest.spyOn(WebhookLog, 'findOne').mockResolvedValue(null);
    jest.spyOn(Order, 'updateStatus').mockResolvedValue({});
    jest.spyOn(WebhookLog, 'create').mockResolvedValue({});

    await handleStripeWebhook(req, res);

    expect(Order.updateStatus).toHaveBeenCalledWith('order-3', 'payment_failed', {
      failureMessage: 'Card declined'
    });
    expect(res.status).toHaveBeenCalledWith(200);
  });

  test('customer.subscription.deleted updates subscription status', async () => {
    const event = {
      id: 'evt_128',
      type: 'customer.subscription.deleted',
      data: { object: { id: 'sub_123' } }
    };
    const req = {
      headers: { 'stripe-signature': 'valid_sig' },
      body: JSON.stringify(event)
    };
    const res = createMockRes();

    jest.spyOn(StripeService, 'constructEvent').mockReturnValue(event);
    jest.spyOn(WebhookLog, 'findOne').mockResolvedValue(null);
    jest.spyOn(Subscription, 'updateStatus').mockResolvedValue({});
    jest.spyOn(WebhookLog, 'create').mockResolvedValue({});

    await handleStripeWebhook(req, res);

    expect(Subscription.updateStatus).toHaveBeenCalledWith('sub_123', 'canceled');
    expect(res.status).toHaveBeenCalledWith(200);
  });

  test('unhandled event type is acknowledged and logged', async () => {
    const event = {
      id: 'evt_129',
      type: 'account.updated',
      data: { object: {} }
    };
    const req = {
      headers: { 'stripe-signature': 'valid_sig' },
      body: JSON.stringify(event)
    };
    const res = createMockRes();

    jest.spyOn(StripeService, 'constructEvent').mockReturnValue(event);
    jest.spyOn(WebhookLog, 'findOne').mockResolvedValue(null);
    jest.spyOn(WebhookLog, 'create').mockResolvedValue({});

    await handleStripeWebhook(req, res);

    expect(WebhookLog.create).toHaveBeenCalledWith(
      expect.objectContaining({
        eventId: 'evt_129',
        eventType: 'account.updated',
        status: 'processed'
      })
    );
    expect(res.status).toHaveBeenCalledWith(200);
    expect(res.json).toHaveBeenCalledWith({
      received: true,
      eventType: 'account.updated'
    });
  });

  test('returns 500 when unexpected error occurs', async () => {
    const event = {
      id: 'evt_130',
      type: 'payment_intent.succeeded',
      data: { object: { metadata: { orderId: 'order-4' }, id: 'pi_4', amount_received: 1000 } }
    };
    const req = {
      headers: { 'stripe-signature': 'valid_sig' },
      body: JSON.stringify(event)
    };
    const res = createMockRes();

    jest.spyOn(StripeService, 'constructEvent').mockReturnValue(event);
    jest.spyOn(WebhookLog, 'findOne').mockResolvedValue(null);
    jest.spyOn(Order, 'findById').mockRejectedValue(new Error('DB failure'));

    await handleStripeWebhook(req, res);

    expect(res.status).toHaveBeenCalledWith(500);
    expect(res.json).toHaveBeenCalledWith({
      success: false,
      error: 'Error processing webhook event',
      details: 'DB failure'
    });
  });
});