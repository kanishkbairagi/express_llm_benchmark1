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
    req = { user: null, body: null };
    res = {
      status: jest.fn().mockReturnThis(),
      json: jest.fn().mockReturnThis()
    };
    jest.restoreAllMocks();
  });

  describe('upgradeSubscription', () => {
    test('should return 401 if no userId is provided in user or body', async () => {
      req.body = {};
      await upgradeSubscription(req, res);

      expect(res.status).toHaveBeenCalledWith(401);
      expect(res.json).toHaveBeenCalledWith({
        success: false,
        error: 'Authentication required'
      });
    });

    test('should return 400 if targetTier is missing or invalid', async () => {
      req.user = { id: 'user_1' };
      req.body = { targetTier: 'super_pro' };

      await upgradeSubscription(req, res);

      expect(res.status).toHaveBeenCalledWith(400);
      expect(res.json).toHaveBeenCalledWith(
        expect.objectContaining({
          success: false,
          error: expect.stringContaining('Invalid tier')
        })
      );
    });

    test('should return 400 if billingCycle is invalid', async () => {
      req.user = { id: 'user_1' };
      req.body = { targetTier: 'pro', billingCycle: 'weekly' };

      await upgradeSubscription(req, res);

      expect(res.status).toHaveBeenCalledWith(400);
      expect(res.json).toHaveBeenCalledWith({
        success: false,
        error: 'billingCycle must be either "monthly" or "annual"'
      });
    });

    test('should return 400 if user is already on the requested target tier', async () => {
      req.user = { id: 'user_1' };
      req.body = { targetTier: 'pro', paymentMethodId: 'pm_123' };

      jest.spyOn(UserSubscription, 'findByUserId').mockResolvedValue({
        userId: 'user_1',
        tier: 'pro'
      });

      await upgradeSubscription(req, res);

      expect(res.status).toHaveBeenCalledWith(400);
      expect(res.json).toHaveBeenCalledWith({
        success: false,
        error: 'User is already on the "pro" tier'
      });
    });

    test('should return 400 if target tier is lower than current tier (downgrade)', async () => {
      req.user = { id: 'user_1' };
      req.body = { targetTier: 'starter', paymentMethodId: 'pm_123' };

      jest.spyOn(UserSubscription, 'findByUserId').mockResolvedValue({
        userId: 'user_1',
        tier: 'pro'
      });

      await upgradeSubscription(req, res);

      expect(res.status).toHaveBeenCalledWith(400);
      expect(res.json).toHaveBeenCalledWith({
        success: false,
        error: 'Downgrades must be processed through the tier change request workflow'
      });
    });

    test('should return 400 if paid tier is requested without paymentMethodId', async () => {
      req.user = { id: 'user_1' };
      req.body = { targetTier: 'starter' };

      jest.spyOn(UserSubscription, 'findByUserId').mockResolvedValue(null);

      await upgradeSubscription(req, res);

      expect(res.status).toHaveBeenCalledWith(400);
      expect(res.json).toHaveBeenCalledWith({
        success: false,
        error: 'Payment method is required for paid tiers'
      });
    });

    test('should successfully upgrade subscription with explicit customerId and custom billingCycle', async () => {
      req.user = { id: 'user_1', customerId: 'cust_stripe_123' };
      req.body = { targetTier: 'pro', billingCycle: 'annual', paymentMethodId: 'pm_999' };

      const periodEnd = new Date();
      jest.spyOn(UserSubscription, 'findByUserId').mockResolvedValue({
        userId: 'user_1',
        tier: 'starter'
      });

      const gatewaySpy = jest.spyOn(BillingGateway, 'createOrUpdateSubscription').mockResolvedValue({
        subscriptionId: 'sub_stripe_123',
        status: 'active',
        currentPeriodEnd: periodEnd
      });

      const updateSpy = jest.spyOn(UserSubscription, 'update').mockImplementation(async (id, data) => ({
        userId: id,
        ...data,
        updatedAt: new Date()
      }));

      await upgradeSubscription(req, res);

      expect(gatewaySpy).toHaveBeenCalledWith({
        customerId: 'cust_stripe_123',
        planId: 'pro_annual',
        paymentMethodId: 'pm_999'
      });

      expect(updateSpy).toHaveBeenCalledWith('user_1', {
        tier: 'pro',
        billingCycle: 'annual',
        status: 'active',
        gatewaySubscriptionId: 'sub_stripe_123',
        currentPeriodEnd: periodEnd,
        cancelAtPeriodEnd: false
      });

      expect(res.status).toHaveBeenCalledWith(200);
      expect(res.json).toHaveBeenCalledWith({
        success: true,
        message: 'Successfully upgraded subscription to pro',
        data: expect.objectContaining({
          userId: 'user_1',
          tier: 'pro',
          billingCycle: 'annual'
        })
      });
    });

    test('should successfully upgrade using fallback customerId and default monthly billingCycle when free tier', async () => {
      req.body = { userId: 'user_2', targetTier: 'free' };

      jest.spyOn(UserSubscription, 'findByUserId').mockResolvedValue(null);

      const gatewaySpy = jest.spyOn(BillingGateway, 'createOrUpdateSubscription').mockResolvedValue({
        subscriptionId: 'sub_free',
        status: 'active',
        currentPeriodEnd: new Date()
      });

      await upgradeSubscription(req, res);

      expect(gatewaySpy).toHaveBeenCalledWith({
        customerId: 'cust_user_2',
        planId: 'free_monthly',
        paymentMethodId: undefined
      });

      expect(res.status).toHaveBeenCalledWith(200);
    });

    test('should return 500 if database or gateway throws an exception', async () => {
      req.user = { id: 'user_1' };
      req.body = { targetTier: 'pro', paymentMethodId: 'pm_123' };

      jest.spyOn(UserSubscription, 'findByUserId').mockRejectedValue(new Error('Database connection failed'));

      await upgradeSubscription(req, res);

      expect(res.status).toHaveBeenCalledWith(500);
      expect(res.json).toHaveBeenCalledWith({
        success: false,
        error: 'Failed to process subscription upgrade',
        details: 'Database connection failed'
      });
    });
  });

  describe('cancelSubscription', () => {
    test('should return 401 if userId is missing', async () => {
      req.body = {};
      await cancelSubscription(req, res);

      expect(res.status).toHaveBeenCalledWith(401);
      expect(res.json).toHaveBeenCalledWith({
        success: false,
        error: 'Authentication required'
      });
    });

    test('should return 404 if subscription is missing or on free tier', async () => {
      req.user = { id: 'user_1' };
      jest.spyOn(UserSubscription, 'findByUserId').mockResolvedValue({ tier: 'free' });

      await cancelSubscription(req, res);

      expect(res.status).toHaveBeenCalledWith(404);
      expect(res.json).toHaveBeenCalledWith({
        success: false,
        error: 'No active paid subscription found to cancel'
      });
    });

    test('should return 400 if subscription is already scheduled for cancellation', async () => {
      req.user = { id: 'user_1' };
      jest.spyOn(UserSubscription, 'findByUserId').mockResolvedValue({
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

    test('should successfully cancel subscription with provided custom reason', async () => {
      req.user = { id: 'user_1' };
      req.body = { reason: '  Too expensive  ' };

      const periodEnd = new Date();
      jest.spyOn(UserSubscription, 'findByUserId').mockResolvedValue({
        userId: 'user_1',
        tier: 'pro',
        gatewaySubscriptionId: 'sub_123',
        cancelAtPeriodEnd: false,
        currentPeriodEnd: periodEnd
      });

      const cancelSpy = jest.spyOn(BillingGateway, 'cancelAtPeriodEnd').mockResolvedValue({});
      const updateSpy = jest.spyOn(UserSubscription, 'update').mockImplementation(async (id, data) => ({
        userId: id,
        tier: 'pro',
        currentPeriodEnd: periodEnd,
        ...data
      }));

      await cancelSubscription(req, res);

      expect(cancelSpy).toHaveBeenCalledWith('sub_123');
      expect(updateSpy).toHaveBeenCalledWith('user_1', {
        cancelAtPeriodEnd: true,
        cancellationReason: 'Too expensive',
        cancelledAt: expect.any(Date)
      });

      expect(res.status).toHaveBeenCalledWith(200);
      expect(res.json).toHaveBeenCalledWith({
        success: true,
        message: 'Subscription will be cancelled at the end of current billing cycle',
        data: {
          tier: 'pro',
          accessUntil: periodEnd,
          cancelAtPeriodEnd: true
        }
      });
    });

    test('should successfully cancel subscription with default reason when no reason provided', async () => {
      req.user = { id: 'user_1' };
      req.body = {};

      jest.spyOn(UserSubscription, 'findByUserId').mockResolvedValue({
        userId: 'user_1',
        tier: 'enterprise',
        gatewaySubscriptionId: 'sub_456',
        cancelAtPeriodEnd: false
      });

      jest.spyOn(BillingGateway, 'cancelAtPeriodEnd').mockResolvedValue({});
      const updateSpy = jest.spyOn(UserSubscription, 'update').mockResolvedValue({
        tier: 'enterprise',
        currentPeriodEnd: new Date(),
        cancelAtPeriodEnd: true
      });

      await cancelSubscription(req, res);

      expect(updateSpy).toHaveBeenCalledWith('user_1', expect.objectContaining({
        cancellationReason: 'User requested cancellation'
      }));
      expect(res.status).toHaveBeenCalledWith(200);
    });

    test('should return 500 if an error occurs during cancellation', async () => {
      req.user = { id: 'user_1' };
      jest.spyOn(UserSubscription, 'findByUserId').mockResolvedValue({
        tier: 'pro',
        gatewaySubscriptionId: 'sub_err'
      });

      jest.spyOn(BillingGateway, 'cancelAtPeriodEnd').mockRejectedValue(new Error('Gateway error'));

      await cancelSubscription(req, res);

      expect(res.status).toHaveBeenCalledWith(500);
      expect(res.json).toHaveBeenCalledWith({
        success: false,
        error: 'Failed to cancel subscription',
        details: 'Gateway error'
      });
    });
  });
});