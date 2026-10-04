import { validateCoupon, createCoupon, CouponModel } from '../dataset/17_coupon_controller.js';
import { jest } from '@jest/globals';

describe('17_coupon_controller Unit Tests', () => {
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
    jest.clearAllMocks();
    jest.restoreAllMocks();
  });

  describe('validateCoupon', () => {
    test('should return 400 if code is missing or not a string', async () => {
      req.body = { code: 12345, cartTotal: 100 };

      await validateCoupon(req, res);

      expect(res.status).toHaveBeenCalledWith(400);
      expect(res.json).toHaveBeenCalledWith({
        success: false,
        error: 'Coupon code is required'
      });
    });

    test('should return 400 if cartTotal is negative or NaN', async () => {
      req.body = { code: 'SAVE10', cartTotal: -50 };

      await validateCoupon(req, res);

      expect(res.status).toHaveBeenCalledWith(400);
      expect(res.json).toHaveBeenCalledWith({
        success: false,
        error: 'cartTotal must be a non-negative number'
      });
    });

    test('should return 404 if coupon code is not found', async () => {
      req.body = { code: 'UNKNOWN', cartTotal: 100 };
      jest.spyOn(CouponModel, 'findByCode').mockResolvedValue(null);

      await validateCoupon(req, res);

      expect(CouponModel.findByCode).toHaveBeenCalledWith('UNKNOWN');
      expect(res.status).toHaveBeenCalledWith(404);
      expect(res.json).toHaveBeenCalledWith({
        success: false,
        error: 'Coupon code not found'
      });
    });

    test('should return 400 if coupon is not active', async () => {
      req.body = { code: 'INACTIVE', cartTotal: 100 };
      jest.spyOn(CouponModel, 'findByCode').mockResolvedValue({
        code: 'INACTIVE',
        isActive: false
      });

      await validateCoupon(req, res);

      expect(res.status).toHaveBeenCalledWith(400);
      expect(res.json).toHaveBeenCalledWith({
        success: false,
        error: 'This coupon code is currently disabled'
      });
    });

    test('should return 400 if validFrom is in the future', async () => {
      req.body = { code: 'FUTURE', cartTotal: 100 };
      const futureDate = new Date(Date.now() + 86400000);
      jest.spyOn(CouponModel, 'findByCode').mockResolvedValue({
        code: 'FUTURE',
        isActive: true,
        validFrom: futureDate
      });

      await validateCoupon(req, res);

      expect(res.status).toHaveBeenCalledWith(400);
      expect(res.json).toHaveBeenCalledWith({
        success: false,
        error: 'This coupon promotion has not started yet'
      });
    });

    test('should return 400 if validUntil is in the past', async () => {
      req.body = { code: 'EXPIRED', cartTotal: 100 };
      const pastDate = new Date(Date.now() - 86400000);
      jest.spyOn(CouponModel, 'findByCode').mockResolvedValue({
        code: 'EXPIRED',
        isActive: true,
        validUntil: pastDate
      });

      await validateCoupon(req, res);

      expect(res.status).toHaveBeenCalledWith(400);
      expect(res.json).toHaveBeenCalledWith({
        success: false,
        error: 'This coupon has expired'
      });
    });

    test('should return 400 if maxUsageLimit is reached', async () => {
      req.body = { code: 'MAXED', cartTotal: 100 };
      jest.spyOn(CouponModel, 'findByCode').mockResolvedValue({
        code: 'MAXED',
        isActive: true,
        maxUsageLimit: 10,
        currentUsage: 10
      });

      await validateCoupon(req, res);

      expect(res.status).toHaveBeenCalledWith(400);
      expect(res.json).toHaveBeenCalledWith({
        success: false,
        error: 'This coupon has reached its maximum global usage limit'
      });
    });

    test('should return 400 if order total is less than minOrderAmount', async () => {
      req.body = { code: 'MIN50', cartTotal: 30 };
      jest.spyOn(CouponModel, 'findByCode').mockResolvedValue({
        code: 'MIN50',
        isActive: true,
        minOrderAmount: 50
      });

      await validateCoupon(req, res);

      expect(res.status).toHaveBeenCalledWith(400);
      expect(res.json).toHaveBeenCalledWith({
        success: false,
        error: 'Minimum order amount of $50.00 required to use this coupon'
      });
    });

    test('should return 400 if perUserLimit is exceeded', async () => {
      req.user = { id: 'user_123' };
      req.body = { code: 'LIMIT1', cartTotal: 100 };
      jest.spyOn(CouponModel, 'findByCode').mockResolvedValue({
        id: 'cpn_1',
        code: 'LIMIT1',
        isActive: true,
        perUserLimit: 1
      });
      jest.spyOn(CouponModel, 'getUserUsageCount').mockResolvedValue(1);

      await validateCoupon(req, res);

      expect(CouponModel.getUserUsageCount).toHaveBeenCalledWith('cpn_1', 'user_123');
      expect(res.status).toHaveBeenCalledWith(400);
      expect(res.json).toHaveBeenCalledWith({
        success: false,
        error: 'You have exceeded the maximum redemptions for this coupon'
      });
    });

    test('should calculate percentage discount correctly without maxDiscountCap', async () => {
      req.body = { code: 'PERCENT20', cartTotal: 100 };
      jest.spyOn(CouponModel, 'findByCode').mockResolvedValue({
        id: 'cpn_1',
        code: 'PERCENT20',
        isActive: true,
        discountType: 'percent',
        discountValue: 20
      });

      await validateCoupon(req, res);

      expect(res.status).toHaveBeenCalledWith(200);
      expect(res.json).toHaveBeenCalledWith({
        success: true,
        data: {
          code: 'PERCENT20',
          discountType: 'percent',
          discountValue: 20,
          discountAmount: 20,
          originalTotal: 100,
          discountedTotal: 80
        }
      });
    });

    test('should apply maxDiscountCap for percentage discount if exceeded', async () => {
      req.body = { code: 'PERCENT50', cartTotal: 200 };
      jest.spyOn(CouponModel, 'findByCode').mockResolvedValue({
        id: 'cpn_1',
        code: 'PERCENT50',
        isActive: true,
        discountType: 'percent',
        discountValue: 50,
        maxDiscountCap: 30
      });

      await validateCoupon(req, res);

      expect(res.status).toHaveBeenCalledWith(200);
      expect(res.json).toHaveBeenCalledWith({
        success: true,
        data: {
          code: 'PERCENT50',
          discountType: 'percent',
          discountValue: 50,
          discountAmount: 30,
          originalTotal: 200,
          discountedTotal: 170
        }
      });
    });

    test('should calculate fixed amount discount correctly', async () => {
      req.body = { code: 'FLAT15', cartTotal: 50, userId: 'user_456' };
      jest.spyOn(CouponModel, 'findByCode').mockResolvedValue({
        id: 'cpn_2',
        code: 'FLAT15',
        isActive: true,
        discountType: 'amount',
        discountValue: 15,
        perUserLimit: 2
      });
      jest.spyOn(CouponModel, 'getUserUsageCount').mockResolvedValue(0);

      await validateCoupon(req, res);

      expect(CouponModel.getUserUsageCount).toHaveBeenCalledWith('cpn_2', 'user_456');
      expect(res.status).toHaveBeenCalledWith(200);
      expect(res.json).toHaveBeenCalledWith({
        success: true,
        data: {
          code: 'FLAT15',
          discountType: 'amount',
          discountValue: 15,
          discountAmount: 15,
          originalTotal: 50,
          discountedTotal: 35
        }
      });
    });

    test('should cap fixed amount discount to original cartTotal if discount exceeds total', async () => {
      req.body = { code: 'FLAT100', cartTotal: 50 };
      jest.spyOn(CouponModel, 'findByCode').mockResolvedValue({
        id: 'cpn_3',
        code: 'FLAT100',
        isActive: true,
        discountType: 'amount',
        discountValue: 100
      });

      await validateCoupon(req, res);

      expect(res.status).toHaveBeenCalledWith(200);
      expect(res.json).toHaveBeenCalledWith({
        success: true,
        data: {
          code: 'FLAT100',
          discountType: 'amount',
          discountValue: 100,
          discountAmount: 50,
          originalTotal: 50,
          discountedTotal: 0
        }
      });
    });

    test('should return 500 on unexpected exceptions', async () => {
      req.body = { code: 'ERR', cartTotal: 100 };
      jest.spyOn(CouponModel, 'findByCode').mockRejectedValue(new Error('Database error'));

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
      req.body = { discountType: 'percent', discountValue: 10 };

      await createCoupon(req, res);

      expect(res.status).toHaveBeenCalledWith(400);
      expect(res.json).toHaveBeenCalledWith({
        success: false,
        error: 'Coupon code is required'
      });
    });

    test('should return 400 if coupon code format is invalid', async () => {
      req.body = { code: 'a!', discountType: 'percent', discountValue: 10 };

      await createCoupon(req, res);

      expect(res.status).toHaveBeenCalledWith(400);
      expect(res.json).toHaveBeenCalledWith({
        success: false,
        error: 'Coupon code must be 3-20 uppercase alphanumeric characters'
      });
    });

    test('should return 400 if discountType is invalid', async () => {
      req.body = { code: 'SAVE10', discountType: 'invalid', discountValue: 10 };

      await createCoupon(req, res);

      expect(res.status).toHaveBeenCalledWith(400);
      expect(res.json).toHaveBeenCalledWith({
        success: false,
        error: 'discountType must be either "percent" or "amount"'
      });
    });

    test('should return 400 if discountValue is <= 0 or NaN', async () => {
      req.body = { code: 'SAVE10', discountType: 'percent', discountValue: 0 };

      await createCoupon(req, res);

      expect(res.status).toHaveBeenCalledWith(400);
      expect(res.json).toHaveBeenCalledWith({
        success: false,
        error: 'discountValue must be a positive number'
      });
    });

    test('should return 400 if percentage discount exceeds 100', async () => {
      req.body = { code: 'SAVE150', discountType: 'percent', discountValue: 150 };

      await createCoupon(req, res);

      expect(res.status).toHaveBeenCalledWith(400);
      expect(res.json).toHaveBeenCalledWith({
        success: false,
        error: 'Percentage discount cannot exceed 100%'
      });
    });

    test('should return 400 if validUntil date is missing or invalid', async () => {
      req.body = {
        code: 'SAVE10',
        discountType: 'percent',
        discountValue: 10,
        validUntil: 'not-a-date'
      };

      await createCoupon(req, res);

      expect(res.status).toHaveBeenCalledWith(400);
      expect(res.json).toHaveBeenCalledWith({
        success: false,
        error: 'A valid validUntil expiration date is required'
      });
    });

    test('should return 409 if coupon code already exists', async () => {
      const validUntil = new Date(Date.now() + 86400000).toISOString();
      req.body = {
        code: 'EXISTS',
        discountType: 'amount',
        discountValue: 10,
        validUntil
      };

      jest.spyOn(CouponModel, 'findByCode').mockResolvedValue({ id: 'cpn_existing', code: 'EXISTS' });

      await createCoupon(req, res);

      expect(CouponModel.findByCode).toHaveBeenCalledWith('EXISTS');
      expect(res.status).toHaveBeenCalledWith(409);
      expect(res.json).toHaveBeenCalledWith({
        success: false,
        error: 'Coupon with code "EXISTS" already exists'
      });
    });

    test('should create a new coupon successfully with provided and default values', async () => {
      const validUntil = new Date(Date.now() + 86400000).toISOString();
      req.body = {
        code: 'new_code_20',
        discountType: 'percent',
        discountValue: '20',
        validUntil
      };

      jest.spyOn(CouponModel, 'findByCode').mockResolvedValue(null);
      const createdCoupon = {
        id: 'cpn_new',
        code: 'NEW_CODE_20',
        discountType: 'percent',
        discountValue: 20,
        isActive: true
      };
      jest.spyOn(CouponModel, 'create').mockResolvedValue(createdCoupon);

      await createCoupon(req, res);

      expect(CouponModel.findByCode).toHaveBeenCalledWith('NEW_CODE_20');
      expect(CouponModel.create).toHaveBeenCalledWith(expect.objectContaining({
        code: 'NEW_CODE_20',
        discountType: 'percent',
        discountValue: 20,
        minOrderAmount: 0,
        maxUsageLimit: 100,
        perUserLimit: 1,
        currentUsage: 0,
        isActive: true
      }));

      expect(res.status).toHaveBeenCalledWith(201);
      expect(res.json).toHaveBeenCalledWith({
        success: true,
        message: 'Coupon created successfully',
        data: createdCoupon
      });
    });

    test('should create a coupon using explicit custom values', async () => {
      const validFrom = new Date().toISOString();
      const validUntil = new Date(Date.now() + 86400000).toISOString();
      req.body = {
        code: 'CUSTOM_50',
        discountType: 'amount',
        discountValue: 50,
        validFrom,
        validUntil,
        minOrderAmount: 100,
        maxUsageLimit: 50,
        perUserLimit: 2
      };

      jest.spyOn(CouponModel, 'findByCode').mockResolvedValue(null);
      jest.spyOn(CouponModel, 'create').mockResolvedValue({ id: 'cpn_custom' });

      await createCoupon(req, res);

      expect(CouponModel.create).toHaveBeenCalledWith(expect.objectContaining({
        code: 'CUSTOM_50',
        discountType: 'amount',
        discountValue: 50,
        minOrderAmount: 100,
        maxUsageLimit: 50,
        perUserLimit: 2
      }));
      expect(res.status).toHaveBeenCalledWith(201);
    });

    test('should return 500 on database error during creation', async () => {
      const validUntil = new Date(Date.now() + 86400000).toISOString();
      req.body = {
        code: 'FAIL_CPN',
        discountType: 'amount',
        discountValue: 10,
        validUntil
      };

      jest.spyOn(CouponModel, 'findByCode').mockRejectedValue(new Error('DB Create Failed'));

      await createCoupon(req, res);

      expect(res.status).toHaveBeenCalledWith(500);
      expect(res.json).toHaveBeenCalledWith({
        success: false,
        error: 'Failed to create coupon',
        details: 'DB Create Failed'
      });
    });
  });

  describe('CouponModel Default Methods', () => {
    test('default CouponModel.findByCode returns null', async () => {
      const res = await CouponModel.findByCode('TEST');
      expect(res).toBeNull();
    });

    test('default CouponModel.getUserUsageCount returns 0', async () => {
      const count = await CouponModel.getUserUsageCount('id', 'user');
      expect(count).toBe(0);
    });

    test('default CouponModel.create creates an object with createdAt and id', async () => {
      const newCoupon = await CouponModel.create({ code: 'TEST' });
      expect(newCoupon.id).toBeDefined();
      expect(newCoupon.code).toBe('TEST');
      expect(newCoupon.createdAt).toBeInstanceOf(Date);
    });
  });
});