import { jest } from '@jest/globals';
import {
  addReview,
  getProductReviews,
  ProductCatalog,
  ReviewModel
} from '../dataset/14_review_controller.js';

const mockRes = () => {
  const res = {};
  res.status = jest.fn().mockReturnValue(res);
  res.json = jest.fn().mockReturnValue(res);
  return res;
};

describe('addReview controller', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  test('returns 401 when user is not authenticated', async () => {
    const req = { params: { productId: 'p1' }, body: { rating: 5, title: 'Great', comment: 'Nice product' } };
    const res = mockRes();

    await addReview(req, res);

    expect(res.status).toHaveBeenCalledWith(401);
    expect(res.json).toHaveBeenCalledWith({ success: false, error: 'Authentication required' });
  });

  test('returns 400 when productId is missing', async () => {
    const req = { user: { id: 'u1' }, body: { rating: 5, title: 'Great', comment: 'Nice product' } };
    const res = mockRes();

    await addReview(req, res);

    expect(res.status).toHaveBeenCalledWith(400);
    expect(res.json).toHaveBeenCalledWith({ success: false, error: 'Product ID is required' });
  });

  test('returns 400 for invalid rating', async () => {
    const req = {
      params: { productId: 'p1' },
      user: { id: 'u1' },
      body: { rating: 6, title: 'Great', comment: 'Nice product' }
    };
    const res = mockRes();

    await addReview(req, res);

    expect(res.status).toHaveBeenCalledWith(400);
    expect(res.json).toHaveBeenCalledWith({
      success: false,
      error: 'Rating must be an integer between 1 and 5'
    });
  });

  test('returns 400 when title is empty', async () => {
    const req = {
      params: { productId: 'p1' },
      user: { id: 'u1' },
      body: { rating: 4, title: '   ', comment: 'Valid comment with enough length' }
    };
    const res = mockRes();

    await addReview(req, res);

    expect(res.status).toHaveBeenCalledWith(400);
    expect(res.json).toHaveBeenCalledWith({ success: false, error: 'Review title is required' });
  });

  test('returns 400 when comment is too short', async () => {
    const req = {
      params: { productId: 'p1' },
      user: { id: 'u1' },
      body: { rating: 3, title: 'Ok', comment: 'short' }
    };
    const res = mockRes();

    await addReview(req, res);

    expect(res.status).toHaveBeenCalledWith(400);
    expect(res.json).toHaveBeenCalledWith({
      success: false,
      error: 'Review comment must be at least 10 characters long'
    });
  });

  test('returns 404 when product does not exist', async () => {
    const req = {
      params: { productId: 'missing' },
      user: { id: 'u1' },
      body: { rating: 5, title: 'Good', comment: 'This is a sufficient comment' }
    };
    const res = mockRes();

    jest.spyOn(ProductCatalog, 'findById').mockResolvedValue(null);

    await addReview(req, res);

    expect(ProductCatalog.findById).toHaveBeenCalledWith('missing');
    expect(res.status).toHaveBeenCalledWith(404);
    expect(res.json).toHaveBeenCalledWith({ success: false, error: 'Product not found' });
  });

  test('returns 409 when user already reviewed the product', async () => {
    const req = {
      params: { productId: 'p1' },
      user: { id: 'u1' },
      body: { rating: 4, title: 'Nice', comment: 'Valid comment longer than ten chars' }
    };
    const res = mockRes();

    jest.spyOn(ProductCatalog, 'findById').mockResolvedValue({ id: 'p1' });
    jest.spyOn(ReviewModel, 'findOne').mockResolvedValue({ id: 'rev123' });

    await addReview(req, res);

    expect(ReviewModel.findOne).toHaveBeenCalledWith({ productId: 'p1', userId: 'u1' });
    expect(res.status).toHaveBeenCalledWith(409);
    expect(res.json).toHaveBeenCalledWith({
      success: false,
      error: 'You have already submitted a review for this product'
    });
  });

  test('successfully creates a review and returns 201', async () => {
    const req = {
      params: { productId: 'p1' },
      user: { id: 'u1' },
      body: {
        rating: '5',
        title: 'Excellent product',
        comment: 'I really liked this product, it works perfectly!'
      }
    };
    const res = mockRes();

    const fakeReview = { id: 'rev_123', productId: 'p1', userId: 'u1', rating: 5 };
    const fakeStats = { averageRating: 4.5, totalReviews: 10 };

    jest.spyOn(ProductCatalog, 'findById').mockResolvedValue({ id: 'p1' });
    jest.spyOn(ReviewModel, 'findOne').mockResolvedValue(null);
    jest.spyOn(ReviewModel, 'create').mockResolvedValue(fakeReview);
    jest.spyOn(ReviewModel, 'calculateRatingStats').mockResolvedValue(fakeStats);
    jest.spyOn(ProductCatalog, 'updateStats').mockResolvedValue({ id: 'p1', ...fakeStats });

    await addReview(req, res);

    expect(ReviewModel.create).toHaveBeenCalledWith({
      productId: 'p1',
      userId: 'u1',
      rating: 5,
      title: 'Excellent product',
      comment: 'I really liked this product, it works perfectly!'
    });
    expect(ReviewModel.calculateRatingStats).toHaveBeenCalledWith('p1');
    expect(ProductCatalog.updateStats).toHaveBeenCalledWith('p1', {
      averageRating: fakeStats.averageRating,
      totalReviews: fakeStats.totalReviews
    });
    expect(res.status).toHaveBeenCalledWith(201);
    expect(res.json).toHaveBeenCalledWith({
      success: true,
      message: 'Review submitted successfully',
      data: {
        review: fakeReview,
        productStats: fakeStats
      }
    });
  });
});

describe('getProductReviews controller', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  test('returns 400 when productId is missing', async () => {
    const req = { query: {} };
    const res = mockRes();

    await getProductReviews(req, res);

    expect(res.status).toHaveBeenCalledWith(400);
    expect(res.json).toHaveBeenCalledWith({ success: false, error: 'Product ID is required' });
  });

  test('returns 400 for invalid pagination parameters', async () => {
    const req = { params: { productId: 'p1' }, query: { page: '0', limit: '100' } };
    const res = mockRes();

    await getProductReviews(req, res);

    expect(res.status).toHaveBeenCalledWith(400);
    expect(res.json).toHaveBeenCalledWith({
      success: false,
      error: 'Invalid pagination parameters: page >= 1, 1 <= limit <= 50'
    });
  });

  test('returns 400 for invalid minRating', async () => {
    const req = { params: { productId: 'p1' }, query: { minRating: '6' } };
    const res = mockRes();

    await getProductReviews(req, res);

    expect(res.status).toHaveBeenCalledWith(400);
    expect(res.json).toHaveBeenCalledWith({
      success: false,
      error: 'minRating must be an integer between 1 and 5'
    });
  });

  test('successfully returns reviews with pagination', async () => {
    const req = {
      params: { productId: 'p1' },
      query: { page: '2', limit: '5', minRating: '3' }
    };
    const res = mockRes();

    const fakeStats = {
      averageRating: 4.2,
      totalReviews: 12,
      distribution: { 1: 0, 2: 1, 3: 2, 4: 3, 5: 6 }
    };
    const fakeReviews = [
      { id: 'r1', rating: 5, title: 'A', comment: '...' },
      { id: 'r2', rating: 4, title: 'B', comment: '...' }
    ];
    const totalReviews = 12;

    jest.spyOn(ReviewModel, 'calculateRatingStats').mockResolvedValue(fakeStats);
    jest.spyOn(ReviewModel, 'findByProductId').mockResolvedValue({
      reviews: fakeReviews,
      total: totalReviews
    });

    await getProductReviews(req, res);

    expect(ReviewModel.calculateRatingStats).toHaveBeenCalledWith('p1');
    expect(ReviewModel.findByProductId).toHaveBeenCalledWith('p1', {
      page: 2,
      limit: 5,
      filters: { minRating: 3 }
    });
    expect(res.status).toHaveBeenCalledWith(200);
    expect(res.json).toHaveBeenCalledWith({
      success: true,
      data: {
        stats: fakeStats,
        pagination: {
          totalReviews,
          currentPage: 2,
          totalPages: Math.ceil(totalReviews / 5)
        },
        reviews: fakeReviews
      }
    });
  });
});