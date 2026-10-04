import { jest } from '@jest/globals';
import {
  upgradeSubscription,
  cancelSubscription,
  UserSubscription,
  BillingGateway
} from '../dataset/12_subscription_controller.js';

describe('12_subscription_controller', () => {
  let req;
  let res;

  beforeEach(() => {
    req = {
      body: {},
      user: null
    };
    res = {
      status: jest.fn().mockReturnThis(),
      json: jest.fn().mockReturnThis()
    };
    jest.restoreAllMocks();
  });

  describe('upgradeSubscription', () => {
    test('should return 401 if userId is missing', async () => {
      req.body = { targetTier: 'pro' };

      await upgradeSubscription(req, res);

      expect(res.status).toHaveBeenCalledWith(401);
      expect(res.json).toHaveBeenCalledWith({
        success: false,
        error: 'Authentication required'
      });
    });

    test('should return 400 if targetTier is missing or invalid', async () => {
      req.user = { id: 'user1' };
      req.body = { targetTier: 'ultra' };

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
      req.user = { id: 'user1' };
      req.body = { targetTier: 'pro', billingCycle: 'weekly' };

      await upgradeSubscription(req, res);

      expect(res.status).toHaveBeenCalledWith(400);
      expect(res.json).toHaveBeenCalledWith({
        success: false,
        error: 'billingCycle must be either "monthly" or "annual"'
      });
    });

    test('should return 400 if targetTier is the same as current tier', async () => {
      req.user = { id: 'user1' };
      req.body = { targetTier: 'pro', paymentMethodId: 'pm_123' };

      jest.spyOn(UserSubscription, 'findByUserId').mockResolvedValue({ tier: 'pro' });

      await upgradeSubscription(req, res);

      expect(res.status).toHaveBeenCalledWith(400);
      expect(res.json).toHaveBeenCalledWith({
        success: false,
        error: 'User is already on the "pro" tier'
      });
    });

    test('should return 400 when attempting to downgrade tier', async () => {
      req.user = { id: 'user1' };
      req.body = { targetTier: 'starter', paymentMethodId: 'pm_123' };

      jest.spyOn(UserSubscription, 'findByUserId').mockResolvedValue({ tier: 'pro' });

      await upgradeSubscription(req, res);

      expect(res.status).toHaveBeenCalledWith(400);
      expect(res.json).toHaveBeenCalledWith({
        success: false,
        error: 'Downgrades must be processed through the tier change request workflow'
      });
    });

    test('should return 400 if paid tier is selected without paymentMethodId', async () => {
      req.user = { id: 'user1' };
      req.body = { targetTier: 'pro' };

      jest.spyOn(UserSubscription, 'findByUserId').mockResolvedValue(null);

      await upgradeSubscription(req, res);

      expect(res.status).toHaveBeenCalledWith(400);
      expect(res.json).toHaveBeenCalledWith({
        success: false,
        error: 'Payment method is required for paid tiers'
      });
    });

    test('should successfully upgrade subscription to paid tier', async () => {
      req.user = { id: 'user1', customerId: 'cust_user1' };
      req.body = {
        targetTier: 'pro',
        billingCycle: 'annual',
        paymentMethodId: 'pm_card_valid'
      };

      const mockPeriodEnd = new Date();
      jest.spyOn(UserSubscription, 'findByUserId').mockResolvedValue({ tier: 'free' });
      jest.spyOn(BillingGateway, 'createOrUpdateSubscription').mockResolvedValue({
        subscriptionId: 'sub_stripe_123',
        status: 'active',
        currentPeriodEnd: mockPeriodEnd
      });
      jest.spyOn(UserSubscription, 'update').mockResolvedValue({
        userId: 'user1',
        tier: 'pro',
        billingCycle: 'annual',
        status: 'active',
        gatewaySubscriptionId: 'sub_stripe_123',
        currentPeriodEnd: mockPeriodEnd,
        cancelAtPeriodEnd: false
      });

      await upgradeSubscription(req, res);

      expect(BillingGateway.createOrUpdateSubscription).toHaveBeenCalledWith({
        customerId: 'cust_user1',
        planId: 'pro_annual',
        paymentMethodId: 'pm_card_valid'
      });
      expect(UserSubscription.update).toHaveBeenCalledWith('user1', {
        tier: 'pro',
        billingCycle: 'annual',
        status: 'active',
        gatewaySubscriptionId: 'sub_stripe_123',
        currentPeriodEnd: mockPeriodEnd,
        cancelAtPeriodEnd: false
      });
      expect(res.status).toHaveBeenCalledWith(200);
      expect(res.json).toHaveBeenCalledWith({
        success: true,
        message: 'Successfully upgraded subscription to pro',
        data: expect.objectContaining({ tier: 'pro', status: 'active' })
      });
    });

    test('should handle fallback customerId and default free tier when no subscription exists', async () => {
      req.body = {
        userId: 'user2',
        targetTier: 'free'
      };

      jest.spyOn(UserSubscription, 'findByUserId').mockResolvedValue(null);
      jest.spyOn(BillingGateway, 'createOrUpdateSubscription').mockResolvedValue({
        subscriptionId: 'sub_stripe_free',
        status: 'active',
        currentPeriodEnd: new Date()
      });
      jest.spyOn(UserSubscription, 'update').mockImplementation(async (userId, data) => ({ userId, ...data }));

      await upgradeSubscription(req, res);

      expect(BillingGateway.createOrUpdateSubscription).toHaveBeenCalledWith({
        customerId: 'cust_user2',
        planId: 'free_monthly',
        paymentMethodId: undefined
      });
      expect(res.status).toHaveBeenCalledWith(200);
    });

    test('should return 500 if an error is thrown', async () => {
      req.user = { id: 'user1' };
      req.body = { targetTier: 'pro', paymentMethodId: 'pm_123' };

      jest.spyOn(UserSubscription, 'findByUserId').mockRejectedValue(new Error('Database Connection Error'));

      await upgradeSubscription(req, res);

      expect(res.status).toHaveBeenCalledWith(500);
      expect(res.json).toHaveBeenCalledWith({
        success: false,
        error: 'Failed to process subscription upgrade',
        details: 'Database Connection Error'
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

    test('should return 404 if user has no subscription record', async () => {
      req.user = { id: 'user1' };

      jest.spyOn(UserSubscription, 'findByUserId').mockResolvedValue(null);

      await cancelSubscription(req, res);

      expect(res.status).toHaveBeenCalledWith(404);
      expect(res.json).toHaveBeenCalledWith({
        success: false,
        error: 'No active paid subscription found to cancel'
      });
    });

    test('should return 404 if user is on free tier', async () => {
      req.user = { id: 'user1' };

      jest.spyOn(UserSubscription, 'findByUserId').mockResolvedValue({ tier: 'free' });

      await cancelSubscription(req, res);

      expect(res.status).toHaveBeenCalledWith(404);
      expect(res.json).toHaveBeenCalledWith({
        success: false,
        error: 'No active paid subscription found to cancel'
      });
    });

    test('should return 400 if subscription is already scheduled for cancellation', async () => {
      req.user = { id: 'user1' };

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

    test('should successfully cancel subscription with provided reason', async () => {
      req.user = { id: 'user1' };
      req.body = { reason: '  Too expensive  ' };

      const currentPeriodEnd = new Date();
      jest.spyOn(UserSubscription, 'findByUserId').mockResolvedValue({
        tier: 'enterprise',
        gatewaySubscriptionId: 'sub_gateway_999',
        cancelAtPeriodEnd: false,
        currentPeriodEnd
      });
      jest.spyOn(BillingGateway, 'cancelAtPeriodEnd').mockResolvedValue({
        subscriptionId: 'sub_gateway_999',
        cancelAtPeriodEnd: true
      });
      jest.spyOn(UserSubscription, 'update').mockResolvedValue({
        userId: 'user1',
        tier: 'enterprise',
        cancelAtPeriodEnd: true,
        cancellationReason: 'Too expensive',
        currentPeriodEnd
      });

      await cancelSubscription(req, res);

      expect(BillingGateway.cancelAtPeriodEnd).toHaveBeenCalledWith('sub_gateway_999');
      expect(UserSubscription.update).toHaveBeenCalledWith('user1', {
        cancelAtPeriodEnd: true,
        cancellationReason: 'Too expensive',
        cancelledAt: expect.any(Date)
      });
      expect(res.status).toHaveBeenCalledWith(200);
      expect(res.json).toHaveBeenCalledWith({
        success: true,
        message: 'Subscription will be cancelled at the end of current billing cycle',
        data: {
          tier: 'enterprise',
          accessUntil: currentPeriodEnd,
          cancelAtPeriodEnd: true
        }
      });
    });

    test('should successfully cancel subscription using default reason when none is provided', async () => {
      req.body = { userId: 'user2' };

      jest.spyOn(UserSubscription, 'findByUserId').mockResolvedValue({
        tier: 'starter',
        gatewaySubscriptionId: 'sub_gateway_888',
        cancelAtPeriodEnd: false
      });
      jest.spyOn(BillingGateway, 'cancelAtPeriodEnd').mockResolvedValue({});
      jest.spyOn(UserSubscription, 'update').mockImplementation(async (id, data) => ({
        userId: id,
        tier: 'starter',
        ...data
      }));

      await cancelSubscription(req, res);

      expect(UserSubscription.update).toHaveBeenCalledWith('user2', expect.objectContaining({
        cancellationReason: 'User requested cancellation'
      }));
      expect(res.status).toHaveBeenCalledWith(200);
    });

    test('should return 500 if an error occurs during cancellation', async () => {
      req.user = { id: 'user1' };

      jest.spyOn(UserSubscription, 'findByUserId').mockRejectedValue(new Error('Gateway failure'));

      await cancelSubscription(req, res);

      expect(res.status).toHaveBeenCalledWith(500);
      expect(res.json).toHaveBeenCalledWith({
        success: false,
        error: 'Failed to cancel subscription',
        details: 'Gateway failure'
      });
    });
  });
});