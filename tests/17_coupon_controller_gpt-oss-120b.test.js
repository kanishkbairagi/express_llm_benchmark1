import { describe, it, expect, beforeEach, jest } from '@jest/globals';
import {
  validateCoupon,
  createCoupon,
  CouponModel
} from '../dataset/17_coupon_controller.js';

const mockRes = () => {
  const res = {};
  res.status = jest.fn().mockReturnValue(res);
  res.json = jest.fn().mockReturnValue(res);
  return res;
};

beforeEach(() => {
  jest.clearAllMocks();
});

describe('validateCoupon', () => {
  it('should return 400 when coupon code is missing', async () => {
    const req = { body: {} };
    const res = mockRes();

    await validateCoupon(req, res);

    expect(res.status).toHaveBeenCalledWith(400);
    expect(res.json).toHaveBeenCalledWith({
      success: false,
      error: 'Coupon code is required'
    });
  });

  it('should return 400 when cartTotal is invalid', async () => {
    const req = { body: { code: 'TEST', cartTotal: -5 } };
    const res = mockRes();

    await validateCoupon(req, res);

    expect(res.status).toHaveBeenCalledWith(400);
    expect(res.json).toHaveBeenCalledWith({
      success: false,
      error: 'cartTotal must be a non-negative number'
    });
  });

  it('should return 404 when coupon not found', async () => {
    jest.spyOn(CouponModel, 'findByCode').mockResolvedValue(null);
    const req = { body: { code: 'UNKNOWN', cartTotal: 100 } };
    const res = mockRes();

    await validateCoupon(req, res);

    expect(CouponModel.findByCode).toHaveBeenCalledWith('UNKNOWN');
    expect(res.status).toHaveBeenCalledWith(404);
    expect(res.json).toHaveBeenCalledWith({
      success: false,
      error: 'Coupon code not found'
    });
  });

  it('should return 400 when coupon is disabled', async () => {
    const coupon = { code: 'DISABLE', isActive: false };
    jest.spyOn(CouponModel, 'findByCode').mockResolvedValue(coupon);
    const req = { body: { code: 'DISABLE', cartTotal: 100 } };
    const res = mockRes();

    await validateCoupon(req, res);

    expect(res.status).toHaveBeenCalledWith(400);
    expect(res.json).toHaveBeenCalledWith({
      success: false,
      error: 'This coupon code is currently disabled'
    });
  });

  it('should return 400 when promotion has not started', async () => {
    const future = new Date(Date.now() + 86400000).toISOString(); // +1 day
    const coupon = {
      code: 'FUTURE',
      isActive: true,
      validFrom: future
    };
    jest.spyOn(CouponModel, 'findByCode').mockResolvedValue(coupon);
    const req = { body: { code: 'FUTURE', cartTotal: 100 } };
    const res = mockRes();

    await validateCoupon(req, res);

    expect(res.status).toHaveBeenCalledWith(400);
    expect(res.json).toHaveBeenCalledWith({
      success: false,
      error: 'This coupon promotion has not started yet'
    });
  });

  it('should return 400 when coupon has expired', async () => {
    const past = new Date(Date.now() - 86400000).toISOString(); // -1 day
    const coupon = {
      code: 'EXPIRED',
      isActive: true,
      validUntil: past
    };
    jest.spyOn(CouponModel, 'findByCode').mockResolvedValue(coupon);
    const req = { body: { code: 'EXPIRED', cartTotal: 100 } };
    const res = mockRes();

    await validateCoupon(req, res);

    expect(res.status).toHaveBeenCalledWith(400);
    expect(res.json).toHaveBeenCalledWith({
      success: false,
      error: 'This coupon has expired'
    });
  });

  it('should return 400 when global usage limit reached', async () => {
    const coupon = {
      code: 'MAXED',
      isActive: true,
      currentUsage: 10,
      maxUsageLimit: 10,
      discountType: 'amount',
      discountValue: 10
    };
    jest.spyOn(CouponModel, 'findByCode').mockResolvedValue(coupon);
    const req = { body: { code: 'MAXED', cartTotal: 100 } };
    const res = mockRes();

    await validateCoupon(req, res);

    expect(res.status).toHaveBeenCalledWith(400);
    expect(res.json).toHaveBeenCalledWith({
      success: false,
      error: 'This coupon has reached its maximum global usage limit'
    });
  });

  it('should return 400 when minimum order amount not met', async () => {
    const coupon = {
      code: 'MINORDER',
      isActive: true,
      minOrderAmount: 200,
      discountType: 'amount',
      discountValue: 20
    };
    jest.spyOn(CouponModel, 'findByCode').mockResolvedValue(coupon);
    const req = { body: { code: 'MINORDER', cartTotal: 150 } };
    const res = mockRes();

    await validateCoupon(req, res);

    expect(res.status).toHaveBeenCalledWith(400);
    expect(res.json).toHaveBeenCalledWith({
      success: false,
      error: 'Minimum order amount of $200.00 required to use this coupon'
    });
  });

  it('should return 400 when per‑user limit exceeded', async () => {
    const coupon = {
      code: 'PERUSER',
      isActive: true,
      perUserLimit: 2,
      discountType: 'amount',
      discountValue: 15,
      id: 'c1'
    };
    jest.spyOn(CouponModel, 'findByCode').mockResolvedValue(coupon);
    jest.spyOn(CouponModel, 'getUserUsageCount').mockResolvedValue(2);
    const req = {
      body: { code: 'PERUSER', cartTotal: 100, userId: 'u1' },
      user: { id: 'u1' }
    };
    const res = mockRes();

    await validateCoupon(req, res);

    expect(CouponModel.getUserUsageCount).toHaveBeenCalledWith('c1', 'u1');
    expect(res.status).toHaveBeenCalledWith(400);
    expect(res.json).toHaveBeenCalledWith({
      success: false,
      error: 'You have exceeded the maximum redemptions for this coupon'
    });
  });

  it('should apply percent discount with cap correctly', async () => {
    const coupon = {
      code: 'PERCAP',
      isActive: true,
      discountType: 'percent',
      discountValue: 20, // 20%
      maxDiscountCap: 30,
      currentUsage: 0
    };
    jest.spyOn(CouponModel, 'findByCode').mockResolvedValue(coupon);
    const req = { body: { code: 'PERCAP', cartTotal: 200 } };
    const res = mockRes();

    await validateCoupon(req, res);

    expect(res.status).toHaveBeenCalledWith(200);
    expect(res.json).toHaveBeenCalledWith({
      success: true,
      data: expect.objectContaining({
        code: 'PERCAP',
        discountType: 'percent',
        discountValue: 20,
        discountAmount: 30, // capped
        originalTotal: 200,
        discountedTotal: 170
      })
    });
  });

  it('should apply amount discount correctly', async () => {
    const coupon = {
      code: 'AMOUNT',
      isActive: true,
      discountType: 'amount',
      discountValue: 25,
      currentUsage: 0
    };
    jest.spyOn(CouponModel, 'findByCode').mockResolvedValue(coupon);
    const req = { body: { code: 'AMOUNT', cartTotal: 60 } };
    const res = mockRes();

    await validateCoupon(req, res);

    expect(res.status).toHaveBeenCalledWith(200);
    expect(res.json).toHaveBeenCalledWith({
      success: true,
      data: expect.objectContaining({
        code: 'AMOUNT',
        discountType: 'amount',
        discountValue: 25,
        discountAmount: 25,
        originalTotal: 60,
        discountedTotal: 35
      })
    });
  });
});

describe('createCoupon', () => {
  it('should return 400 when code is missing', async () => {
    const req = { body: {} };
    const res = mockRes();

    await createCoupon(req, res);

    expect(res.status).toHaveBeenCalledWith(400);
    expect(res.json).toHaveBeenCalledWith({
      success: false,
      error: 'Coupon code is required'
    });
  });

  it('should return 400 for invalid code format', async () => {
    const req = { body: { code: 'ab', discountType: 'percent', discountValue: 10, validUntil: '2099-01-01' } };
    const res = mockRes();

    await createCoupon(req, res);

    expect(res.status).toHaveBeenCalledWith(400);
    expect(res.json).toHaveBeenCalledWith({
      success: false,
      error: 'Coupon code must be 3-20 uppercase alphanumeric characters'
    });
  });

  it('should return 400 for unsupported discountType', async () => {
    const req = {
      body: { code: 'NEWCOUPON', discountType: 'foo', discountValue: 10, validUntil: '2099-01-01' }
    };
    const res = mockRes();

    await createCoupon(req, res);

    expect(res.status).toHaveBeenCalledWith(400);
    expect(res.json).toHaveBeenCalledWith({
      success: false,
      error: 'discountType must be either "percent" or "amount"'
    });
  });

  it('should return 400 when discountValue is non‑positive', async () => {
    const req = {
      body: { code: 'NEWCOUPON', discountType: 'amount', discountValue: 0, validUntil: '2099-01-01' }
    };
    const res = mockRes();

    await createCoupon(req, res);

    expect(res.status).toHaveBeenCalledWith(400);
    expect(res.json).toHaveBeenCalledWith({
      success: false,
      error: 'discountValue must be a positive number'
    });
  });

  it('should return 400 when percent discount exceeds 100', async () => {
    const req = {
      body: { code: 'BIGPERCENT', discountType: 'percent', discountValue: 150, validUntil: '2099-01-01' }
    };
    const res = mockRes();

    await createCoupon(req, res);

    expect(res.status).toHaveBeenCalledWith(400);
    expect(res.json).toHaveBeenCalledWith({
      success: false,
      error: 'Percentage discount cannot exceed 100%'
    });
  });

  it('should return 400 when validUntil is missing or invalid', async () => {
    const req = {
      body: { code: 'NOEXPIRY', discountType: 'amount', discountValue: 10 }
    };
    const res = mockRes();

    await createCoupon(req, res);

    expect(res.status).toHaveBeenCalledWith(400);
    expect(res.json).toHaveBeenCalledWith({
      success: false,
      error: 'A valid validUntil expiration date is required'
    });
  });

  it('should return 409 when coupon code already exists', async () => {
    jest.spyOn(CouponModel, 'findByCode').mockResolvedValue({ code: 'EXIST' });
    const req = {
      body: {
        code: 'EXIST',
        discountType: 'amount',
        discountValue: 10,
        validUntil: '2099-01-01'
      }
    };
    const res = mockRes();

    await createCoupon(req, res);

    expect(CouponModel.findByCode).toHaveBeenCalledWith('EXIST');
    expect(res.status).toHaveBeenCalledWith(409);
    expect(res.json).toHaveBeen