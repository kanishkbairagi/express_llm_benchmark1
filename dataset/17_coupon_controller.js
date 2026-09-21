// 17_coupon_controller.js - Promo Code Validation & Expiry Checks

// Mock Database Model
export const CouponModel = {
  findByCode: async (code) => null,
  create: async (data) => ({ id: `cpn_${Date.now()}`, ...data, createdAt: new Date() }),
  getUserUsageCount: async (couponId, userId) => 0
};

export const validateCoupon = async (req, res) => {
  try {
    const { code, cartTotal = 0 } = req.body || {};
    const userId = req.user?.id || req.body?.userId;

    if (!code || typeof code !== 'string') {
      return res.status(400).json({
        success: false,
        error: 'Coupon code is required'
      });
    }

    const total = parseFloat(cartTotal);
    if (isNaN(total) || total < 0) {
      return res.status(400).json({
        success: false,
        error: 'cartTotal must be a non-negative number'
      });
    }

    const coupon = await CouponModel.findByCode(code.toUpperCase().trim());
    if (!coupon) {
      return res.status(404).json({
        success: false,
        error: 'Coupon code not found'
      });
    }

    if (!coupon.isActive) {
      return res.status(400).json({
        success: false,
        error: 'This coupon code is currently disabled'
      });
    }

    const now = new Date();

    if (coupon.validFrom && new Date(coupon.validFrom) > now) {
      return res.status(400).json({
        success: false,
        error: 'This coupon promotion has not started yet'
      });
    }

    if (coupon.validUntil && new Date(coupon.validUntil) < now) {
      return res.status(400).json({
        success: false,
        error: 'This coupon has expired'
      });
    }

    if (coupon.maxUsageLimit && coupon.currentUsage >= coupon.maxUsageLimit) {
      return res.status(400).json({
        success: false,
        error: 'This coupon has reached its maximum global usage limit'
      });
    }

    if (coupon.minOrderAmount && total < coupon.minOrderAmount) {
      return res.status(400).json({
        success: false,
        error: `Minimum order amount of $${coupon.minOrderAmount.toFixed(2)} required to use this coupon`
      });
    }

    if (userId && coupon.perUserLimit) {
      const userUsage = await CouponModel.getUserUsageCount(coupon.id, userId);
      if (userUsage >= coupon.perUserLimit) {
        return res.status(400).json({
          success: false,
          error: 'You have exceeded the maximum redemptions for this coupon'
        });
      }
    }

    let discountAmount = 0;
    if (coupon.discountType === 'percent') {
      discountAmount = (total * coupon.discountValue) / 100;
      if (coupon.maxDiscountCap && discountAmount > coupon.maxDiscountCap) {
        discountAmount = coupon.maxDiscountCap;
      }
    } else if (coupon.discountType === 'amount') {
      discountAmount = Math.min(total, coupon.discountValue);
    }

    const newTotal = Math.max(0, total - discountAmount);

    return res.status(200).json({
      success: true,
      data: {
        code: coupon.code,
        discountType: coupon.discountType,
        discountValue: coupon.discountValue,
        discountAmount: parseFloat(discountAmount.toFixed(2)),
        originalTotal: total,
        discountedTotal: parseFloat(newTotal.toFixed(2))
      }
    });
  } catch (error) {
    return res.status(500).json({
      success: false,
      error: 'Failed to validate coupon code',
      details: error.message
    });
  }
};

export const createCoupon = async (req, res) => {
  try {
    const {
      code,
      discountType,
      discountValue,
      validFrom,
      validUntil,
      minOrderAmount = 0,
      maxUsageLimit = 100,
      perUserLimit = 1
    } = req.body || {};

    if (!code || typeof code !== 'string') {
      return res.status(400).json({ success: false, error: 'Coupon code is required' });
    }

    const cleanCode = code.toUpperCase().trim();
    if (!/^[A-Z0-9_-]{3,20}$/.test(cleanCode)) {
      return res.status(400).json({
        success: false,
        error: 'Coupon code must be 3-20 uppercase alphanumeric characters'
      });
    }

    if (!['percent', 'amount'].includes(discountType)) {
      return res.status(400).json({
        success: false,
        error: 'discountType must be either "percent" or "amount"'
      });
    }

    const numericValue = parseFloat(discountValue);
    if (isNaN(numericValue) || numericValue <= 0) {
      return res.status(400).json({
        success: false,
        error: 'discountValue must be a positive number'
      });
    }

    if (discountType === 'percent' && numericValue > 100) {
      return res.status(400).json({
        success: false,
        error: 'Percentage discount cannot exceed 100%'
      });
    }

    if (!validUntil || isNaN(new Date(validUntil).getTime())) {
      return res.status(400).json({
        success: false,
        error: 'A valid validUntil expiration date is required'
      });
    }

    const existing = await CouponModel.findByCode(cleanCode);
    if (existing) {
      return res.status(409).json({
        success: false,
        error: `Coupon with code "${cleanCode}" already exists`
      });
    }

    const newCoupon = await CouponModel.create({
      code: cleanCode,
      discountType,
      discountValue: numericValue,
      validFrom: validFrom ? new Date(validFrom) : new Date(),
      validUntil: new Date(validUntil),
      minOrderAmount: parseFloat(minOrderAmount) || 0,
      maxUsageLimit: parseInt(maxUsageLimit, 10) || 100,
      perUserLimit: parseInt(perUserLimit, 10) || 1,
      currentUsage: 0,
      isActive: true
    });

    return res.status(201).json({
      success: true,
      message: 'Coupon created successfully',
      data: newCoupon
    });
  } catch (error) {
    return res.status(500).json({
      success: false,
      error: 'Failed to create coupon',
      details: error.message
    });
  }
};
