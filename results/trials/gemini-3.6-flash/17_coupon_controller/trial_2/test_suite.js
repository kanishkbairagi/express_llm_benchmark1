import { jest } from '@jest/globals';
import { validateCoupon, createCoupon, CouponModel } from '../dataset/17_coupon_controller.js';

describe('17_coupon_controller Unit Tests', () => {
  let mockRes;

  beforeEach(() => {
    jest.clearAllMocks();
    mockRes = {
      status: jest.fn().mockReturnThis(),
      json: jest.fn().mockReturnThis()
    };
  });

  describe('validateCoupon', () => {
    test('should return 400 if coupon code is missing or not a string', async () => {
      const req = { body: { cartTotal: 50 } };
      await validateCoupon(req, mockRes);

      expect(mockRes.status).toHaveBeenCalledWith(400);
      expect(mockRes.json).toHaveBeenCalledWith({
        success: false,
        error: 'Coupon code is required'
      });
    });

    test('should return 400 if cartTotal is invalid or negative', async () => {
      const req = { body: { code: 'SAVE10', cartTotal: -10 } };
      await validateCoupon(req, mockRes);

      expect(mockRes.status).toHaveBeenCalledWith(400);
      expect(mockRes.json).toHaveBeenCalledWith({
        success: false,
        error: 'cartTotal must be a non-negative number'
      });
    });

    test('should return 404 if coupon is not found in database', async () => {
      jest.spyOn(CouponModel, 'findByCode').mockResolvedValue(null);

      const req = { body: { code: 'NOTFOUND', cartTotal: 100 } };
      await validateCoupon(req, mockRes);

      expect(CouponModel.findByCode).toHaveBeenCalledWith('NOTFOUND');
      expect(mockRes.status).toHaveBeenCalledWith(404);
      expect(mockRes.json).toHaveBeenCalledWith({
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
      await validateCoupon(req, mockRes);

      expect(mockRes.status).toHaveBeenCalledWith(400);
      expect(mockRes.json).toHaveBeenCalledWith({
        success: false,
        error: 'This coupon code is currently disabled'
      });
    });

    test('should return 400 if promotion has not started yet', async () => {
      const futureDate = new Date(Date.now() + 86400000);
      jest.spyOn(CouponModel, 'findByCode').mockResolvedValue({
        code: 'FUTURE',
        isActive: true,
        validFrom: futureDate
      });

      const req = { body: { code: 'FUTURE', cartTotal: 100 } };
      await validateCoupon(req, mockRes);

      expect(mockRes.status).toHaveBeenCalledWith(400);
      expect(mockRes.json).toHaveBeenCalledWith({
        success: false,
        error: 'This coupon promotion has not started yet'
      });
    });

    test('should return 400 if coupon is expired', async () => {
      const pastDate = new Date(Date.now() - 86400000);
      jest.spyOn(CouponModel, 'findByCode').mockResolvedValue({
        code: 'EXPIRED',
        isActive: true,
        validUntil: pastDate
      });

      const req = { body: { code: 'EXPIRED', cartTotal: 100 } };
      await validateCoupon(req, mockRes);

      expect(mockRes.status).toHaveBeenCalledWith(400);
      expect(mockRes.json).toHaveBeenCalledWith({
        success: false,
        error: 'This coupon has expired'
      });
    });

    test('should return 400 if max global usage limit is reached', async () => {
      jest.spyOn(CouponModel, 'findByCode').mockResolvedValue({
        code: 'MAXED',
        isActive: true,
        maxUsageLimit: 10,
        currentUsage: 10
      });

      const req = { body: { code: 'MAXED', cartTotal: 100 } };
      await validateCoupon(req, mockRes);

      expect(mockRes.status).toHaveBeenCalledWith(400);
      expect(mockRes.json).toHaveBeenCalledWith({
        success: false,
        error: 'This coupon has reached its maximum global usage limit'
      });
    });

    test('should return 400 if cart total is below min order amount', async () => {
      jest.spyOn(CouponModel, 'findByCode').mockResolvedValue({
        code: 'MINORDER',
        isActive: true,
        minOrderAmount: 50.00
      });

      const req = { body: { code: 'MINORDER', cartTotal: 30 } };
      await validateCoupon(req, mockRes);

      expect(mockRes.status).toHaveBeenCalledWith(400);
      expect(mockRes.json).toHaveBeenCalledWith({
        success: false,
        error: 'Minimum order amount of $50.00 required to use this coupon'
      });
    });

    test('should return 400 if per-user redemption limit is reached', async () => {
      jest.spyOn(CouponModel, 'findByCode').mockResolvedValue({
        id: 'cpn_1',
        code: 'USERLIMIT',
        isActive: true,
        perUserLimit: 1
      });
      jest.spyOn(CouponModel, 'getUserUsageCount').mockResolvedValue(1);

      const req = { user: { id: 'usr_1' }, body: { code: 'USERLIMIT', cartTotal: 100 } };
      await validateCoupon(req, mockRes);

      expect(CouponModel.getUserUsageCount).toHaveBeenCalledWith('cpn_1', 'usr_1');
      expect(mockRes.status).toHaveBeenCalledWith(400);
      expect(mockRes.json).toHaveBeenCalledWith({
        success: false,
        error: 'You have exceeded the maximum redemptions for this coupon'
      });
    });

    test('should calculate percentage discount with max cap correctly', async () => {
      jest.spyOn(CouponModel, 'findByCode').mockResolvedValue({
        code: 'PERCENT20',
        isActive: true,
        discountType: 'percent',
        discountValue: 20,
        maxDiscountCap: 15
      });

      const req = { body: { code: 'percent20', cartTotal: 100 } };
      await validateCoupon(req, mockRes);

      expect(mockRes.status).toHaveBeenCalledWith(200);
      expect(mockRes.json).toHaveBeenCalledWith({
        success: true,
        data: {
          code: 'PERCENT20',
          discountType: 'percent',
          discountValue: 20,
          discountAmount: 15,
          originalTotal: 100,
          discountedTotal: 85
        }
      });
    });

    test('should calculate fixed amount discount correctly', async () => {
      jest.spyOn(CouponModel, 'findByCode').mockResolvedValue({
        code: 'FLAT15',
        isActive: true,
        discountType: 'amount',
        discountValue: 15
      });

      const req = { body: { code: 'FLAT15', cartTotal: 10, userId: 'usr_2' } };
      await validateCoupon(req, mockRes);

      expect(mockRes.status).toHaveBeenCalledWith(200);
      expect(mockRes.json).toHaveBeenCalledWith({
        success: true,
        data: {
          code: 'FLAT15',
          discountType: 'amount',
          discountValue: 15,
          discountAmount: 10,
          originalTotal: 10,
          discountedTotal: 0
        }
      });
    });

    test('should catch and handle errors with 500 status', async () => {
      jest.spyOn(CouponModel, 'findByCode').mockRejectedValue(new Error('DB Connection Error'));

      const req = { body: { code: 'ERROR' } };
      await validateCoupon(req, mockRes);

      expect(mockRes.status).toHaveBeenCalledWith(500);
      expect(mockRes.json).toHaveBeenCalledWith({
        success: false,
        error: 'Failed to validate coupon code',
        details: 'DB Connection Error'
      });
    });
  });

  describe('createCoupon', () => {
    const validPayload = {
      code: 'WELCOME10',
      discountType: 'percent',
      discountValue: 10,
      validUntil: '2030-12-31T23:59:59.000Z'
    };

    test('should return 400 if code is missing or not a string', async () => {
      const req = { body: { ...validPayload, code: null } };
      await createCoupon(req, mockRes);

      expect(mockRes.status).toHaveBeenCalledWith(400);
      expect(mockRes.json).toHaveBeenCalledWith({
        success: false,
        error: 'Coupon code is required'
      });
    });

    test('should return 400 if code fails character/length regex format', async () => {
      const req = { body: { ...validPayload, code: 'A!' } };
      await createCoupon(req, mockRes);

      expect(mockRes.status).toHaveBeenCalledWith(400);
      expect(mockRes.json).toHaveBeenCalledWith({
        success: false,
        error: 'Coupon code must be 3-20 uppercase alphanumeric characters'
      });
    });

    test('should return 400 if discountType is invalid', async () => {
      const req = { body: { ...validPayload, discountType: 'invalid_type' } };
      await createCoupon(req, mockRes);

      expect(mockRes.status).toHaveBeenCalledWith(400);
      expect(mockRes.json).toHaveBeenCalledWith({
        success: false,
        error: 'discountType must be either "percent" or "amount"'
      });
    });

    test('should return 400 if discountValue is not positive', async () => {
      const req = { body: { ...validPayload, discountValue: -5 } };
      await createCoupon(req, mockRes);

      expect(mockRes.status).toHaveBeenCalledWith(400);
      expect(mockRes.json).toHaveBeenCalledWith({
        success: false,
        error: 'discountValue must be a positive number'
      });
    });

    test('should return 400 if percent discountValue exceeds 100', async () => {
      const req = { body: { ...validPayload, discountType: 'percent', discountValue: 105 } };
      await createCoupon(req, mockRes);

      expect(mockRes.status).toHaveBeenCalledWith(400);
      expect(mockRes.json).toHaveBeenCalledWith({
        success: false,
        error: 'Percentage discount cannot exceed 100%'
      });
    });

    test('should return 400 if validUntil date is invalid or missing', async () => {
      const req = { body: { ...validPayload, validUntil: 'invalid-date' } };
      await createCoupon(req, mockRes);

      expect(mockRes.status).toHaveBeenCalledWith(400);
      expect(mockRes.json).toHaveBeenCalledWith({
        success: false,
        error: 'A valid validUntil expiration date is required'
      });
    });

    test('should return 409 if coupon code already exists', async () => {
      jest.spyOn(CouponModel, 'findByCode').mockResolvedValue({ id: 'existing_1', code: 'WELCOME10' });

      const req = { body: validPayload };
      await createCoupon(req, mockRes);

      expect(CouponModel.findByCode).toHaveBeenCalledWith('WELCOME10');
      expect(mockRes.status).toHaveBeenCalledWith(409);
      expect(mockRes.json).toHaveBeenCalledWith({
        success: false,
        error: 'Coupon with code "WELCOME10" already exists'
      });
    });

    test('should successfully create coupon and return 201', async () => {
      jest.spyOn(CouponModel, 'findByCode').mockResolvedValue(null);
      const mockCreatedCoupon = { id: 'cpn_123', code: 'WELCOME10', isActive: true };
      jest.spyOn(CouponModel, 'create').mockResolvedValue(mockCreatedCoupon);

      const req = { body: validPayload };
      await createCoupon(req, mockRes);

      expect(CouponModel.create).toHaveBeenCalled();
      expect(mockRes.status).toHaveBeenCalledWith(201);
      expect(mockRes.json).toHaveBeenCalledWith({
        success: true,
        message: 'Coupon created successfully',
        data: mockCreatedCoupon
      });
    });

    test('should catch and handle errors with 500 status', async () => {
      jest.spyOn(CouponModel, 'findByCode').mockRejectedValue(new Error('Create error'));

      const req = { body: validPayload };
      await createCoupon(req, mockRes);

      expect(mockRes.status).toHaveBeenCalledWith(500);
      expect(mockRes.json).toHaveBeenCalledWith({
        success: false,
        error: 'Failed to create coupon',
        details: 'Create error'
      });
    });
  });

  describe('CouponModel Mock Implementation Coverage', () => {
    test('default CouponModel.findByCode should resolve to null', async () => {
      const res = await CouponModel.findByCode('TEST');
      expect(res).toBeNull();
    });

    test('default CouponModel.getUserUsageCount should resolve to 0', async () => {
      const res = await CouponModel.getUserUsageCount('cpn_1', 'user_1');
      expect(res).toBe(0);
    });

    test('default CouponModel.create should return created payload with id', async () => {
      const data = { code: 'MOCK' };
      const res = await CouponModel.create(data);
      expect(res).toHaveProperty('id');
      expect(res.code).toBe('MOCK');
    });
  });
});