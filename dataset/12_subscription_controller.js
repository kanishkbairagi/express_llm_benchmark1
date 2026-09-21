// 12_subscription_controller.js - SaaS Tier Upgrades & Cancellations

// Mock Database & Payment Gateway
export const UserSubscription = {
  findByUserId: async (userId) => null,
  update: async (userId, data) => ({ userId, ...data, updatedAt: new Date() })
};

export const BillingGateway = {
  createOrUpdateSubscription: async ({ customerId, planId, paymentMethodId }) => ({
    subscriptionId: `sub_stripe_${Date.now()}`,
    status: 'active',
    currentPeriodEnd: new Date(Date.now() + 30 * 24 * 60 * 60 * 1000)
  }),
  cancelAtPeriodEnd: async (subscriptionId) => ({
    subscriptionId,
    cancelAtPeriodEnd: true
  })
};

const TIER_HIERARCHY = {
  free: 0,
  starter: 1,
  pro: 2,
  enterprise: 3
};

export const upgradeSubscription = async (req, res) => {
  try {
    const userId = req.user?.id || req.body?.userId;
    const { targetTier, billingCycle = 'monthly', paymentMethodId } = req.body || {};

    if (!userId) {
      return res.status(401).json({ success: false, error: 'Authentication required' });
    }

    if (!targetTier || !(targetTier in TIER_HIERARCHY)) {
      return res.status(400).json({
        success: false,
        error: `Invalid tier. Available tiers: ${Object.keys(TIER_HIERARCHY).join(', ')}`
      });
    }

    if (!['monthly', 'annual'].includes(billingCycle)) {
      return res.status(400).json({
        success: false,
        error: 'billingCycle must be either "monthly" or "annual"'
      });
    }

    const currentSub = await UserSubscription.findByUserId(userId);
    const currentTier = currentSub ? currentSub.tier : 'free';

    if (TIER_HIERARCHY[targetTier] === TIER_HIERARCHY[currentTier]) {
      return res.status(400).json({
        success: false,
        error: `User is already on the "${targetTier}" tier`
      });
    }

    if (TIER_HIERARCHY[targetTier] < TIER_HIERARCHY[currentTier]) {
      return res.status(400).json({
        success: false,
        error: 'Downgrades must be processed through the tier change request workflow'
      });
    }

    if (targetTier !== 'free' && !paymentMethodId) {
      return res.status(400).json({
        success: false,
        error: 'Payment method is required for paid tiers'
      });
    }

    const gatewayResponse = await BillingGateway.createOrUpdateSubscription({
      customerId: req.user?.customerId || `cust_${userId}`,
      planId: `${targetTier}_${billingCycle}`,
      paymentMethodId
    });

    const updatedSub = await UserSubscription.update(userId, {
      tier: targetTier,
      billingCycle,
      status: gatewayResponse.status,
      gatewaySubscriptionId: gatewayResponse.subscriptionId,
      currentPeriodEnd: gatewayResponse.currentPeriodEnd,
      cancelAtPeriodEnd: false
    });

    return res.status(200).json({
      success: true,
      message: `Successfully upgraded subscription to ${targetTier}`,
      data: updatedSub
    });
  } catch (error) {
    return res.status(500).json({
      success: false,
      error: 'Failed to process subscription upgrade',
      details: error.message
    });
  }
};

export const cancelSubscription = async (req, res) => {
  try {
    const userId = req.user?.id || req.body?.userId;
    const { reason } = req.body || {};

    if (!userId) {
      return res.status(401).json({ success: false, error: 'Authentication required' });
    }

    const currentSub = await UserSubscription.findByUserId(userId);
    if (!currentSub || currentSub.tier === 'free') {
      return res.status(404).json({
        success: false,
        error: 'No active paid subscription found to cancel'
      });
    }

    if (currentSub.cancelAtPeriodEnd) {
      return res.status(400).json({
        success: false,
        error: 'Subscription is already scheduled for cancellation at the end of the billing period'
      });
    }

    await BillingGateway.cancelAtPeriodEnd(currentSub.gatewaySubscriptionId);

    const updatedSub = await UserSubscription.update(userId, {
      cancelAtPeriodEnd: true,
      cancellationReason: reason ? String(reason).trim() : 'User requested cancellation',
      cancelledAt: new Date()
    });

    return res.status(200).json({
      success: true,
      message: 'Subscription will be cancelled at the end of current billing cycle',
      data: {
        tier: updatedSub.tier,
        accessUntil: updatedSub.currentPeriodEnd,
        cancelAtPeriodEnd: updatedSub.cancelAtPeriodEnd
      }
    });
  } catch (error) {
    return res.status(500).json({
      success: false,
      error: 'Failed to cancel subscription',
      details: error.message
    });
  }
};
