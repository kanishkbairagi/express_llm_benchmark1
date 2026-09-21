import { jest } from '@jest/globals';
import {
  handleStripeWebhook,
  StripeService,
  Order,
  Subscription,
  WebhookLog
} from '../dataset/03_payment_controller.js';

describe('Stripe Webhook Controller Unit Tests', () => {
  let req;
  let res;

  beforeEach(() => {
    jest.clearAllMocks();
    jest.restoreAllMocks();

    req = {
      headers: {
        'stripe-signature': 'valid_sig_123'
      },
      body: JSON.stringify({
        id: 'evt_test_123',
        type: 'payment_intent.succeeded',
        data: {
          object: {
            id: 'pi_123',
            amount_received: 5000,
            metadata: { orderId: 'ord_123' }
          }
        }
      })
    };

    res = {
      status: jest.fn().mockReturnThis(),
      json: jest.fn().mockReturnThis()
    };
  });

  describe('StripeService.constructEvent', () => {
    it('should throw error when signature is missing', () => {
      expect(() => StripeService.constructEvent('{}', null, 'secret')).toThrow(
        'Invalid signature verification failed'
      );
    });

    it('should throw error when signature is "invalid_signature"', () => {
      expect(() =>
        StripeService.constructEvent('{}', 'invalid_signature', 'secret')
      ).toThrow('Invalid signature verification failed');
    });

    it('should parse string payload into JSON', () => {
      const payload = JSON.stringify({ id: 'evt_1', type: 'test' });
      const result = StripeService.constructEvent(payload, 'valid_sig', 'secret');
      expect(result).toEqual({ id: 'evt_1', type: 'test' });
    });

    it('should return object payload directly if already parsed', () => {
      const payload = { id: 'evt_1', type: 'test' };
      const result = StripeService.constructEvent(payload, 'valid_sig', 'secret');
      expect(result).toEqual(payload);
    });
  });

  describe('handleStripeWebhook validation', () => {
    it('should return 400 if stripe-signature header is missing', async () => {
      req.headers = {};

      await handleStripeWebhook(req, res);

      expect(res.status).toHaveBeenCalledWith(400);
      expect(res.json).toHaveBeenCalledWith({
        success: false,
        error: 'Missing stripe-signature header'
      });
    });

    it('should return 400 if req.headers is undefined', async () => {
      req.headers = undefined;

      await handleStripeWebhook(req, res);

      expect(res.status).toHaveBeenCalledWith(400);
      expect(res.json).toHaveBeenCalledWith({
        success: false,
        error: 'Missing stripe-signature header'
      });
    });

    it('should return 400 if signature verification fails', async () => {
      jest.spyOn(StripeService, 'constructEvent').mockImplementation(() => {
        throw new Error('Invalid signature verification failed');
      });

      await handleStripeWebhook(req, res);

      expect(res.status).toHaveBeenCalledWith(400);
      expect(res.json).toHaveBeenCalledWith({
        success: false,
        error: 'Webhook signature verification failed: Invalid signature verification failed'
      });
    });

    it('should return 400 if event object is malformed or missing id/type', async () => {
      jest.spyOn(StripeService, 'constructEvent').mockReturnValue({ id: 'evt_123' }); // missing type

      await handleStripeWebhook(req, res);

      expect(res.status).toHaveBeenCalledWith(400);
      expect(res.json).toHaveBeenCalledWith({
        success: false,
        error: 'Malformed event object'
      });
    });
  });

  describe('Idempotency check', () => {
    it('should return 200 with already processed message if log exists', async () => {
      jest.spyOn(WebhookLog, 'findOne').mockResolvedValue({ id: 'log-123', eventId: 'evt_test_123' });

      await handleStripeWebhook(req, res);

      expect(WebhookLog.findOne).toHaveBeenCalledWith({ eventId: 'evt_test_123' });
      expect(res.status).toHaveBeenCalledWith(200);
      expect(res.json).toHaveBeenCalledWith({
        received: true,
        message: 'Event already processed'
      });
    });
  });

  describe('Event processing: payment_intent.succeeded', () => {
    it('should return 422 if orderId metadata is missing', async () => {
      jest.spyOn(WebhookLog, 'findOne').mockResolvedValue(null);
      req.body = JSON.stringify({
        id: 'evt_123',
        type: 'payment_intent.succeeded',
        data: { object: { id: 'pi_123', metadata: {} } }
      });

      await handleStripeWebhook(req, res);

      expect(res.status).toHaveBeenCalledWith(422);
      expect(res.json).toHaveBeenCalledWith({
        success: false,
        error: 'Payment intent succeeded but missing orderId metadata'
      });
    });

    it('should return 404 if order is not found', async () => {
      jest.spyOn(WebhookLog, 'findOne').mockResolvedValue(null);
      jest.spyOn(Order, 'findById').mockResolvedValue(null);

      await handleStripeWebhook(req, res);

      expect(Order.findById).toHaveBeenCalledWith('ord_123');
      expect(res.status).toHaveBeenCalledWith(404);
      expect(res.json).toHaveBeenCalledWith({
        success: false,
        error: 'Order ord_123 not found'
      });
    });

    it('should update order status to paid and log webhook on success', async () => {
      jest.spyOn(WebhookLog, 'findOne').mockResolvedValue(null);
      jest.spyOn(Order, 'findById').mockResolvedValue({ id: 'ord_123' });
      jest.spyOn(Order, 'updateStatus').mockResolvedValue({ id: 'ord_123', status: 'paid' });
      jest.spyOn(WebhookLog, 'create').mockResolvedValue({ id: 'log-123' });

      await handleStripeWebhook(req, res);

      expect(Order.updateStatus).toHaveBeenCalledWith('ord_123', 'paid', {
        transactionId: 'pi_123',
        amountPaid: 5000
      });
      expect(WebhookLog.create).toHaveBeenCalledWith(
        expect.objectContaining({
          eventId: 'evt_test_123',
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
  });

  describe('Event processing: payment_intent.payment_failed', () => {
    it('should update order status with last payment error message if available', async () => {
      jest.spyOn(WebhookLog, 'findOne').mockResolvedValue(null);
      jest.spyOn(Order, 'updateStatus').mockResolvedValue({});
      jest.spyOn(WebhookLog, 'create').mockResolvedValue({});

      req.body = JSON.stringify({
        id: 'evt_failed_1',
        type: 'payment_intent.payment_failed',
        data: {
          object: {
            id: 'pi_123',
            metadata: { orderId: 'ord_123' },
            last_payment_error: { message: 'Insufficient funds' }
          }
        }
      });

      await handleStripeWebhook(req, res);

      expect(Order.updateStatus).toHaveBeenCalledWith('ord_123', 'payment_failed', {
        failureMessage: 'Insufficient funds'
      });
      expect(res.status).toHaveBeenCalledWith(200);
    });

    it('should use default error message if last_payment_error is missing', async () => {
      jest.spyOn(WebhookLog, 'findOne').mockResolvedValue(null);
      jest.spyOn(Order, 'updateStatus').mockResolvedValue({});
      jest.spyOn(WebhookLog, 'create').mockResolvedValue({});

      req.body = JSON.stringify({
        id: 'evt_failed_2',
        type: 'payment_intent.payment_failed',
        data: {
          object: {
            id: 'pi_123',
            metadata: { orderId: 'ord_123' }
          }
        }
      });

      await handleStripeWebhook(req, res);

      expect(Order.updateStatus).toHaveBeenCalledWith('ord_123', 'payment_failed', {
        failureMessage: 'Unknown payment error'
      });
      expect(res.status).toHaveBeenCalledWith(200);
    });

    it('should proceed without updating order if orderId is missing', async () => {
      jest.spyOn(WebhookLog, 'findOne').mockResolvedValue(null);
      jest.spyOn(Order, 'updateStatus').mockResolvedValue({});
      jest.spyOn(WebhookLog, 'create').mockResolvedValue({});

      req.body = JSON.stringify({
        id: 'evt_failed_3',
        type: 'payment_intent.payment_failed',
        data: { object: { id: 'pi_123' } }
      });

      await handleStripeWebhook(req, res);

      expect(Order.updateStatus).not.toHaveBeenCalled();
      expect(WebhookLog.create).toHaveBeenCalled();
      expect(res.status).toHaveBeenCalledWith(200);
    });
  });

  describe('Event processing: customer.subscription.deleted', () => {
    it('should update subscription status to canceled when subId is present', async () => {
      jest.spyOn(WebhookLog, 'findOne').mockResolvedValue(null);
      jest.spyOn(Subscription, 'updateStatus').mockResolvedValue({});
      jest.spyOn(WebhookLog, 'create').mockResolvedValue({});

      req.body = JSON.stringify({
        id: 'evt_sub_1',
        type: 'customer.subscription.deleted',
        data: { object: { id: 'sub_123' } }
      });

      await handleStripeWebhook(req, res);

      expect(Subscription.updateStatus).toHaveBeenCalledWith('sub_123', 'canceled');
      expect(res.status).toHaveBeenCalledWith(200);
    });

    it('should proceed without updating subscription if subId is missing', async () => {
      jest.spyOn(WebhookLog, 'findOne').mockResolvedValue(null);
      jest.spyOn(Subscription, 'updateStatus').mockResolvedValue({});
      jest.spyOn(WebhookLog, 'create').mockResolvedValue({});

      req.body = JSON.stringify({
        id: 'evt_sub_2',
        type: 'customer.subscription.deleted',
        data: { object: {} }
      });

      await handleStripeWebhook(req, res);

      expect(Subscription.updateStatus).not.toHaveBeenCalled();
      expect(res.status).toHaveBeenCalledWith(200);
    });
  });

  describe('Unhandled event types', () => {
    it('should handle unhandled event types gracefully and record log', async () => {
      jest.spyOn(WebhookLog, 'findOne').mockResolvedValue(null);
      jest.spyOn(WebhookLog, 'create').mockResolvedValue({});

      req.body = JSON.stringify({
        id: 'evt_other_1',
        type: 'customer.created',
        data: { object: { id: 'cus_123' } }
      });

      await handleStripeWebhook(req, res);

      expect(WebhookLog.create).toHaveBeenCalledWith(
        expect.objectContaining({
          eventId: 'evt_other_1',
          eventType: 'customer.created'
        })
      );
      expect(res.status).toHaveBeenCalledWith(200);
      expect(res.json).toHaveBeenCalledWith({
        received: true,
        eventType: 'customer.created'
      });
    });
  });

  describe('Error handling', () => {
    it('should return 500 if database operation throws an exception', async () => {
      jest.spyOn(WebhookLog, 'findOne').mockRejectedValue(new Error('Database connection failed'));

      await handleStripeWebhook(req, res);

      expect(res.status).toHaveBeenCalledWith(500);
      expect(res.json).toHaveBeenCalledWith({
        success: false,
        error: 'Error processing webhook event',
        details: 'Database connection failed'
      });
    });
  });
});