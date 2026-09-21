import { jest } from '@jest/globals';
import {
  upgradeSubscription,
  cancelSubscription,
  UserSubscription,
  BillingGateway
} from '../dataset/12_subscription_controller.js';

describe('Subscription Controller', () => {
  let req;
  let res;

  beforeEach(() => {
    req = {
      user: null,
      body: {}
    };
    res = {
      status: jest.fn().mockReturnThis(),
      json: jest.fn().mockReturnThis()
    };
  });

  afterEach(() => {
    jest.restoreAllMocks();
  });

  describe('upgradeSubscription', () => {
    test('should return 401 if user ID is missing from req.user and req.body', async () => {
      req.user = null;
      req.body = {};

      await upgradeSubscription(req, res);

      expect(res.status).toHaveBeenCalledWith(401);
      expect(res.json).toHaveBeenCalledWith({
        success: false,
        error: 'Authentication required'
      });
    });

    test('should return 400 if targetTier is missing or invalid', async () => {
      req.user = { id: 'user_123' };
      req.body = { targetTier: 'invalid_tier' };

      await upgradeSubscription(req, res);

      expect(res.status).toHaveBeenCalledWith(400);
      expect(res.json).toHaveBeenCalledWith({
        success: false,
        error: 'Invalid tier. Available tiers: free, starter, pro, enterprise'
      });
    });

    test('should return 400 if billingCycle is invalid', async () => {
      req.user = { id: 'user_123' };
      req.body = { targetTier: 'pro', billingCycle: 'weekly' };

      await upgradeSubscription(req, res);

      expect(res.status).toHaveBeenCalledWith(400);
      expect(res.json).toHaveBeenCalledWith({
        success: false,
        error: 'billingCycle must be either "monthly" or "annual"'
      });
    });

    test('should return 400 if user tries to upgrade to the same tier', async () => {
      req.user = { id: 'user_123' };
      req.body = { targetTier: 'pro', paymentMethodId: 'pm_123' };

      jest.spyOn(UserSubscription, 'findByUserId').mockResolvedValue({
        userId: 'user_123',
        tier: 'pro'
      });

      await upgradeSubscription(req, res);

      expect(res.status).toHaveBeenCalledWith(400);
      expect(res.json).toHaveBeenCalledWith({
        success: false,
        error: 'User is already on the "pro" tier'
      });
    });

    test('should return 400 if user tries to downgrade tier', async () => {
      req.user = { id: 'user_123' };
      req.body = { targetTier: 'starter', paymentMethodId: 'pm_123' };

      jest.spyOn(UserSubscription, 'findByUserId').mockResolvedValue({
        userId: 'user_123',
        tier: 'pro'
      });

      await upgradeSubscription(req, res);

      expect(res.status).toHaveBeenCalledWith(400);
      expect(res.json).toHaveBeenCalledWith({
        success: false,
        error: 'Downgrades must be processed through the tier change request workflow'
      });
    });

    test('should return 400 if upgrading to paid tier without paymentMethodId', async () => {
      req.user = { id: 'user_123' };
      req.body = { targetTier: 'pro' };

      jest.spyOn(UserSubscription, 'findByUserId').mockResolvedValue({
        userId: 'user_123',
        tier: 'free'
      });

      await upgradeSubscription(req, res);

      expect(res.status).toHaveBeenCalledWith(400);
      expect(res.json).toHaveBeenCalledWith({
        success: false,
        error: 'Payment method is required for paid tiers'
      });
    });

    test('should successfully upgrade subscription for paid tier', async () => {
      req.user = { id: 'user_123', customerId: 'cust_stripe_123' };
      req.body = {
        targetTier: 'pro',
        billingCycle: 'annual',
        paymentMethodId: 'pm_card_visa'
      };

      const periodEnd = new Date(Date.now() + 365 * 24 * 60 * 60 * 1000);

      jest.spyOn(UserSubscription, 'findByUserId').mockResolvedValue({
        userId: 'user_123',
        tier: 'free'
      });

      jest.spyOn(BillingGateway, 'createOrUpdateSubscription').mockResolvedValue({
        subscriptionId: 'sub_12345',
        status: 'active',
        currentPeriodEnd: periodEnd
      });

      const mockUpdatedSub = {
        userId: 'user_123',
        tier: 'pro',
        billingCycle: 'annual',
        status: 'active',
        gatewaySubscriptionId: 'sub_12345',
        currentPeriodEnd: periodEnd,
        cancelAtPeriodEnd: false
      };

      jest.spyOn(UserSubscription, 'update').mockResolvedValue(mockUpdatedSub);

      await upgradeSubscription(req, res);

      expect(BillingGateway.createOrUpdateSubscription).toHaveBeenCalledWith({
        customerId: 'cust_stripe_123',
        planId: 'pro_annual',
        paymentMethodId: 'pm_card_visa'
      });

      expect(UserSubscription.update).toHaveBeenCalledWith('user_123', {
        tier: 'pro',
        billingCycle: 'annual',
        status: 'active',
        gatewaySubscriptionId: 'sub_12345',
        currentPeriodEnd: periodEnd,
        cancelAtPeriodEnd: false
      });

      expect(res.status).toHaveBeenCalledWith(200);
      expect(res.json).toHaveBeenCalledWith({
        success: true,
        message: 'Successfully upgraded subscription to pro',
        data: mockUpdatedSub
      });
    });

    test('should fallback to body userId and default customerId if user object is not present', async () => {
      req.user = null;
      req.body = {
        userId: 'user_456',
        targetTier: 'starter',
        paymentMethodId: 'pm_456'
      };

      jest.spyOn(UserSubscription, 'findByUserId').mockResolvedValue(null);
      jest.spyOn(BillingGateway, 'createOrUpdateSubscription').mockResolvedValue({
        subscriptionId: 'sub_456',
        status: 'active',
        currentPeriodEnd: new Date()
      });
      jest.spyOn(UserSubscription, 'update').mockResolvedValue({});

      await upgradeSubscription(req, res);

      expect(BillingGateway.createOrUpdateSubscription).toHaveBeenCalledWith({
        customerId: 'cust_user_456',
        planId: 'starter_monthly',
        paymentMethodId: 'pm_456'
      });
      expect(res.status).toHaveBeenCalledWith(200);
    });

    test('should return 500 when gateway or database throws an exception', async () => {
      req.user = { id: 'user_123' };
      req.body = { targetTier: 'pro', paymentMethodId: 'pm_123' };

      jest.spyOn(UserSubscription, 'findByUserId').mockRejectedValue(new Error('Database error'));

      await upgradeSubscription(req, res);

      expect(res.status).toHaveBeenCalledWith(500);
      expect(res.json).toHaveBeenCalledWith({
        success: false,
        error: 'Failed to process subscription upgrade',
        details: 'Database error'
      });
    });
  });

  describe('cancelSubscription', () => {
    test('should return 401 if user ID is missing', async () => {
      req.user = null;
      req.body = {};

      await cancelSubscription(req, res);

      expect(res.status).toHaveBeenCalledWith(401);
      expect(res.json).toHaveBeenCalledWith({
        success: false,
        error: 'Authentication required'
      });
    });

    test('should return 404 if no subscription is found or tier is free', async () => {
      req.user = { id: 'user_123' };

      jest.spyOn(UserSubscription, 'findByUserId').mockResolvedValue(null);

      await cancelSubscription(req, res);

      expect(res.status).toHaveBeenCalledWith(404);
      expect(res.json).toHaveBeenCalledWith({
        success: false,
        error: 'No active paid subscription found to cancel'
      });
    });

    test('should return 404 if current tier is free', async () => {
      req.user = { id: 'user_123' };

      jest.spyOn(UserSubscription, 'findByUserId').mockResolvedValue({
        userId: 'user_123',
        tier: 'free'
      });

      await cancelSubscription(req, res);

      expect(res.status).toHaveBeenCalledWith(404);
      expect(res.json).toHaveBeenCalledWith({
        success: false,
        error: 'No active paid subscription found to cancel'
      });
    });

    test('should return 400 if subscription is already scheduled for cancellation', async () => {
      req.user = { id: 'user_123' };

      jest.spyOn(UserSubscription, 'findByUserId').mockResolvedValue({
        userId: 'user_123',
        tier: 'pro',
        cancelAtPeriodEnd: true
      });

      await cancelSubscription(req, res);

      expect(res.status).toHaveBeenCalledWith(400);
      expect(res.json).toHaveBeenCalledWith({
        success: false,
        error: 'Subscription is already scheduled for cancellation at the end of the billing period'
      });
    });

    test('should successfully schedule subscription cancellation with custom reason', async () => {
      req.user = { id: 'user_123' };
      req.body = { reason: ' Too expensive ' };

      const currentPeriodEnd = new Date();

      jest.spyOn(UserSubscription, 'findByUserId').mockResolvedValue({
        userId: 'user_123',
        tier: 'pro',
        gatewaySubscriptionId: 'sub_pro_123',
        cancelAtPeriodEnd: false
      });

      jest.spyOn(BillingGateway, 'cancelAtPeriodEnd').mockResolvedValue({
        subscriptionId: 'sub_pro_123',
        cancelAtPeriodEnd: true
      });

      const updatedSub = {
        tier: 'pro',
        currentPeriodEnd,
        cancelAtPeriodEnd: true,
        cancellationReason: 'Too expensive'
      };

      jest.spyOn(UserSubscription, 'update').mockResolvedValue(updatedSub);

      await cancelSubscription(req, res);

      expect(BillingGateway.cancelAtPeriodEnd).toHaveBeenCalledWith('sub_pro_123');
      expect(UserSubscription.update).toHaveBeenCalledWith('user_123', expect.objectContaining({
        cancelAtPeriodEnd: true,
        cancellationReason: 'Too expensive'
      }));

      expect(res.status).toHaveBeenCalledWith(200);
      expect(res.json).toHaveBeenCalledWith({
        success: true,
        message: 'Subscription will be cancelled at the end of current billing cycle',
        data: {
          tier: 'pro',
          accessUntil: currentPeriodEnd,
          cancelAtPeriodEnd: true
        }
      });
    });

    test('should default cancellation reason if not provided', async () => {
      req.user = { id: 'user_123' };
      req.body = {};

      jest.spyOn(UserSubscription, 'findByUserId').mockResolvedValue({
        userId: 'user_123',
        tier: 'pro',
        gatewaySubscriptionId: 'sub_pro_123',
        cancelAtPeriodEnd: false
      });

      jest.spyOn(BillingGateway, 'cancelAtPeriodEnd').mockResolvedValue({});
      jest.spyOn(UserSubscription, 'update').mockResolvedValue({
        tier: 'pro',
        currentPeriodEnd: new Date(),
        cancelAtPeriodEnd: true
      });

      await cancelSubscription(req, res);

      expect(UserSubscription.update).toHaveBeenCalledWith('user_123', expect.objectContaining({
        cancellationReason: 'User requested cancellation'
      }));
      expect(res.status).toHaveBeenCalledWith(200);
    });

    test('should return 500 when cancellation fails with error', async () => {
      req.user = { id: 'user_123' };

      jest.spyOn(UserSubscription, 'findByUserId').mockResolvedValue({
        userId: 'user_123',
        tier: 'pro',
        gatewaySubscriptionId: 'sub_pro_123',
        cancelAtPeriodEnd: false
      });

      jest.spyOn(BillingGateway, 'cancelAtPeriodEnd').mockRejectedValue(new Error('Gateway timeout'));

      await cancelSubscription(req, res);

      expect(res.status).toHaveBeenCalledWith(500);
      expect(res.json).toHaveBeenCalledWith({
        success: false,
        error: 'Failed to cancel subscription',
        details: 'Gateway timeout'
      });
    });
  });
});