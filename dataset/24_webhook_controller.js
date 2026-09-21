// 24_webhook_controller.js - Third-party API Event Ingestion

// Mock Database & Dispatcher
export const WebhookEventStore = {
  findEvent: async (eventId) => null,
  saveEvent: async (eventData) => ({ id: eventData.eventId, ...eventData, receivedAt: new Date() }),
  getDeliveryStatus: async (eventId) => null
};

export const EventDispatcher = {
  dispatch: async (topic, payload) => ({ queued: true, queueId: `job_${Date.now()}` })
};

const AUTHORIZED_WEBHOOK_TOKENS = new Set(['wh_secret_live_tok_abc123', 'wh_secret_test_tok_xyz789']);

export const ingestWebhook = async (req, res) => {
  try {
    const token = req.headers ? req.headers['x-webhook-token'] : null;

    if (!token || !AUTHORIZED_WEBHOOK_TOKENS.has(token)) {
      return res.status(401).json({
        success: false,
        error: 'Unauthorized: Invalid or missing x-webhook-token header'
      });
    }

    const { eventId, eventType, timestamp, payload } = req.body || {};

    if (!eventId || !eventType || !payload) {
      return res.status(400).json({
        success: false,
        error: 'Missing required payload fields: eventId, eventType, and payload are required'
      });
    }

    const existingEvent = await WebhookEventStore.findEvent(eventId);
    if (existingEvent) {
      return res.status(200).json({
        success: true,
        message: 'Duplicate event acknowledged',
        duplicate: true,
        eventId
      });
    }

    const eventRecord = await WebhookEventStore.saveEvent({
      eventId,
      eventType,
      timestamp: timestamp || new Date().toISOString(),
      payload
    });

    const queueJob = await EventDispatcher.dispatch(eventType, payload);

    return res.status(202).json({
      success: true,
      message: 'Event accepted for asynchronous processing',
      data: {
        eventId: eventRecord.id,
        queueJobId: queueJob.queueId,
        status: 'queued'
      }
    });
  } catch (error) {
    return res.status(500).json({
      success: false,
      error: 'Failed to ingest webhook event',
      details: error.message
    });
  }
};

export const getDeliveryStatus = async (req, res) => {
  try {
    const { eventId } = req.params || {};

    if (!eventId) {
      return res.status(400).json({
        success: false,
        error: 'Event ID parameter is required'
      });
    }

    const status = await WebhookEventStore.getDeliveryStatus(eventId);
    if (!status) {
      return res.status(404).json({
        success: false,
        error: `Webhook event with ID ${eventId} was not found`
      });
    }

    return res.status(200).json({
      success: true,
      data: status
    });
  } catch (error) {
    return res.status(500).json({
      success: false,
      error: 'Failed to check event delivery status',
      details: error.message
    });
  }
};
