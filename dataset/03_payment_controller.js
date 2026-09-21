// 03_payment_controller.js - Stripe Webhook Event Handling

// Mock Database & Services
export const Order = {
  findById: async (id) => null,
  updateStatus: async (id, status, metadata) => ({ id, status, ...metadata })
};

export const Subscription = {
  updateStatus: async (subId, status) => ({ subId, status })
};

export const WebhookLog = {
  findOne: async (query) => null,
  create: async (data) => ({ id: 'log-123', ...data })
};

export const StripeService = {
  constructEvent: (payload, signature, secret) => {
    if (!signature || signature === 'invalid_signature') {
      throw new Error('Invalid signature verification failed');
    }
    return typeof payload === 'string' ? JSON.parse(payload) : payload;
  }
};

export const handleStripeWebhook = async (req, res) => {
  const sig = req.headers ? req.headers['stripe-signature'] : undefined;
  const webhookSecret = process.env.STRIPE_WEBHOOK_SECRET || 'whsec_test_secret';

  if (!sig) {
    return res.status(400).json({
      success: false,
      error: 'Missing stripe-signature header'
    });
  }

  let event;
  try {
    event = StripeService.constructEvent(req.body, sig, webhookSecret);
  } catch (err) {
    return res.status(400).json({
      success: false,
      error: `Webhook signature verification failed: ${err.message}`
    });
  }

  if (!event || !event.id || !event.type) {
    return res.status(400).json({
      success: false,
      error: 'Malformed event object'
    });
  }

  try {
    const existingLog = await WebhookLog.findOne({ eventId: event.id });
    if (existingLog) {
      return res.status(200).json({
        received: true,
        message: 'Event already processed'
      });
    }

    const { type, data } = event;
    const eventObject = data?.object;

    switch (type) {
      case 'payment_intent.succeeded': {
        const orderId = eventObject?.metadata?.orderId;
        if (!orderId) {
          return res.status(422).json({
            success: false,
            error: 'Payment intent succeeded but missing orderId metadata'
          });
        }
        const order = await Order.findById(orderId);
        if (!order) {
          return res.status(404).json({
            success: false,
            error: `Order ${orderId} not found`
          });
        }
        await Order.updateStatus(orderId, 'paid', {
          transactionId: eventObject.id,
          amountPaid: eventObject.amount_received
        });
        break;
      }

      case 'payment_intent.payment_failed': {
        const orderId = eventObject?.metadata?.orderId;
        if (orderId) {
          await Order.updateStatus(orderId, 'payment_failed', {
            failureMessage: eventObject.last_payment_error?.message || 'Unknown payment error'
          });
        }
        break;
      }

      case 'customer.subscription.deleted': {
        const subId = eventObject?.id;
        if (subId) {
          await Subscription.updateStatus(subId, 'canceled');
        }
        break;
      }

      default:
        // Other events can be safely ignored but acknowledged
        break;
    }

    await WebhookLog.create({
      eventId: event.id,
      eventType: type,
      status: 'processed',
      processedAt: new Date()
    });

    return res.status(200).json({
      received: true,
      eventType: type
    });
  } catch (error) {
    return res.status(500).json({
      success: false,
      error: 'Error processing webhook event',
      details: error.message
    });
  }
};
