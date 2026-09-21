import { jest } from '@jest/globals';
import {
  upgradeSubscription,
  cancelSubscription,
  UserSubscription,
  BillingGateway
} from '../dataset/12_subscription_controller.js';

const mockRes = () => {
  const res = {};
  res.status = jest.fn().mockReturnValue(res);
  res.json = jest.fn().mockReturnValue(res);
  return res;
};

describe('upgradeSubscription', () => {
  const originalFind = UserSubscription.findByUserId;
  const originalUpdate = UserSubscription.update;
  const originalCreateOrUpdate = BillingGateway.createOrUpdateSubscription;

  afterEach(() => {
    jest.restoreAllMocks();
    UserSubscription.findByUserId = originalFind;
    UserSubscription.update = originalUpdate;
    BillingGateway.createOrUpdateSubscription = originalCreateOrUpdate;
  });

  test('returns 401 when user is not authenticated', async () => {
    const req = { body: {} };
    const res = mockRes();

    await upgradeSubscription(req, res);

    expect(res.status).toHaveBeenCalledWith(401);
    expect(res.json).toHaveBeenCalledWith({
      success: false,
      error: 'Authentication required'
    });
  });

  test('returns 400 for invalid tier', async () => {
    const req = {
      user: { id: 'u1' },
      body: { targetTier: 'invalid' }
    };
    const res = mockRes();

    await upgradeSubscription(req, res);

    expect(res.status).toHaveBeenCalledWith(400);
    expect(res.json).toHaveBeenCalledWith({
      success: false,
      error: expect.stringContaining('Invalid tier')
    });
  });

  test('returns 400 for invalid billingCycle', async () => {
    const req = {
      user: { id: 'u1' },
      body: { targetTier: 'pro', billingCycle: 'weekly', paymentMethodId: 'pm_1' }
    };
    const res = mockRes();

    await upgradeSubscription(req, res);

    expect(res.status).toHaveBeenCalledWith(400);
    expect(res.json).toHaveBeenCalledWith({
      success: false,
      error: 'billingCycle must be either "monthly" or "annual"'
    });
  });

  test('returns 400 when user is already on target tier', async () => {
    jest.spyOn(UserSubscription, 'findByUserId').mockResolvedValue({ tier: 'pro' });

    const req = {
      user: { id: 'u1' },
      body: { targetTier: 'pro', billingCycle: 'monthly', paymentMethodId: 'pm_1' }
    };
    const res = mockRes();

    await upgradeSubscription(req, res);

    expect(res.status).toHaveBeenCalledWith(400);
    expect(res.json).toHaveBeenCalledWith({
      success: false,
      error: 'User is already on the "pro" tier'
    });
  });

  test('returns 400 when attempting a downgrade', async () => {
    jest.spyOn(UserSubscription, 'findByUserId').mockResolvedValue({ tier: 'enterprise' });

    const req = {
      user: { id: 'u1' },
      body: { targetTier: 'starter', billingCycle: 'monthly', paymentMethodId: 'pm_1' }
    };
    const res = mockRes();

    await upgradeSubscription(req, res);

    expect(res.status).toHaveBeenCalledWith(400);
    expect(res.json).toHaveBeenCalledWith({
      success: false,
      error: 'Downgrades must be processed through the tier change request workflow'
    });
  });

  test('returns 400 when paymentMethodId missing for paid tier', async () => {
    jest.spyOn(UserSubscription, 'findByUserId').mockResolvedValue({ tier: 'free' });

    const req = {
      user: { id: 'u1' },
      body: { targetTier: 'starter', billingCycle: 'monthly' }
    };
    const res = mockRes();

    await upgradeSubscription(req, res);

    expect(res.status).toHaveBeenCalledWith(400);
    expect(res.json).toHaveBeenCalledWith({
      success: false,
      error: 'Payment method is required for paid tiers'
    });
  });

  test('successful upgrade returns 200 with updated subscription', async () => {
    const fakeGatewayResp = {
      subscriptionId: 'sub_stripe_123',
      status: 'active',
      currentPeriodEnd: new Date('2099-12-31')
    };
    jest.spyOn(UserSubscription, 'findByUserId').mockResolvedValue({ tier: 'free' });
    jest.spyOn(BillingGateway, 'createOrUpdateSubscription').mockResolvedValue(fakeGatewayResp);
    jest.spyOn(UserSubscription, 'update').mockImplementation(async (userId, data) => ({
      userId,
      ...data,
      updatedAt: new Date()
    }));

    const req = {
      user: { id: 'u1', customerId: 'cust_1' },
      body: { targetTier: 'starter', billingCycle: 'annual', paymentMethodId: 'pm_1' }
    };
    const res = mockRes();

    await upgradeSubscription(req, res);

    expect(BillingGateway.createOrUpdateSubscription).toHaveBeenCalledWith({
      customerId: 'cust_1',
      planId: 'starter_annual',
      paymentMethodId: 'pm_1'
    });
    expect(UserSubscription.update).toHaveBeenCalledWith('u1', {
      tier: 'starter',
      billingCycle: 'annual',
      status: 'active',
      gatewaySubscriptionId: 'sub_stripe_123',
      currentPeriodEnd: fakeGatewayResp.currentPeriodEnd,
      cancelAtPeriodEnd: false
    });
    expect(res.status).toHaveBeenCalledWith(200);
    const jsonArg = res.json.mock.calls[0][0];
    expect(jsonArg).toMatchObject({
      success: true,
      message: 'Successfully upgraded subscription to starter',
      data: expect.objectContaining({ userId: 'u1', tier: 'starter' })
    });
  });

  test('catches unexpected errors and returns 500', async () => {
    const err = new Error('DB failure');
    jest.spyOn(UserSubscription, 'findByUserId').mockRejectedValue(err);

    const req = {
      user: { id: 'u1' },
      body: { targetTier: 'starter', billingCycle: 'monthly', paymentMethodId: 'pm_1' }
    };
    const res = mockRes();

    await upgradeSubscription(req, res);

    expect(res.status).toHaveBeenCalledWith(500);
    expect(res.json).toHaveBeenCalledWith({
      success: false,
      error: 'Failed to process subscription upgrade',
      details: 'DB failure'
    });
  });
});

describe('cancelSubscription', () => {
  const originalFind = UserSubscription.findByUserId;
  const originalUpdate = UserSubscription.update;
  const originalCancel = BillingGateway.cancelAtPeriodEnd;

  afterEach(() => {
    jest.restoreAllMocks();
    UserSubscription.findByUserId = originalFind;
    UserSubscription.update = originalUpdate;
    BillingGateway.cancelAtPeriodEnd = originalCancel;
  });

  test('returns 401 when not authenticated', async () => {
    const req = { body: {} };
    const res = mockRes();

    await cancelSubscription(req, res);

    expect(res.status).toHaveBeenCalledWith(401);
    expect(res.json).toHaveBeenCalledWith({
      success: false,
      error: 'Authentication required'
    });
  });

  test('returns 404 when no active paid subscription exists', async () => {
    jest.spyOn(UserSubscription, 'findByUserId').mockResolvedValue({ tier: 'free' });

    const req = { user: { id: 'u2' }, body: {} };
    const res = mockRes();

    await cancelSubscription(req, res);

    expect(res.status).toHaveBeenCalledWith(404);
    expect(res.json).toHaveBeenCalledWith({
      success: false,
      error: 'No active paid subscription found to cancel'
    });
  });

  test('returns 400 when already scheduled for cancellation', async () => {
    jest.spyOn(UserSubscription, 'findByUserId').mockResolvedValue({
      tier: 'pro',
      cancelAtPeriodEnd: true
    });

    const req = { user: { id: 'u3' }, body: {} };
    const res = mockRes();

    await cancelSubscription(req, res);

    expect(res.status).toHaveBeenCalledWith(400);
    expect(res.json).toHaveBeenCalledWith({
      success: false,
      error: 'Subscription is already scheduled for cancellation at the end of the billing period'
    });
  });

  test('successful cancellation returns 200 with updated data', async () => {
    const currentSub = {
      tier: 'pro',
      gatewaySubscriptionId: 'sub_stripe_999',
      cancelAtPeriodEnd: false,
      currentPeriodEnd: new Date('2099-06-30')
    };
    jest.spyOn(UserSubscription, 'findByUserId').mockResolvedValue(currentSub);
    jest.spyOn(BillingGateway, 'cancelAtPeriodEnd').mockResolvedValue({
      subscriptionId: 'sub_stripe_999',
      cancelAtPeriodEnd: true
    });
    jest.spyOn(UserSubscription, 'update').mockImplementation(async (userId, data) => ({
      ...currentSub,
      ...data,
      updatedAt: new Date()
    }));

    const req = { user: { id: 'u4' }, body: { reason: 'No longer needed' } };
    const res = mockRes();

    await cancelSubscription(req, res);

    expect(BillingGateway.cancelAtPeriodEnd).toHaveBeenCalledWith('sub_stripe_999');
    expect(UserSubscription.update).toHaveBeenCalledWith('u4', expect.objectContaining({
      cancelAtPeriodEnd: true,
      cancellationReason: 'No longer needed'
    }));
    expect(res.status).toHaveBeenCalledWith(200);
    const jsonArg = res.json.mock.calls[0][0];
    expect(jsonArg).toMatchObject({
      success: true,
      message: 'Subscription will be cancelled at the end of current billing cycle',
      data: expect.objectContaining({
        tier: 'pro',
        accessUntil: currentSub.currentPeriodEnd,
        cancelAtPeriodEnd: true
      })
    });
  });

  test('catches errors and returns 500', async () => {
    const err = new Error('Gateway down');
    jest.spyOn(UserSubscription, 'findByUserId').mockResolvedValue({
      tier: 'starter',
      gatewaySubscriptionId: 'sub_abc',
      cancelAtPeriodEnd: false,
      currentPeriodEnd: new Date()
    });
    jest.spyOn(BillingGateway, 'cancelAtPeriodEnd').mockRejectedValue(err);

    const req = { user: { id: 'u5' }, body: {} };
    const res = mockRes();

    await cancelSubscription(req, res);

    expect(res.status).toHaveBeenCalledWith(500);
    expect(res.json).toHaveBeenCalledWith({
      success: false,
      error: 'Failed to cancel subscription',
      details: 'Gateway down'
    });
  });
});