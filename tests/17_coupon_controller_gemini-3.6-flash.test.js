import { jest } from '@jest/globals';
import { validateCoupon, createCoupon, CouponModel } from '../dataset/17_coupon_controller.js';

const mockResponse = () => {
  const res = {};
  res.status = jest.fn().mockReturnValue(res);
  res.json = jest.fn().mockReturnValue(res);
  return res;
};

describe('17_coupon_controller Unit Tests', () => {
  afterEach(() => {
    jest.restoreAllMocks();
  });

  describe('CouponModel Default Implementation', () => {
    test('findByCode returns null by default', async () => {
      const result = await CouponModel.findByCode('TEST');
      expect(result).toBeNull();
    });

    test('getUserUsageCount returns 0 by default', async () => {
      const result = await CouponModel.getUserUsageCount('cpn_123', 'usr_123');
      expect(result).toBe(0);
    });

    test('create returns mock created coupon', async () => {
      const input = { code: 'SAVE10', discountType: 'percent', discountValue: 10 };
      const result = await CouponModel.create(input);
      expect(result).toHaveProperty('id');
      expect(result.code).toBe('SAVE10');
      expect(result.createdAt).toBeInstanceOf(Date);
    });
  });

  describe('validateCoupon', () => {
    test('should return 400 if coupon code is missing or not a string', async () => {
      const req = { body: {} };
      const res = mockResponse();

      await validateCoupon(req, res);

      expect(res.status).toHaveBeenCalledWith(400);
      expect(res.json).toHaveBeenCalledWith({
        success: false,
        error: 'Coupon code is required'
      });
    });

    test('should return 400 if cartTotal is invalid or negative', async () => {
      const req = { body: { code: 'SAVE10', cartTotal: -50 } };
      const res = mockResponse();

      await validateCoupon(req, res);

      expect(res.status).toHaveBeenCalledWith(400);
      expect(res.json).toHaveBeenCalledWith({
        success: false,
        error: 'cartTotal must be a non-negative number'
      });
    });

    test('should return 404 if coupon is not found', async () => {
      jest.spyOn(CouponModel, 'findByCode').mockResolvedValue(null);
      const req = { body: { code: 'INVALID', cartTotal: 100 } };
      const res = mockResponse();

      await validateCoupon(req, res);

      expect(CouponModel.findByCode).toHaveBeenCalledWith('INVALID');
      expect(res.status).toHaveBeenCalledWith(404);
      expect(res.json).toHaveBeenCalledWith({
        success: false,
        error: 'Coupon code not found'
      });
    });

    test('should return 400 if coupon is not active', async () => {
      jest.spyOn(CouponModel, 'findByCode').mockResolvedValue({
        code: 'INACTIVE',
        isActive: false
      });
      const req = { body: { code: 'INACTIVE', cartTotal: 100 } };
      const res = mockResponse();

      await validateCoupon(req, res);

      expect(res.status).toHaveBeenCalledWith(400);
      expect(res.json).toHaveBeenCalledWith({
        success: false,
        error: 'This coupon code is currently disabled'
      });
    });

    test('should return 400 if coupon validFrom is in the future', async () => {
      const futureDate = new Date(Date.now() + 86400000);
      jest.spyOn(CouponModel, 'findByCode').mockResolvedValue({
        code: 'FUTURE',
        isActive: true,
        validFrom: futureDate
      });
      const req = { body: { code: 'FUTURE', cartTotal: 100 } };
      const res = mockResponse();

      await validateCoupon(req, res);

      expect(res.status).toHaveBeenCalledWith(400);
      expect(res.json).toHaveBeenCalledWith({
        success: false,
        error: 'This coupon promotion has not started yet'
      });
    });

    test('should return 400 if coupon validUntil is in the past', async () => {
      const pastDate = new Date(Date.now() - 86400000);
      jest.spyOn(CouponModel, 'findByCode').mockResolvedValue({
        code: 'EXPIRED',
        isActive: true,
        validUntil: pastDate
      });
      const req = { body: { code: 'EXPIRED', cartTotal: 100 } };
      const res = mockResponse();

      await validateCoupon(req, res);

      expect(res.status).toHaveBeenCalledWith(400);
      expect(res.json).toHaveBeenCalledWith({
        success: false,
        error: 'This coupon has expired'
      });
    });

    test('should return 400 if maxUsageLimit is reached', async () => {
      jest.spyOn(CouponModel, 'findByCode').mockResolvedValue({
        code: 'MAXED',
        isActive: true,
        maxUsageLimit: 10,
        currentUsage: 10
      });
      const req = { body: { code: 'MAXED', cartTotal: 100 } };
      const res = mockResponse();

      await validateCoupon(req, res);

      expect(res.status).toHaveBeenCalledWith(400);
      expect(res.json).toHaveBeenCalledWith({
        success: false,
        error: 'This coupon has reached its maximum global usage limit'
      });
    });

    test('should return 400 if cartTotal is less than minOrderAmount', async () => {
      jest.spyOn(CouponModel, 'findByCode').mockResolvedValue({
        code: 'MINORDER',
        isActive: true,
        minOrderAmount: 50
      });
      const req = { body: { code: 'MINORDER', cartTotal: 30 } };
      const res = mockResponse();

      await validateCoupon(req, res);

      expect(res.status).toHaveBeenCalledWith(400);
      expect(res.json).toHaveBeenCalledWith({
        success: false,
        error: 'Minimum order amount of $50.00 required to use this coupon'
      });
    });

    test('should return 400 if user exceeds perUserLimit', async () => {
      jest.spyOn(CouponModel, 'findByCode').mockResolvedValue({
        id: 'cpn_1',
        code: 'USERLIMIT',
        isActive: true,
        perUserLimit: 2
      });
      jest.spyOn(CouponModel, 'getUserUsageCount').mockResolvedValue(2);

      const req = {
        user: { id: 'usr_1' },
        body: { code: 'USERLIMIT', cartTotal: 100 }
      };
      const res = mockResponse();

      await validateCoupon(req, res);

      expect(CouponModel.getUserUsageCount).toHaveBeenCalledWith('cpn_1', 'usr_1');
      expect(res.status).toHaveBeenCalledWith(400);
      expect(res.json).toHaveBeenCalledWith({
        success: false,
        error: 'You have exceeded the maximum redemptions for this coupon'
      });
    });

    test('should calculate percentage discount with maxDiscountCap correctly', async () => {
      jest.spyOn(CouponModel, 'findByCode').mockResolvedValue({
        id: 'cpn_2',
        code: 'PERCENT50',
        isActive: true,
        discountType: 'percent',
        discountValue: 50,
        maxDiscountCap: 20
      });

      const req = { body: { code: 'PERCENT50', cartTotal: 100, userId: 'usr_2' } };
      const res = mockResponse();

      await validateCoupon(req, res);

      expect(res.status).toHaveBeenCalledWith(200);
      expect(res.json).toHaveBeenCalledWith({
        success: true,
        data: {
          code: 'PERCENT50',
          discountType: 'percent',
          discountValue: 50,
          discountAmount: 20,
          originalTotal: 100,
          discountedTotal: 80
        }
      });
    });

    test('should calculate fixed amount discount correctly and cap discountedTotal at 0', async () => {
      jest.spyOn(CouponModel, 'findByCode').mockResolvedValue({
        id: 'cpn_3',
        code: 'FLAT50',
        isActive: true,
        discountType: 'amount',
        discountValue: 50
      });

      const req = { body: { code: 'FLAT50', cartTotal: 30 } };
      const res = mockResponse();

      await validateCoupon(req, res);

      expect(res.status).toHaveBeenCalledWith(200);
      expect(res.json).toHaveBeenCalledWith({
        success: true,
        data: {
          code: 'FLAT50',
          discountType: 'amount',
          discountValue: 50,
          discountAmount: 30,
          originalTotal: 30,
          discountedTotal: 0
        }
      });
    });

    test('should return 500 when an exception occurs during validation', async () => {
      jest.spyOn(CouponModel, 'findByCode').mockRejectedValue(new Error('Database error'));
      const req = { body: { code: 'FAIL' } };
      const res = mockResponse();

      await validateCoupon(req, res);

      expect(res.status).toHaveBeenCalledWith(500);
      expect(res.json).toHaveBeenCalledWith({
        success: false,
        error: 'Failed to validate coupon code',
        details: 'Database error'
      });
    });
  });

  describe('createCoupon', () => {
    test('should return 400 if code is missing or not a string', async () => {
      const req = { body: { discountType: 'percent', discountValue: 10 } };
      const res = mockResponse();

      await createCoupon(req, res);

      expect(res.status).toHaveBeenCalledWith(400);
      expect(res.json).toHaveBeenCalledWith({
        success: false,
        error: 'Coupon code is required'
      });
    });

    test('should return 400 if code format is invalid', async () => {
      const req = { body: { code: 'invalid code!', discountType: 'percent', discountValue: 10 } };
      const res = mockResponse();

      await createCoupon(req, res);

      expect(res.status).toHaveBeenCalledWith(400);
      expect(res.json).toHaveBeenCalledWith({
        success: false,
        error: 'Coupon code must be 3-20 uppercase alphanumeric characters'
      });
    });

    test('should return 400 if discountType is invalid', async () => {
      const req = { body: { code: 'SUMMER20', discountType: 'free', discountValue: 10 } };
      const res = mockResponse();

      await createCoupon(req, res);

      expect(res.status).toHaveBeenCalledWith(400);
      expect(res.json).toHaveBeenCalledWith({
        success: false,
        error: 'discountType must be either "percent" or "amount"'
      });
    });

    test('should return 400 if discountValue is non-positive or NaN', async () => {
      const req = { body: { code: 'SUMMER20', discountType: 'percent', discountValue: 0 } };
      const res = mockResponse();

      await createCoupon(req, res);

      expect(res.status).toHaveBeenCalledWith(400);
      expect(res.json).toHaveBeenCalledWith({
        success: false,
        error: 'discountValue must be a positive number'
      });
    });

    test('should return 400 if percent discount exceeds 100%', async () => {
      const req = { body: { code: 'SUMMER20', discountType: 'percent', discountValue: 150 } };
      const res = mockResponse();

      await createCoupon(req, res);

      expect(res.status).toHaveBeenCalledWith(400);
      expect(res.json).toHaveBeenCalledWith({
        success: false,
        error: 'Percentage discount cannot exceed 100%'
      });
    });

    test('should return 400 if validUntil is missing or invalid date', async () => {
      const req = {
        body: {
          code: 'SUMMER20',
          discountType: 'percent',
          discountValue: 20,
          validUntil: 'invalid-date'
        }
      };
      const res = mockResponse();

      await createCoupon(req, res);

      expect(res.status).toHaveBeenCalledWith(400);
      expect(res.json).toHaveBeenCalledWith({
        success: false,
        error: 'A valid validUntil expiration date is required'
      });
    });

    test('should return 409 if coupon code already exists', async () => {
      jest.spyOn(CouponModel, 'findByCode').mockResolvedValue({ code: 'EXISTS' });
      const req = {
        body: {
          code: 'exists',
          discountType: 'percent',
          discountValue: 20,
          validUntil: '2030-01-01'
        }
      };
      const res = mockResponse();

      await createCoupon(req, res);

      expect(res.status).toHaveBeenCalledWith(409);
      expect(res.json).toHaveBeenCalledWith({
        success: false,
        error: 'Coupon with code "EXISTS" already exists'
      });
    });

    test('should create coupon successfully with defaults and custom options', async () => {
      jest.spyOn(CouponModel, 'findByCode').mockResolvedValue(null);
      const createdCoupon = { id: 'cpn_new', code: 'NEW20' };
      jest.spyOn(CouponModel, 'create').mockResolvedValue(createdCoupon);

      const validUntilStr = '2030-12-31T23:59:59.000Z';
      const req = {
        body: {
          code: '  new20  ',
          discountType: 'amount',
          discountValue: '25.5',
          validUntil: validUntilStr,
          minOrderAmount: '50',
          maxUsageLimit: '200',
          perUserLimit: '2'
        }
      };
      const res = mockResponse();

      await createCoupon(req, res);

      expect(CouponModel.create).toHaveBeenCalledWith(
        expect.objectContaining({
          code: 'NEW20',
          discountType: 'amount',
          discountValue: 25.5,
          validUntil: new Date(validUntilStr),
          minOrderAmount: 50,
          maxUsageLimit: 200,
          perUserLimit: 2,
          currentUsage: 0,
          isActive: true
        })
      );
      expect(res.status).toHaveBeenCalledWith(201);
      expect(res.json).toHaveBeenCalledWith({
        success: true,
        message: 'Coupon created successfully',
        data: createdCoupon
      });
    });

    test('should return 500 if DB call fails during creation', async () => {
      jest.spyOn(CouponModel, 'findByCode').mockRejectedValue(new Error('Write failed'));
      const req = {
        body: {
          code: 'FAILCODE',
          discountType: 'amount',
          discountValue: 10,
          validUntil: '2030-01-01'
        }
      };
      const res = mockResponse();

      await createCoupon(req, res);

      expect(res.status).toHaveBeenCalledWith(500);
      expect(res.json).toHaveBeenCalledWith({
        success: false,
        error: 'Failed to create coupon',
        details: 'Write failed'
      });
    });
  });
});