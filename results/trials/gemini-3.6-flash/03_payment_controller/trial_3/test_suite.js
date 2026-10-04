import { jest } from '@jest/globals';
import {
  handleStripeWebhook,
  Order,
  Subscription,
  WebhookLog,
  StripeService
} from '../dataset/03_payment_controller.js';

describe('handleStripeWebhook', () => {
  let req;
  let res;

  beforeEach(() => {
    jest.clearAllMocks();
    req = {
      headers: {
        'stripe-signature': 'valid_signature'
      },
      body: {
        id: 'evt_123',
        type: 'payment_intent.succeeded',
        data: {
          object: {
            id: 'pi_123',
            amount_received: 2000,
            metadata: {
              orderId: 'ord_123'
            }
          }
        }
      }
    };

    res = {
      status: jest.fn().mockReturnThis(),
      json: jest.fn().mockReturnThis()
    };
  });

  describe('Header and Signature Verification', () => {
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

    it('should return 400 if event construct/signature verification fails', async () => {
      req.headers['stripe-signature'] = 'invalid_signature';

      await handleStripeWebhook(req, res);

      expect(res.status).toHaveBeenCalledWith(400);
      expect(res.json).toHaveBeenCalledWith({
        success: false,
        error: 'Webhook signature verification failed: Invalid signature verification failed'
      });
    });

    it('should parse string payload successfully', async () => {
      jest.spyOn(WebhookLog, 'findOne').mockResolvedValueOnce(null);
      jest.spyOn(Order, 'findById').mockResolvedValueOnce({ id: 'ord_123' });
      jest.spyOn(Order, 'updateStatus').mockResolvedValueOnce({});
      jest.spyOn(WebhookLog, 'create').mockResolvedValueOnce({});

      req.body = JSON.stringify({
        id: 'evt_123',
        type: 'payment_intent.succeeded',
        data: {
          object: {
            id: 'pi_123',
            amount_received: 2000,
            metadata: { orderId: 'ord_123' }
          }
        }
      });

      await handleStripeWebhook(req, res);

      expect(res.status).toHaveBeenCalledWith(200);
      expect(res.json).toHaveBeenCalledWith({
        received: true,
        eventType: 'payment_intent.succeeded'
      });
    });
  });

  describe('Malformed Event Handling', () => {
    it('should return 400 if event object is missing id', async () => {
      req.body = { type: 'payment_intent.succeeded' };

      await handleStripeWebhook(req, res);

      expect(res.status).toHaveBeenCalledWith(400);
      expect(res.json).toHaveBeenCalledWith({
        success: false,
        error: 'Malformed event object'
      });
    });

    it('should return 400 if event object is missing type', async () => {
      req.body = { id: 'evt_123' };

      await handleStripeWebhook(req, res);

      expect(res.status).toHaveBeenCalledWith(400);
      expect(res.json).toHaveBeenCalledWith({
        success: false,
        error: 'Malformed event object'
      });
    });
  });

  describe('Idempotency / Existing Event', () => {
    it('should return 200 if the event has already been processed', async () => {
      jest.spyOn(WebhookLog, 'findOne').mockResolvedValueOnce({
        id: 'log-123',
        eventId: 'evt_123'
      });

      await handleStripeWebhook(req, res);

      expect(WebhookLog.findOne).toHaveBeenCalledWith({ eventId: 'evt_123' });
      expect(res.status).toHaveBeenCalledWith(200);
      expect(res.json).toHaveBeenCalledWith({
        received: true,
        message: 'Event already processed'
      });
    });
  });

  describe('Event Type: payment_intent.succeeded', () => {
    it('should return 422 if metadata does not contain orderId', async () => {
      jest.spyOn(WebhookLog, 'findOne').mockResolvedValueOnce(null);
      req.body.data.object.metadata = {};

      await handleStripeWebhook(req, res);

      expect(res.status).toHaveBeenCalledWith(422);
      expect(res.json).toHaveBeenCalledWith({
        success: false,
        error: 'Payment intent succeeded but missing orderId metadata'
      });
    });

    it('should return 404 if the target order is not found', async () => {
      jest.spyOn(WebhookLog, 'findOne').mockResolvedValueOnce(null);
      jest.spyOn(Order, 'findById').mockResolvedValueOnce(null);

      await handleStripeWebhook(req, res);

      expect(Order.findById).toHaveBeenCalledWith('ord_123');
      expect(res.status).toHaveBeenCalledWith(404);
      expect(res.json).toHaveBeenCalledWith({
        success: false,
        error: 'Order ord_123 not found'
      });
    });

    it('should update order status to paid and log webhook event when order is found', async () => {
      jest.spyOn(WebhookLog, 'findOne').mockResolvedValueOnce(null);
      jest.spyOn(Order, 'findById').mockResolvedValueOnce({ id: 'ord_123' });
      jest.spyOn(Order, 'updateStatus').mockResolvedValueOnce({ id: 'ord_123', status: 'paid' });
      jest.spyOn(WebhookLog, 'create').mockResolvedValueOnce({ id: 'log-123' });

      await handleStripeWebhook(req, res);

      expect(Order.updateStatus).toHaveBeenCalledWith('ord_123', 'paid', {
        transactionId: 'pi_123',
        amountPaid: 2000
      });
      expect(WebhookLog.create).toHaveBeenCalledWith({
        eventId: 'evt_123',
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

  describe('Event Type: payment_intent.payment_failed', () => {
    it('should update order status with failure message when orderId is provided', async () => {
      jest.spyOn(WebhookLog, 'findOne').mockResolvedValueOnce(null);
      jest.spyOn(Order, 'updateStatus').mockResolvedValueOnce({});
      jest.spyOn(WebhookLog, 'create').mockResolvedValueOnce({});

      req.body = {
        id: 'evt_fail_123',
        type: 'payment_intent.payment_failed',
        data: {
          object: {
            metadata: { orderId: 'ord_123' },
            last_payment_error: { message: 'Insufficient funds' }
          }
        }
      };

      await handleStripeWebhook(req, res);

      expect(Order.updateStatus).toHaveBeenCalledWith('ord_123', 'payment_failed', {
        failureMessage: 'Insufficient funds'
      });
      expect(WebhookLog.create).toHaveBeenCalled();
      expect(res.status).toHaveBeenCalledWith(200);
      expect(res.json).toHaveBeenCalledWith({
        received: true,
        eventType: 'payment_intent.payment_failed'
      });
    });

    it('should use default error message if last_payment_error message is not available', async () => {
      jest.spyOn(WebhookLog, 'findOne').mockResolvedValueOnce(null);
      jest.spyOn(Order, 'updateStatus').mockResolvedValueOnce({});
      jest.spyOn(WebhookLog, 'create').mockResolvedValueOnce({});

      req.body = {
        id: 'evt_fail_123',
        type: 'payment_intent.payment_failed',
        data: {
          object: {
            metadata: { orderId: 'ord_123' }
          }
        }
      };

      await handleStripeWebhook(req, res);

      expect(Order.updateStatus).toHaveBeenCalledWith('ord_123', 'payment_failed', {
        failureMessage: 'Unknown payment error'
      });
      expect(res.status).toHaveBeenCalledWith(200);
    });

    it('should process log without updating order if orderId is missing in payment_failed', async () => {
      jest.spyOn(WebhookLog, 'findOne').mockResolvedValueOnce(null);
      jest.spyOn(Order, 'updateStatus').mockResolvedValueOnce({});
      jest.spyOn(WebhookLog, 'create').mockResolvedValueOnce({});

      req.body = {
        id: 'evt_fail_no_order',
        type: 'payment_intent.payment_failed',
        data: {
          object: {}
        }
      };

      await handleStripeWebhook(req, res);

      expect(Order.updateStatus).not.toHaveBeenCalled();
      expect(WebhookLog.create).toHaveBeenCalled();
      expect(res.status).toHaveBeenCalledWith(200);
    });
  });

  describe('Event Type: customer.subscription.deleted', () => {
    it('should cancel subscription when subId is present', async () => {
      jest.spyOn(WebhookLog, 'findOne').mockResolvedValueOnce(null);
      jest.spyOn(Subscription, 'updateStatus').mockResolvedValueOnce({ subId: 'sub_123', status: 'canceled' });
      jest.spyOn(WebhookLog, 'create').mockResolvedValueOnce({});

      req.body = {
        id: 'evt_sub_del',
        type: 'customer.subscription.deleted',
        data: {
          object: {
            id: 'sub_123'
          }
        }
      };

      await handleStripeWebhook(req, res);

      expect(Subscription.updateStatus).toHaveBeenCalledWith('sub_123', 'canceled');
      expect(WebhookLog.create).toHaveBeenCalled();
      expect(res.status).toHaveBeenCalledWith(200);
      expect(res.json).toHaveBeenCalledWith({
        received: true,
        eventType: 'customer.subscription.deleted'
      });
    });

    it('should not update subscription if subId is missing', async () => {
      jest.spyOn(WebhookLog, 'findOne').mockResolvedValueOnce(null);
      jest.spyOn(Subscription, 'updateStatus').mockResolvedValueOnce({});
      jest.spyOn(WebhookLog, 'create').mockResolvedValueOnce({});

      req.body = {
        id: 'evt_sub_no_id',
        type: 'customer.subscription.deleted',
        data: {
          object: {}
        }
      };

      await handleStripeWebhook(req, res);

      expect(Subscription.updateStatus).not.toHaveBeenCalled();
      expect(WebhookLog.create).toHaveBeenCalled();
      expect(res.status).toHaveBeenCalledWith(200);
    });
  });

  describe('Unhandled Event Types', () => {
    it('should acknowledge and log unhandled event types', async () => {
      jest.spyOn(WebhookLog, 'findOne').mockResolvedValueOnce(null);
      jest.spyOn(WebhookLog, 'create').mockResolvedValueOnce({});

      req.body = {
        id: 'evt_other',
        type: 'charge.dispute.created',
        data: { object: {} }
      };

      await handleStripeWebhook(req, res);

      expect(WebhookLog.create).toHaveBeenCalledWith({
        eventId: 'evt_other',
        eventType: 'charge.dispute.created',
        status: 'processed',
        processedAt: expect.any(Date)
      });
      expect(res.status).toHaveBeenCalledWith(200);
      expect(res.json).toHaveBeenCalledWith({
        received: true,
        eventType: 'charge.dispute.created'
      });
    });
  });

  describe('Internal Server Error Handling', () => {
    it('should return 500 status when an unexpected exception occurs during processing', async () => {
      jest.spyOn(WebhookLog, 'findOne').mockRejectedValueOnce(new Error('Database failure'));

      await handleStripeWebhook(req, res);

      expect(res.status).toHaveBeenCalledWith(500);
      expect(res.json).toHaveBeenCalledWith({
        success: false,
        error: 'Error processing webhook event',
        details: 'Database failure'
      });
    });
  });
});