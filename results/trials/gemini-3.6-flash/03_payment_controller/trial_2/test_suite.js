import { jest } from '@jest/globals';
import {
  Order,
  Subscription,
  WebhookLog,
  StripeService,
  handleStripeWebhook
} from '../dataset/03_payment_controller.js';

describe('03_payment_controller', () => {
  const createMockReqRes = (headers = {}, body = {}) => {
    const req = { headers, body };
    const res = {
      status: jest.fn().mockReturnThis(),
      json: jest.fn().mockReturnThis()
    };
    return { req, res };
  };

  afterEach(() => {
    jest.restoreAllMocks();
  });

  describe('StripeService', () => {
    test('throws error if signature is missing or invalid_signature', () => {
      expect(() => StripeService.constructEvent({ id: 'evt_1' }, null, 'secret')).toThrow(
        'Invalid signature verification failed'
      );
      expect(() => StripeService.constructEvent({ id: 'evt_1' }, 'invalid_signature', 'secret')).toThrow(
        'Invalid signature verification failed'
      );
    });

    test('parses JSON string payload when payload is a string', () => {
      const payload = JSON.stringify({ id: 'evt_1', type: 'payment_intent.succeeded' });
      const result = StripeService.constructEvent(payload, 'valid_sig', 'secret');
      expect(result).toEqual({ id: 'evt_1', type: 'payment_intent.succeeded' });
    });

    test('returns payload directly if it is already an object', () => {
      const payload = { id: 'evt_1', type: 'payment_intent.succeeded' };
      const result = StripeService.constructEvent(payload, 'valid_sig', 'secret');
      expect(result).toBe(payload);
    });
  });

  describe('handleStripeWebhook', () => {
    test('returns 400 if stripe-signature header is missing', async () => {
      const { req, res } = createMockReqRes({}, {});

      await handleStripeWebhook(req, res);

      expect(res.status).toHaveBeenCalledWith(400);
      expect(res.json).toHaveBeenCalledWith({
        success: false,
        error: 'Missing stripe-signature header'
      });
    });

    test('returns 400 if stripe-signature header is invalid', async () => {
      const { req, res } = createMockReqRes({ 'stripe-signature': 'invalid_signature' }, {});

      await handleStripeWebhook(req, res);

      expect(res.status).toHaveBeenCalledWith(400);
      expect(res.json).toHaveBeenCalledWith({
        success: false,
        error: 'Webhook signature verification failed: Invalid signature verification failed'
      });
    });

    test('returns 400 if event object is missing required fields', async () => {
      const { req, res } = createMockReqRes(
        { 'stripe-signature': 'valid_sig' },
        { id: 'evt_1' } // missing type
      );

      await handleStripeWebhook(req, res);

      expect(res.status).toHaveBeenCalledWith(400);
      expect(res.json).toHaveBeenCalledWith({
        success: false,
        error: 'Malformed event object'
      });
    });

    test('returns 200 if event has already been processed', async () => {
      jest.spyOn(WebhookLog, 'findOne').mockResolvedValueOnce({ id: 'log-123' });

      const { req, res } = createMockReqRes(
        { 'stripe-signature': 'valid_sig' },
        { id: 'evt_1', type: 'payment_intent.succeeded' }
      );

      await handleStripeWebhook(req, res);

      expect(WebhookLog.findOne).toHaveBeenCalledWith({ eventId: 'evt_1' });
      expect(res.status).toHaveBeenCalledWith(200);
      expect(res.json).toHaveBeenCalledWith({
        received: true,
        message: 'Event already processed'
      });
    });

    describe('event: payment_intent.succeeded', () => {
      test('returns 422 if orderId metadata is missing', async () => {
        jest.spyOn(WebhookLog, 'findOne').mockResolvedValueOnce(null);

        const event = {
          id: 'evt_1',
          type: 'payment_intent.succeeded',
          data: { object: { id: 'pi_1' } }
        };

        const { req, res } = createMockReqRes({ 'stripe-signature': 'valid_sig' }, event);

        await handleStripeWebhook(req, res);

        expect(res.status).toHaveBeenCalledWith(422);
        expect(res.json).toHaveBeenCalledWith({
          success: false,
          error: 'Payment intent succeeded but missing orderId metadata'
        });
      });

      test('returns 404 if order does not exist in database', async () => {
        jest.spyOn(WebhookLog, 'findOne').mockResolvedValueOnce(null);
        jest.spyOn(Order, 'findById').mockResolvedValueOnce(null);

        const event = {
          id: 'evt_1',
          type: 'payment_intent.succeeded',
          data: {
            object: {
              id: 'pi_1',
              metadata: { orderId: 'order_999' }
            }
          }
        };

        const { req, res } = createMockReqRes({ 'stripe-signature': 'valid_sig' }, event);

        await handleStripeWebhook(req, res);

        expect(Order.findById).toHaveBeenCalledWith('order_999');
        expect(res.status).toHaveBeenCalledWith(404);
        expect(res.json).toHaveBeenCalledWith({
          success: false,
          error: 'Order order_999 not found'
        });
      });

      test('updates order status and logs webhook event successfully', async () => {
        jest.spyOn(WebhookLog, 'findOne').mockResolvedValueOnce(null);
        jest.spyOn(Order, 'findById').mockResolvedValueOnce({ id: 'order_123' });
        const updateStatusSpy = jest.spyOn(Order, 'updateStatus').mockResolvedValueOnce({});
        const createLogSpy = jest.spyOn(WebhookLog, 'create').mockResolvedValueOnce({});

        const event = {
          id: 'evt_1',
          type: 'payment_intent.succeeded',
          data: {
            object: {
              id: 'pi_123',
              amount_received: 2500,
              metadata: { orderId: 'order_123' }
            }
          }
        };

        const { req, res } = createMockReqRes({ 'stripe-signature': 'valid_sig' }, event);

        await handleStripeWebhook(req, res);

        expect(updateStatusSpy).toHaveBeenCalledWith('order_123', 'paid', {
          transactionId: 'pi_123',
          amountPaid: 2500
        });
        expect(createLogSpy).toHaveBeenCalledWith({
          eventId: 'evt_1',
          eventType: 'payment_intent.succeeded',
          status: 'processed',
          processedAt: expect.any(Date)
        });
        expect(res.status).toHaveBeenCalledWith(200);
        expect(res.json).toHaveBeenCalledWith({
          received: true,
          eventType: 'payment_intent.succeeded'
        });
      });
    });

    describe('event: payment_intent.payment_failed', () => {
      test('updates order status to payment_failed with provided error message', async () => {
        jest.spyOn(WebhookLog, 'findOne').mockResolvedValueOnce(null);
        const updateStatusSpy = jest.spyOn(Order, 'updateStatus').mockResolvedValueOnce({});
        jest.spyOn(WebhookLog, 'create').mockResolvedValueOnce({});

        const event = {
          id: 'evt_2',
          type: 'payment_intent.payment_failed',
          data: {
            object: {
              metadata: { orderId: 'order_123' },
              last_payment_error: { message: 'Insufficient funds' }
            }
          }
        };

        const { req, res } = createMockReqRes({ 'stripe-signature': 'valid_sig' }, event);

        await handleStripeWebhook(req, res);

        expect(updateStatusSpy).toHaveBeenCalledWith('order_123', 'payment_failed', {
          failureMessage: 'Insufficient funds'
        });
        expect(res.status).toHaveBeenCalledWith(200);
      });

      test('uses fallback failure message when last_payment_error message is missing', async () => {
        jest.spyOn(WebhookLog, 'findOne').mockResolvedValueOnce(null);
        const updateStatusSpy = jest.spyOn(Order, 'updateStatus').mockResolvedValueOnce({});

        const event = {
          id: 'evt_2',
          type: 'payment_intent.payment_failed',
          data: {
            object: {
              metadata: { orderId: 'order_123' }
            }
          }
        };

        const { req, res } = createMockReqRes({ 'stripe-signature': 'valid_sig' }, event);

        await handleStripeWebhook(req, res);

        expect(updateStatusSpy).toHaveBeenCalledWith('order_123', 'payment_failed', {
          failureMessage: 'Unknown payment error'
        });
      });
    });

    describe('event: customer.subscription.deleted', () => {
      test('updates subscription status to canceled', async () => {
        jest.spyOn(WebhookLog, 'findOne').mockResolvedValueOnce(null);
        const subSpy = jest.spyOn(Subscription, 'updateStatus').mockResolvedValueOnce({});
        jest.spyOn(WebhookLog, 'create').mockResolvedValueOnce({});

        const event = {
          id: 'evt_3',
          type: 'customer.subscription.deleted',
          data: {
            object: { id: 'sub_456' }
          }
        };

        const { req, res } = createMockReqRes({ 'stripe-signature': 'valid_sig' }, event);

        await handleStripeWebhook(req, res);

        expect(subSpy).toHaveBeenCalledWith('sub_456', 'canceled');
        expect(res.status).toHaveBeenCalledWith(200);
      });
    });

    describe('unhandled event type', () => {
      test('logs the event and returns 200 without modifying models', async () => {
        jest.spyOn(WebhookLog, 'findOne').mockResolvedValueOnce(null);
        const createLogSpy = jest.spyOn(WebhookLog, 'create').mockResolvedValueOnce({});
        const orderSpy = jest.spyOn(Order, 'updateStatus');
        const subSpy = jest.spyOn(Subscription, 'updateStatus');

        const event = {
          id: 'evt_4',
          type: 'charge.dispute.created',
          data: { object: { id: 'dp_123' } }
        };

        const { req, res } = createMockReqRes({ 'stripe-signature': 'valid_sig' }, event);

        await handleStripeWebhook(req, res);

        expect(orderSpy).not.toHaveBeenCalled();
        expect(subSpy).not.toHaveBeenCalled();
        expect(createLogSpy).toHaveBeenCalledWith({
          eventId: 'evt_4',
          eventType: 'charge.dispute.created',
          status: 'processed',
          processedAt: expect.any(Date)
        });
        expect(res.status).toHaveBeenCalledWith(200);
      });
    });

    describe('error handling', () => {
      test('returns 500 status when an unhandled database error occurs', async () => {
        jest.spyOn(WebhookLog, 'findOne').mockRejectedValueOnce(new Error('Database offline'));

        const event = {
          id: 'evt_5',
          type: 'payment_intent.succeeded',
          data: { object: {} }
        };

        const { req, res } = createMockReqRes({ 'stripe-signature': 'valid_sig' }, event);

        await handleStripeWebhook(req, res);

        expect(res.status).toHaveBeenCalledWith(500);
        expect(res.json).toHaveBeenCalledWith({
          success: false,
          error: 'Error processing webhook event',
          details: 'Database offline'
        });
      });
    });
  });
});