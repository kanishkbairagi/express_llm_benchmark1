import { jest } from '@jest/globals';
import {
  addReview,
  getProductReviews,
  ProductCatalog,
  ReviewModel
} from '../dataset/14_review_controller.js';

describe('addReview controller', () => {
  const makeRes = () => ({
    status: jest.fn().mockReturnThis(),
    json: jest.fn()
  });

  beforeEach(() => {
    jest.clearAllMocks();
    // Default successful mocks
    ProductCatalog.findById = jest.fn().mockResolvedValue({ id: 'prod_1' });
    ProductCatalog.updateStats = jest.fn().mockResolvedValue({});
    ReviewModel.findOne = jest.fn().mockResolvedValue(null);
    ReviewModel.create = jest.fn().mockImplementation(async (data) => ({
      id: 'rev_123',
      ...data,
      createdAt: new Date()
    }));
    ReviewModel.calculateRatingStats = jest.fn().mockResolvedValue({
      averageRating: 4.2,
      totalReviews: 10,
      distribution: { 1: 1, 2: 0, 3: 2, 4: 3, 5: 4 }
    });
  });

  test('returns 401 when user is not authenticated', async () => {
    const req = { params: { productId: 'p1' }, body: { rating: 5, title: 'Great', comment: 'Nice product indeed' } };
    const res = makeRes();

    await addReview(req, res);

    expect(res.status).toHaveBeenCalledWith(401);
    expect(res.json).toHaveBeenCalledWith({
      success: false,
      error: 'Authentication required'
    });
  });

  test('returns 400 when productId is missing', async () => {
    const req = { params: {}, body: { rating: 5, title: 'Great', comment: 'Nice product indeed' }, user: { id: 'u1' } };
    const res = makeRes();

    await addReview(req, res);

    expect(res.status).toHaveBeenCalledWith(400);
    expect(res.json).toHaveBeenCalledWith({
      success: false,
      error: 'Product ID is required'
    });
  });

  test('returns 400 for invalid rating', async () => {
    const req = {
      params: { productId: 'p1' },
      body: { rating: 6, title: 'Great', comment: 'Nice product indeed' },
      user: { id: 'u1' }
    };
    const res = makeRes();

    await addReview(req, res);

    expect(res.status).toHaveBeenCalledWith(400);
    expect(res.json).toHaveBeenCalledWith({
      success: false,
      error: 'Rating must be an integer between 1 and 5'
    });
  });

  test('returns 400 when title is missing or empty', async () => {
    const req = {
      params: { productId: 'p1' },
      body: { rating: 4, title: '   ', comment: 'Enough characters for comment' },
      user: { id: 'u1' }
    };
    const res = makeRes();

    await addReview(req, res);

    expect(res.status).toHaveBeenCalledWith(400);
    expect(res.json).toHaveBeenCalledWith({
      success: false,
      error: 'Review title is required'
    });
  });

  test('returns 400 when comment is too short', async () => {
    const req = {
      params: { productId: 'p1' },
      body: { rating: 4, title: 'Nice', comment: 'short' },
      user: { id: 'u1' }
    };
    const res = makeRes();

    await addReview(req, res);

    expect(res.status).toHaveBeenCalledWith(400);
    expect(res.json).toHaveBeenCalledWith({
      success: false,
      error: 'Review comment must be at least 10 characters long'
    });
  });

  test('returns 404 when product does not exist', async () => {
    ProductCatalog.findById = jest.fn().mockResolvedValue(null);
    const req = {
      params: { productId: 'missing' },
      body: { rating: 5, title: 'Great', comment: 'Valid comment length' },
      user: { id: 'u1' }
    };
    const res = makeRes();

    await addReview(req, res);

    expect(res.status).toHaveBeenCalledWith(404);
    expect(res.json).toHaveBeenCalledWith({
      success: false,
      error: 'Product not found'
    });
  });

  test('returns 409 when user already reviewed the product', async () => {
    ReviewModel.findOne = jest.fn().mockResolvedValue({ id: 'rev_existing' });
    const req = {
      params: { productId: 'p1' },
      body: { rating: 5, title: 'Great', comment: 'Valid comment length' },
      user: { id: 'u1' }
    };
    const res = makeRes();

    await addReview(req, res);

    expect(res.status).toHaveBeenCalledWith(409);
    expect(res.json).toHaveBeenCalledWith({
      success: false,
      error: 'You have already submitted a review for this product'
    });
  });

  test('successful review creation returns 201 with data', async () => {
    const req = {
      params: { productId: 'p1' },
      body: { rating: '5', title: 'Excellent', comment: 'Really liked this product, it works great!' },
      user: { id: 'u1' }
    };
    const res = makeRes();

    await addReview(req, res);

    expect(ProductCatalog.findById).toHaveBeenCalledWith('p1');
    expect(ReviewModel.findOne).toHaveBeenCalledWith({ productId: 'p1', userId: 'u1' });
    expect(ReviewModel.create).toHaveBeenCalledWith({
      productId: 'p1',
      userId: 'u1',
      rating: 5,
      title: 'Excellent',
      comment: 'Really liked this product, it works great!'
    });
    expect(ReviewModel.calculateRatingStats).toHaveBeenCalledWith('p1');
    expect(ProductCatalog.updateStats).toHaveBeenCalledWith('p1', {
      averageRating: 4.2,
      totalReviews: 10
    });

    expect(res.status).toHaveBeenCalledWith(201);
    expect(res.json).toHaveBeenCalledWith({
      success: true,
      message: 'Review submitted successfully',
      data: {
        review: expect.objectContaining({
          id: expect.any(String),
          productId: 'p1',
          userId: 'u1',
          rating: 5,
          title: 'Excellent',
          comment: 'Really liked this product, it works great!',
          createdAt: expect.any(Date)
        }),
        productStats: {
          averageRating: 4.2,
          totalReviews: 10,
          distribution: { 1: 1, 2: 0, 3: 2, 4: 3, 5: 4 }
        }
      }
    });
  });

  test('catches unexpected errors and returns 500', async () => {
    const err = new Error('DB failure');
    ProductCatalog.findById = jest.fn().mockRejectedValue(err);
    const req = {
      params: { productId: 'p1' },
      body: { rating: 5, title: 'Great', comment: 'Valid comment length' },
      user: { id: 'u1' }
    };
    const res = makeRes();

    await addReview(req, res);

    expect(res.status).toHaveBeenCalledWith(500);
    expect(res.json).toHaveBeenCalledWith({
      success: false,
      error: 'Failed to submit review',
      details: err.message
    });
  });
});

describe('getProductReviews controller', () => {
  const makeRes = () => ({
    status: jest.fn().mockReturnThis(),
    json: jest.fn()
  });

  beforeEach(() => {
    jest.clearAllMocks();
    ReviewModel.calculateRatingStats = jest.fn().mockResolvedValue({
      averageRating: 4.0,
      totalReviews: 20,
      distribution: { 1: 2, 2: 1, 3: 3, 4: 5, 5: 9 }
    });
    ReviewModel.findByProductId = jest.fn().mockResolvedValue({
      reviews: [{ id: 'rev1', rating: 5, title: 'Good', comment: 'Excellent product' }],
      total: 1
    });
  });

  test('returns 400 when productId is missing', async () => {
    const req = { params: {}, query: {} };
    const res = makeRes();

    await getProductReviews(req, res);

    expect(res.status).toHaveBeenCalledWith(400);
    expect(res.json).toHaveBeenCalledWith({
      success: false,
      error: 'Product ID is required'
    });
  });

  test('returns 400 for invalid pagination parameters', async () => {
    const req = { params: { productId: 'p1' }, query: { page: '0', limit: '0' } };
    const res = makeRes();

    await getProductReviews(req, res);

    expect(res.status).toHaveBeenCalledWith(400);
    expect(res.json).toHaveBeenCalledWith({
      success: false,
      error: 'Invalid pagination parameters: page >= 1, 1 <= limit <= 50'
    });
  });

  test('returns 400 when limit exceeds maximum', async () => {
    const req = { params: { productId: 'p1' }, query: { page: '1', limit: '100' } };
    const res = makeRes();

    await getProductReviews(req, res);

    expect(res.status).toHaveBeenCalledWith(400);
    expect(res.json).toHaveBeenCalledWith({
      success: false,
      error: 'Invalid pagination parameters: page >= 1, 1 <= limit <= 50'
    });
  });

  test('returns 400 when minRating is invalid', async () => {
    const req = { params: { productId: 'p1' }, query: { minRating: '6' } };
    const res = makeRes();

    await getProductReviews(req, res);

    expect(res.status).toHaveBeenCalledWith(400);
    expect(res.json).toHaveBeenCalledWith({
      success: false,
      error: 'minRating must be an integer between 1 and 5'
    });
  });

  test('successful retrieval returns 200 with stats and pagination', async () => {
    const req = {
      params: { productId: 'p1' },
      query: { page: '2', limit: '5', minRating: '3' }
    };
    const res = makeRes();

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
        stats: {
          averageRating: 4.0,
          totalReviews: 20,
          distribution: { 1: 2, 2: 1, 3: 3, 4: 5, 5: 9 }
        },
        pagination: {
          totalReviews: 1,
          currentPage: 2,
          totalPages: 1
        },
        reviews: [{ id: 'rev1', rating: 5, title: 'Good', comment: 'Excellent product' }]
      }
    });
  });

  test('catches unexpected errors and returns 500', async () => {
    const err = new Error('Unexpected');
    ReviewModel.calculateRatingStats = jest.fn().mockRejectedValue(err);
    const req = { params: { productId: 'p1' }, query: {} };
    const res = makeRes();

    await getProductReviews(req, res);

    expect(res.status).toHaveBeenCalledWith(500);
    expect(res.json).toHaveBeenCalledWith({
      success: false,
      error: 'Failed to retrieve product reviews',
      details: err.message
    });
  });
});