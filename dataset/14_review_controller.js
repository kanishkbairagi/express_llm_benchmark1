// 14_review_controller.js - Product Ratings & Average Calculation

// Mock Database Models
export const ProductCatalog = {
  findById: async (id) => null,
  updateStats: async (id, stats) => ({ id, ...stats })
};

export const ReviewModel = {
  findOne: async (query) => null,
  create: async (data) => ({ id: `rev_${Date.now()}`, ...data, createdAt: new Date() }),
  findByProductId: async (productId, options) => ({ reviews: [], total: 0 }),
  calculateRatingStats: async (productId) => ({
    averageRating: 0,
    totalReviews: 0,
    distribution: { 1: 0, 2: 0, 3: 0, 4: 0, 5: 0 }
  })
};

export const addReview = async (req, res) => {
  try {
    const { productId } = req.params || {};
    const { rating, title, comment } = req.body || {};
    const userId = req.user?.id || req.body?.userId;

    if (!userId) {
      return res.status(401).json({ success: false, error: 'Authentication required' });
    }

    if (!productId) {
      return res.status(400).json({ success: false, error: 'Product ID is required' });
    }

    const numericRating = Number(rating);
    if (!Number.isInteger(numericRating) || numericRating < 1 || numericRating > 5) {
      return res.status(400).json({
        success: false,
        error: 'Rating must be an integer between 1 and 5'
      });
    }

    if (!title || typeof title !== 'string' || title.trim().length === 0) {
      return res.status(400).json({ success: false, error: 'Review title is required' });
    }

    if (!comment || typeof comment !== 'string' || comment.trim().length < 10) {
      return res.status(400).json({
        success: false,
        error: 'Review comment must be at least 10 characters long'
      });
    }

    const product = await ProductCatalog.findById(productId);
    if (!product) {
      return res.status(404).json({ success: false, error: 'Product not found' });
    }

    const existingReview = await ReviewModel.findOne({ productId, userId });
    if (existingReview) {
      return res.status(409).json({
        success: false,
        error: 'You have already submitted a review for this product'
      });
    }

    const newReview = await ReviewModel.create({
      productId,
      userId,
      rating: numericRating,
      title: title.trim(),
      comment: comment.trim()
    });

    const updatedStats = await ReviewModel.calculateRatingStats(productId);
    await ProductCatalog.updateStats(productId, {
      averageRating: updatedStats.averageRating,
      totalReviews: updatedStats.totalReviews
    });

    return res.status(201).json({
      success: true,
      message: 'Review submitted successfully',
      data: {
        review: newReview,
        productStats: updatedStats
      }
    });
  } catch (error) {
    return res.status(500).json({
      success: false,
      error: 'Failed to submit review',
      details: error.message
    });
  }
};

export const getProductReviews = async (req, res) => {
  try {
    const { productId } = req.params || {};
    const { page = 1, limit = 10, minRating } = req.query || {};

    if (!productId) {
      return res.status(400).json({ success: false, error: 'Product ID is required' });
    }

    const pageNum = parseInt(page, 10);
    const limitNum = parseInt(limit, 10);

    if (isNaN(pageNum) || pageNum < 1 || isNaN(limitNum) || limitNum < 1 || limitNum > 50) {
      return res.status(400).json({
        success: false,
        error: 'Invalid pagination parameters: page >= 1, 1 <= limit <= 50'
      });
    }

    const filters = {};
    if (minRating !== undefined) {
      const parsedRating = parseInt(minRating, 10);
      if (isNaN(parsedRating) || parsedRating < 1 || parsedRating > 5) {
        return res.status(400).json({ success: false, error: 'minRating must be an integer between 1 and 5' });
      }
      filters.minRating = parsedRating;
    }

    const stats = await ReviewModel.calculateRatingStats(productId);
    const { reviews, total } = await ReviewModel.findByProductId(productId, {
      page: pageNum,
      limit: limitNum,
      filters
    });

    return res.status(200).json({
      success: true,
      data: {
        stats,
        pagination: {
          totalReviews: total,
          currentPage: pageNum,
          totalPages: Math.ceil(total / limitNum) || 1
        },
        reviews
      }
    });
  } catch (error) {
    return res.status(500).json({
      success: false,
      error: 'Failed to retrieve product reviews',
      details: error.message
    });
  }
};
