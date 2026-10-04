import { jest } from '@jest/globals';
import {
  Order,
  Subscription,
  WebhookLog,
  StripeService,
  handleStripeWebhook,
} from '../dataset/03_payment_controller.js';

describe('handleStripeWebhook', () => {
  let req;
  let res;
  const mockStatus = jest.fn().mockReturnThis();
  const mockJson = jest.fn();

  beforeEach(() => {
    jest.clearAllMocks();
    req = {
      headers: { 'stripe-signature': 'valid_signature' },
      body: '',
    };
    res = { status: mockStatus, json: mockJson };
    // Default mocks
    jest.spyOn(WebhookLog, 'findOne').mockResolvedValue(null);
    jest.spyOn(WebhookLog, 'create').mockResolvedValue({ id: 'log-123' });
    jest.spyOn(Order, 'findById').mockResolvedValue({ id: 'order-1' });
    jest.spyOn(Order, 'updateStatus').mockResolvedValue({});
    jest.spyOn(Subscription, 'updateStatus').mockResolvedValue({});
    jest.spyOn(StripeService, 'constructEvent').mockImplementation((payload) => {
      return typeof payload === 'string' ? JSON.parse(payload) : payload;
    });
  });

  test('returns 400 when stripe-signature header is missing', async () => {
    delete req.headers['stripe-signature'];
    await handleStripeWebhook(req, res);
    expect(mockStatus).toHaveBeenCalledWith(400);
    expect(mockJson).toHaveBeenCalledWith(
      expect.objectContaining({ success: false, error: 'Missing stripe-signature header' })
    );
  });

  test('returns 400 when signature verification fails', async () => {
    req.headers['stripe-signature'] = 'invalid_signature';
    await handleStripeWebhook(req, res);
    expect(mockStatus).toHaveBeenCalledWith(400);
    expect(mockJson).toHaveBeenCalledWith(
      expect.objectContaining({
        success: false,
        error: expect.stringContaining('Webhook signature verification failed'),
      })
    );
  });

  test('returns 400 for malformed event object', async () => {
    req.body = JSON.stringify({}); // missing id and type
    await handleStripeWebhook(req, res);
    expect(mockStatus).toHaveBeenCalledWith(400);
    expect(mockJson).toHaveBeenCalledWith(
      expect.objectContaining({ success: false, error: 'Malformed event object' })
    );
  });

  test('acknowledges already processed event', async () => {
    req.body = JSON.stringify({ id: 'evt-1', type: 'payment_intent.succeeded', data: {} });
    WebhookLog.findOne.mockResolvedValue({ eventId: 'evt-1' });
    await handleStripeWebhook(req, res);
    expect(mockStatus).toHaveBeenCalledWith(200);
    expect(mockJson).toHaveBeenCalledWith(
      expect.objectContaining({ received: true, message: 'Event already processed' })
    );
    expect(WebhookLog.create).not.toHaveBeenCalled();
  });

  test('returns 422 when payment_intent.succeeded missing orderId metadata', async () => {
    const event = {
      id: 'evt-2',
      type: 'payment_intent.succeeded',
      data: { object: { id: 'pi_123', amount_received: 5000, metadata: {} } },
    };
    req.body = JSON.stringify(event);
    await handleStripeWebhook(req, res);
    expect(mockStatus).toHaveBeenCalledWith(422);
    expect(mockJson).toHaveBeenCalledWith(
      expect.objectContaining({
        success: false,
        error: 'Payment intent succeeded but missing orderId metadata',
      })
    );
  });

  test('returns 404 when order not found for payment_intent.succeeded', async () => {
    const event = {
      id: 'evt-3',
      type: 'payment_intent.succeeded',
      data: {
        object: {
          id: 'pi_124',
          amount_received: 7000,
          metadata: { orderId: 'nonexistent' },
        },
      },
    };
    req.body = JSON.stringify(event);
    Order.findById.mockResolvedValue(null);
    await handleStripeWebhook(req, res);
    expect(mockStatus).toHaveBeenCalledWith(404);
    expect(mockJson).toHaveBeenCalledWith(
      expect.objectContaining({
        success: false,
        error: 'Order nonexistent not found',
      })
    );
  });

  test('processes payment_intent.succeeded successfully', async () => {
    const event = {
      id: 'evt-4',
      type: 'payment_intent.succeeded',
      data: {
        object: {
          id: 'pi_125',
          amount_received: 12000,
          metadata: { orderId: 'order-42' },
        },
      },
    };
    req.body = JSON.stringify(event);
    await handleStripeWebhook(req, res);
    expect(Order.findById).toHaveBeenCalledWith('order-42');
    expect(Order.updateStatus).toHaveBeenCalledWith('order-42', 'paid', {
      transactionId: 'pi_125',
      amountPaid: 12000,
    });
    expect(WebhookLog.create).toHaveBeenCalledWith(
      expect.objectContaining({
        eventId: 'evt-4',
        eventType: 'payment_intent.succeeded',
        status: 'processed',
      })
    );
    expect(mockStatus).toHaveBeenCalledWith(200);
    expect(mockJson).toHaveBeenCalledWith(
      expect.objectContaining({ received: true, eventType: 'payment_intent.succeeded' })
    );
  });

  test('updates order status on payment_intent.payment_failed', async () => {
    const event = {
      id: 'evt-5',
      type: 'payment_intent.payment_failed',
      data: {
        object: {
          id: 'pi_126',
          metadata: { orderId: 'order-99' },
          last_payment_error: { message: 'Card declined' },
        },
      },
    };
    req.body = JSON.stringify(event);
    await handleStripeWebhook(req, res);
    expect(Order.updateStatus).toHaveBeenCalledWith('order-99', 'payment_failed', {
      failureMessage: 'Card declined',
    });
    expect(mockStatus).toHaveBeenCalledWith(200);
    expect(mockJson).toHaveBeenCalledWith(
      expect.objectContaining({ received: true, eventType: 'payment_intent.payment_failed' })
    );
  });

  test('cancels subscription on customer.subscription.deleted', async () => {
    const event = {
      id: 'evt-6',
      type: 'customer.subscription.deleted',
      data: { object: { id: 'sub_789' } },
    };
    req.body = JSON.stringify(event);
    await handleStripeWebhook(req, res);
    expect(Subscription.updateStatus).toHaveBeenCalledWith('sub_789', 'canceled');
    expect(mockStatus).toHaveBeenCalledWith(200);
    expect(mockJson).toHaveBeenCalledWith(
      expect.objectContaining({ received: true, eventType: 'customer.subscription.deleted' })
    );
  });

  test('ignores unknown event types but still logs and acknowledges', async () => {
    const event = {
      id: 'evt-7',
      type: 'account.updated',
      data: { object: {} },
    };
    req.body = JSON.stringify(event);
    await handleStripeWebhook(req, res);
    expect(Order.updateStatus).not.toHaveBeenCalled();
    expect(Subscription.updateStatus).not.toHaveBeenCalled();
    expect(WebhookLog.create).toHaveBeenCalledWith(
      expect.objectContaining({
        eventId: 'evt-7',
        eventType: 'account.updated',
        status: 'processed',
      })
    );
    expect(mockStatus).toHaveBeenCalledWith(200);
    expect(mockJson).toHaveBeenCalledWith(
      expect.objectContaining({ received: true, eventType: 'account.updated' })
    );
  });

  test('returns 500 when an unexpected error occurs', async () => {
    const event = {
      id: 'evt-8',
      type: 'payment_intent.succeeded',
      data: {
        object: {
          id: 'pi_127',
          amount_received: 3000,
          metadata: { orderId: 'order-88' },
        },
      },
    };
    req.body = JSON.stringify(event);
    // Simulate error inside Order.updateStatus
    Order.updateStatus.mockRejectedValue(new Error('DB failure'));
    await handleStripeWebhook(req, res);
    expect(mockStatus).toHaveBeenCalledWith(500);
    expect(mockJson).toHaveBeenCalledWith(
      expect.objectContaining({
        success: false,
        error: 'Error processing webhook event',
        details: 'DB failure',
      })
    );
  });
});