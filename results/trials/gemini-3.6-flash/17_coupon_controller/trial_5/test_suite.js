import { jest } from '@jest/globals';
import { validateCoupon, createCoupon, CouponModel } from '../dataset/17_coupon_controller.js';

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
  });

  describe('CouponModel Default Implementation', () => {
    test('findByCode default implementation returns null', async () => {
      const result = await CouponModel.findByCode('TEST');
      expect(result).toBeNull();
    });

    test('getUserUsageCount default implementation returns 0', async () => {
      const result = await CouponModel.getUserUsageCount('cpn_1', 'user_1');
      expect(result).toBe(0);
    });

    test('create default implementation creates a coupon object', async () => {
      const data = { code: 'NEW10' };
      const result = await CouponModel.create(data);
      expect(result).toHaveProperty('id');
      expect(result.code).toBe('NEW10');
      expect(result).toHaveProperty('createdAt');
    });
  });

  describe('validateCoupon', () => {
    test('should return 400 if coupon code is missing', async () => {
      req.body = { cartTotal: 100 };

      await validateCoupon(req, res);

      expect(res.status).toHaveBeenCalledWith(400);
      expect(res.json).toHaveBeenCalledWith({
        success: false,
        error: 'Coupon code is required'
      });
    });

    test('should return 400 if coupon code is not a string', async () => {
      req.body = { code: 12345, cartTotal: 100 };

      await validateCoupon(req, res);

      expect(res.status).toHaveBeenCalledWith(400);
      expect(res.json).toHaveBeenCalledWith({
        success: false,
        error: 'Coupon code is required'
      });
    });

    test('should return 400 if cartTotal is invalid or negative', async () => {
      req.body = { code: 'SAVE10', cartTotal: -5 };

      await validateCoupon(req, res);

      expect(res.status).toHaveBeenCalledWith(400);
      expect(res.json).toHaveBeenCalledWith({
        success: false,
        error: 'cartTotal must be a non-negative number'
      });
    });

    test('should return 400 if cartTotal is NaN', async () => {
      req.body = { code: 'SAVE10', cartTotal: 'abc' };

      await validateCoupon(req, res);

      expect(res.status).toHaveBeenCalledWith(400);
      expect(res.json).toHaveBeenCalledWith({
        success: false,
        error: 'cartTotal must be a non-negative number'
      });
    });

    test('should return 404 if coupon is not found in database', async () => {
      jest.spyOn(CouponModel, 'findByCode').mockResolvedValue(null);
      req.body = { code: 'NOTFOUND', cartTotal: 100 };

      await validateCoupon(req, res);

      expect(CouponModel.findByCode).toHaveBeenCalledWith('NOTFOUND');
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
      req.body = { code: 'inactive', cartTotal: 100 };

      await validateCoupon(req, res);

      expect(res.status).toHaveBeenCalledWith(400);
      expect(res.json).toHaveBeenCalledWith({
        success: false,
        error: 'This coupon code is currently disabled'
      });
    });

    test('should return 400 if coupon validFrom is in the future', async () => {
      const futureDate = new Date(Date.now() + 86400000).toISOString();
      jest.spyOn(CouponModel, 'findByCode').mockResolvedValue({
        code: 'FUTURE',
        isActive: true,
        validFrom: futureDate
      });
      req.body = { code: 'FUTURE', cartTotal: 100 };

      await validateCoupon(req, res);

      expect(res.status).toHaveBeenCalledWith(400);
      expect(res.json).toHaveBeenCalledWith({
        success: false,
        error: 'This coupon promotion has not started yet'
      });
    });

    test('should return 400 if coupon validUntil is in the past', async () => {
      const pastDate = new Date(Date.now() - 86400000).toISOString();
      jest.spyOn(CouponModel, 'findByCode').mockResolvedValue({
        code: 'EXPIRED',
        isActive: true,
        validUntil: pastDate
      });
      req.body = { code: 'EXPIRED', cartTotal: 100 };

      await validateCoupon(req, res);

      expect(res.status).toHaveBeenCalledWith(400);
      expect(res.json).toHaveBeenCalledWith({
        success: false,
        error: 'This coupon has expired'
      });
    });

    test('should return 400 if coupon maxUsageLimit is reached', async () => {
      jest.spyOn(CouponModel, 'findByCode').mockResolvedValue({
        code: 'MAXED',
        isActive: true,
        maxUsageLimit: 10,
        currentUsage: 10
      });
      req.body = { code: 'MAXED', cartTotal: 100 };

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
      req.body = { code: 'MINORDER', cartTotal: 30 };

      await validateCoupon(req, res);

      expect(res.status).toHaveBeenCalledWith(400);
      expect(res.json).toHaveBeenCalledWith({
        success: false,
        error: 'Minimum order amount of $50.00 required to use this coupon'
      });
    });

    test('should return 400 if user exceeds perUserLimit', async () => {
      jest.spyOn(CouponModel, 'findByCode').mockResolvedValue({
        id: 'cpn_123',
        code: 'USERLIMIT',
        isActive: true,
        perUserLimit: 2
      });
      jest.spyOn(CouponModel, 'getUserUsageCount').mockResolvedValue(2);

      req.user = { id: 'usr_1' };
      req.body = { code: 'USERLIMIT', cartTotal: 100 };

      await validateCoupon(req, res);

      expect(CouponModel.getUserUsageCount).toHaveBeenCalledWith('cpn_123', 'usr_1');
      expect(res.status).toHaveBeenCalledWith(400);
      expect(res.json).toHaveBeenCalledWith({
        success: false,
        error: 'You have exceeded the maximum redemptions for this coupon'
      });
    });

    test('should calculate percentage discount correctly without cap', async () => {
      jest.spyOn(CouponModel, 'findByCode').mockResolvedValue({
        code: 'PERC20',
        isActive: true,
        discountType: 'percent',
        discountValue: 20
      });
      req.body = { code: 'PERC20', cartTotal: 100 };

      await validateCoupon(req, res);

      expect(res.status).toHaveBeenCalledWith(200);
      expect(res.json).toHaveBeenCalledWith({
        success: true,
        data: {
          code: 'PERC20',
          discountType: 'percent',
          discountValue: 20,
          discountAmount: 20,
          originalTotal: 100,
          discountedTotal: 80
        }
      });
    });

    test('should calculate percentage discount with cap applied', async () => {
      jest.spyOn(CouponModel, 'findByCode').mockResolvedValue({
        code: 'PERC50',
        isActive: true,
        discountType: 'percent',
        discountValue: 50,
        maxDiscountCap: 15
      });
      req.body = { code: 'PERC50', cartTotal: 100 };

      await validateCoupon(req, res);

      expect(res.status).toHaveBeenCalledWith(200);
      expect(res.json).toHaveBeenCalledWith({
        success: true,
        data: {
          code: 'PERC50',
          discountType: 'percent',
          discountValue: 50,
          discountAmount: 15,
          originalTotal: 100,
          discountedTotal: 85
        }
      });
    });

    test('should calculate amount discount correctly', async () => {
      jest.spyOn(CouponModel, 'findByCode').mockResolvedValue({
        code: 'FLAT10',
        isActive: true,
        discountType: 'amount',
        discountValue: 10
      });
      req.body = { code: 'FLAT10', cartTotal: 50 };

      await validateCoupon(req, res);

      expect(res.status).toHaveBeenCalledWith(200);
      expect(res.json).toHaveBeenCalledWith({
        success: true,
        data: {
          code: 'FLAT10',
          discountType: 'amount',
          discountValue: 10,
          discountAmount: 10,
          originalTotal: 50,
          discountedTotal: 40
        }
      });
    });

    test('should not result in a negative total when amount discount exceeds cartTotal', async () => {
      jest.spyOn(CouponModel, 'findByCode').mockResolvedValue({
        code: 'FLAT50',
        isActive: true,
        discountType: 'amount',
        discountValue: 50
      });
      req.body = { code: 'FLAT50', cartTotal: 30 };

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

    test('should handle userId passed via req.body if req.user is absent', async () => {
      jest.spyOn(CouponModel, 'findByCode').mockResolvedValue({
        id: 'cpn_123',
        code: 'USERLIMIT',
        isActive: true,
        perUserLimit: 2
      });
      jest.spyOn(CouponModel, 'getUserUsageCount').mockResolvedValue(0);

      req.body = { code: 'USERLIMIT', cartTotal: 100, userId: 'usr_body' };

      await validateCoupon(req, res);

      expect(CouponModel.getUserUsageCount).toHaveBeenCalledWith('cpn_123', 'usr_body');
      expect(res.status).toHaveBeenCalledWith(200);
    });

    test('should handle internal errors gracefully and return status 500', async () => {
      jest.spyOn(CouponModel, 'findByCode').mockRejectedValue(new Error('Database connection failed'));
      req.body = { code: 'ERROR' };

      await validateCoupon(req, res);

      expect(res.status).toHaveBeenCalledWith(500);
      expect(res.json).toHaveBeenCalledWith({
        success: false,
        error: 'Failed to validate coupon code',
        details: 'Database connection failed'
      });
    });
  });

  describe('createCoupon', () => {
    const validValidUntil = new Date(Date.now() + 86400000).toISOString();

    test('should return 400 if coupon code is missing or not a string', async () => {
      req.body = { discountType: 'percent', discountValue: 10, validUntil: validValidUntil };

      await createCoupon(req, res);

      expect(res.status).toHaveBeenCalledWith(400);
      expect(res.json).toHaveBeenCalledWith({
        success: false,
        error: 'Coupon code is required'
      });
    });

    test('should return 400 if coupon code does not match required format', async () => {
      req.body = {
        code: 'AB', // Too short (< 3 chars)
        discountType: 'percent',
        discountValue: 10,
        validUntil: validValidUntil
      };

      await createCoupon(req, res);

      expect(res.status).toHaveBeenCalledWith(400);
      expect(res.json).toHaveBeenCalledWith({
        success: false,
        error: 'Coupon code must be 3-20 uppercase alphanumeric characters'
      });
    });

    test('should return 400 if discountType is invalid', async () => {
      req.body = {
        code: 'VALIDCODE',
        discountType: 'invalid_type',
        discountValue: 10,
        validUntil: validValidUntil
      };

      await createCoupon(req, res);

      expect(res.status).toHaveBeenCalledWith(400);
      expect(res.json).toHaveBeenCalledWith({
        success: false,
        error: 'discountType must be either "percent" or "amount"'
      });
    });

    test('should return 400 if discountValue is non-numeric or <= 0', async () => {
      req.body = {
        code: 'VALIDCODE',
        discountType: 'percent',
        discountValue: 0,
        validUntil: validValidUntil
      };

      await createCoupon(req, res);

      expect(res.status).toHaveBeenCalledWith(400);
      expect(res.json).toHaveBeenCalledWith({
        success: false,
        error: 'discountValue must be a positive number'
      });
    });

    test('should return 400 if discountType is percent and discountValue > 100', async () => {
      req.body = {
        code: 'VALIDCODE',
        discountType: 'percent',
        discountValue: 105,
        validUntil: validValidUntil
      };

      await createCoupon(req, res);

      expect(res.status).toHaveBeenCalledWith(400);
      expect(res.json).toHaveBeenCalledWith({
        success: false,
        error: 'Percentage discount cannot exceed 100%'
      });
    });

    test('should return 400 if validUntil is missing or invalid date string', async () => {
      req.body = {
        code: 'VALIDCODE',
        discountType: 'percent',
        discountValue: 20,
        validUntil: 'invalid-date'
      };

      await createCoupon(req, res);

      expect(res.status).toHaveBeenCalledWith(400);
      expect(res.json).toHaveBeenCalledWith({
        success: false,
        error: 'A valid validUntil expiration date is required'
      });
    });

    test('should return 409 if coupon code already exists', async () => {
      jest.spyOn(CouponModel, 'findByCode').mockResolvedValue({ id: 'cpn_1', code: 'EXISTING' });
      req.body = {
        code: 'EXISTING',
        discountType: 'percent',
        discountValue: 20,
        validUntil: validValidUntil
      };

      await createCoupon(req, res);

      expect(res.status).toHaveBeenCalledWith(409);
      expect(res.json).toHaveBeenCalledWith({
        success: false,
        error: 'Coupon with code "EXISTING" already exists'
      });
    });

    test('should create coupon successfully with default optional values', async () => {
      jest.spyOn(CouponModel, 'findByCode').mockResolvedValue(null);
      const createdCoupon = { id: 'cpn_new', code: 'NEWCOUPON' };
      jest.spyOn(CouponModel, 'create').mockResolvedValue(createdCoupon);

      req.body = {
        code: 'newcoupon',
        discountType: 'amount',
        discountValue: 15,
        validUntil: validValidUntil
      };

      await createCoupon(req, res);

      expect(CouponModel.findByCode).toHaveBeenCalledWith('NEWCOUPON');
      expect(CouponModel.create).toHaveBeenCalledWith(expect.objectContaining({
        code: 'NEWCOUPON',
        discountType: 'amount',
        discountValue: 15,
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

    test('should create coupon successfully with specified optional values', async () => {
      jest.spyOn(CouponModel, 'findByCode').mockResolvedValue(null);
      const validFrom = new Date().toISOString();
      const createdCoupon = { id: 'cpn_custom', code: 'CUSTOM' };
      jest.spyOn(CouponModel, 'create').mockResolvedValue(createdCoupon);

      req.body = {
        code: 'CUSTOM',
        discountType: 'percent',
        discountValue: 25,
        validFrom,
        validUntil: validValidUntil,
        minOrderAmount: '50',
        maxUsageLimit: '500',
        perUserLimit: '5'
      };

      await createCoupon(req, res);

      expect(CouponModel.create).toHaveBeenCalledWith(expect.objectContaining({
        minOrderAmount: 50,
        maxUsageLimit: 500,
        perUserLimit: 5
      }));
      expect(res.status).toHaveBeenCalledWith(201);
    });

    test('should handle internal errors gracefully and return status 500', async () => {
      jest.spyOn(CouponModel, 'findByCode').mockRejectedValue(new Error('DB write failure'));

      req.body = {
        code: 'FAILCODE',
        discountType: 'percent',
        discountValue: 10,
        validUntil: validValidUntil
      };

      await createCoupon(req, res);

      expect(res.status).toHaveBeenCalledWith(500);
      expect(res.json).toHaveBeenCalledWith({
        success: false,
        error: 'Failed to create coupon',
        details: 'DB write failure'
      });
    });
  });
});