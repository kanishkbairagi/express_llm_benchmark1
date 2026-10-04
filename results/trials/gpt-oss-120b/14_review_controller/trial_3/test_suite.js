import { jest } from '@jest/globals';
import {
  addReview,
  getProductReviews,
  ProductCatalog,
  ReviewModel
} from '../dataset/14_review_controller.js';

describe('addReview controller', () => {
  const mockRes = () => {
    const json = jest.fn();
    const status = jest.fn(() => ({ json }));
    return { status, json };
  };

  beforeEach(() => {
    jest.clearAllMocks();
    // default successful mocks
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
      totalReviews: 5,
      distribution: { 1: 0, 2: 0, 3: 1, 4: 2, 5: 2 }
    });
  });

  test('returns 401 when user is not authenticated', async () => {
    const req = { params: { productId: 'prod_1' }, body: {} };
    const res = mockRes();

    await addReview(req, res);

    expect(res.status).toHaveBeenCalledWith(401);
    expect(res.status().json).toHaveBeenCalledWith({
      success: false,
      error: 'Authentication required'
    });
  });

  test('returns 400 when productId is missing', async () => {
    const req = { params: {}, body: { rating: 5, title: 'Great', comment: 'Nice product', userId: 'u1' } };
    const res = mockRes();

    await addReview(req, res);

    expect(res.status).toHaveBeenCalledWith(400);
    expect(res.status().json).toHaveBeenCalledWith({
      success: false,
      error: 'Product ID is required'
    });
  });

  test('returns 400 for invalid rating values', async () => {
    const req = {
      params: { productId: 'prod_1' },
      body: { rating: 6, title: 'Title', comment: 'Valid comment length', userId: 'u1' }
    };
    const res = mockRes();

    await addReview(req, res);

    expect(res.status).toHaveBeenCalledWith(400);
    expect(res.status().json).toHaveBeenCalledWith({
      success: false,
      error: 'Rating must be an integer between 1 and 5'
    });
  });

  test('returns 400 when title is empty', async () => {
    const req = {
      params: { productId: 'prod_1' },
      body: { rating: 4, title: '   ', comment: 'Valid comment length', userId: 'u1' }
    };
    const res = mockRes();

    await addReview(req, res);

    expect(res.status).toHaveBeenCalledWith(400);
    expect(res.status().json).toHaveBeenCalledWith({
      success: false,
      error: 'Review title is required'
    });
  });

  test('returns 400 when comment is too short', async () => {
    const req = {
      params: { productId: 'prod_1' },
      body: { rating: 4, title: 'Good', comment: 'short', userId: 'u1' }
    };
    const res = mockRes();

    await addReview(req, res);

    expect(res.status).toHaveBeenCalledWith(400);
    expect(res.status().json).toHaveBeenCalledWith({
      success: false,
      error: 'Review comment must be at least 10 characters long'
    });
  });

  test('returns 404 when product does not exist', async () => {
    ProductCatalog.findById = jest.fn().mockResolvedValue(null);
    const req = {
      params: { productId: 'nonexistent' },
      body: { rating: 4, title: 'Nice', comment: 'Valid comment length', userId: 'u1' }
    };
    const res = mockRes();

    await addReview(req, res);

    expect(res.status).toHaveBeenCalledWith(404);
    expect(res.status().json).toHaveBeenCalledWith({
      success: false,
      error: 'Product not found'
    });
  });

  test('returns 409 when review already exists for user', async () => {
    ReviewModel.findOne = jest.fn().mockResolvedValue({ id: 'rev_existing' });
    const req = {
      params: { productId: 'prod_1' },
      body: { rating: 5, title: 'Awesome', comment: 'Very good product', userId: 'u1' }
    };
    const res = mockRes();

    await addReview(req, res);

    expect(res.status).toHaveBeenCalledWith(409);
    expect(res.status().json).toHaveBeenCalledWith({
      success: false,
      error: 'You have already submitted a review for this product'
    });
  });

  test('successful review creation returns 201 with data', async () => {
    const req = {
      params: { productId: 'prod_1' },
      body: {
        rating: '5',
        title: 'Excellent',
        comment: 'This product exceeds expectations!',
        userId: 'u1'
      }
    };
    const res = mockRes();

    await addReview(req, res);

    expect(ProductCatalog.findById).toHaveBeenCalledWith('prod_1');
    expect(ReviewModel.findOne).toHaveBeenCalledWith({ productId: 'prod_1', userId: 'u1' });
    expect(ReviewModel.create).toHaveBeenCalledWith({
      productId: 'prod_1',
      userId: 'u1',
      rating: 5,
      title: 'Excellent',
      comment: 'This product exceeds expectations!'
    });
    expect(ReviewModel.calculateRatingStats).toHaveBeenCalledWith('prod_1');
    expect(ProductCatalog.updateStats).toHaveBeenCalledWith('prod_1', {
      averageRating: 4.2,
      totalReviews: 5
    });

    expect(res.status).toHaveBeenCalledWith(201);
    expect(res.status().json).toHaveBeenCalledWith({
      success: true,
      message: 'Review submitted successfully',
      data: {
        review: expect.objectContaining({
          id: 'rev_123',
          productId: 'prod_1',
          userId: 'u1',
          rating: 5,
          title: 'Excellent',
          comment: 'This product exceeds expectations!',
          createdAt: expect.any(Date)
        }),
        productStats: {
          averageRating: 4.2,
          totalReviews: 5,
          distribution: { 1: 0, 2: 0, 3: 1, 4: 2, 5: 2 }
        }
      }
    });
  });

  test('catches unexpected errors and returns 500', async () => {
    const error = new Error('DB failure');
    ReviewModel.create = jest.fn().mockRejectedValue(error);
    const req = {
      params: { productId: 'prod_1' },
      body: { rating: 4, title: 'Title', comment: 'Valid comment length', userId: 'u1' }
    };
    const res = mockRes();

    await addReview(req, res);

    expect(res.status).toHaveBeenCalledWith(500);
    expect(res.status().json).toHaveBeenCalledWith({
      success: false,
      error: 'Failed to submit review',
      details: 'DB failure'
    });
  });
});

describe('getProductReviews controller', () => {
  const mockRes = () => {
    const json = jest.fn();
    const status = jest.fn(() => ({ json }));
    return { status, json };
  };

  beforeEach(() => {
    jest.clearAllMocks();
    ReviewModel.calculateRatingStats = jest.fn().mockResolvedValue({
      averageRating: 3.5,
      totalReviews: 20,
      distribution: { 1: 2, 2: 3, 3: 5, 4: 6, 5: 4 }
    });
    ReviewModel.findByProductId = jest.fn().mockResolvedValue({
      reviews: [{ id: 'rev1' }, { id: 'rev2' }],
      total: 2
    });
  });

  test('returns 400 when productId missing', async () => {
    const req = { params: {}, query: {} };
    const res = mockRes();

    await getProductReviews(req, res);

    expect(res.status).toHaveBeenCalledWith(400);
    expect(res.status().json).toHaveBeenCalledWith({
      success: false,
      error: 'Product ID is required'
    });
  });

  test('returns 400 for invalid pagination parameters', async () => {
    const req = { params: { productId: 'prod_1' }, query: { page: '0', limit: '100' } };
    const res = mockRes();

    await getProductReviews(req, res);

    expect(res.status).toHaveBeenCalledWith(400);
    expect(res.status().json).toHaveBeenCalledWith({
      success: false,
      error: 'Invalid pagination parameters: page >= 1, 1 <= limit <= 50'
    });
  });

  test('returns 400 for invalid minRating', async () => {
    const req = { params: { productId: 'prod_1' }, query: { minRating: '6' } };
    const res = mockRes();

    await getProductReviews(req, res);

    expect(res.status).toHaveBeenCalledWith(400);
    expect(res.status().json).toHaveBeenCalledWith({
      success: false,
      error: 'minRating must be an integer between 1 and 5'
    });
  });

  test('successful retrieval with defaults', async () => {
    const req = { params: { productId: 'prod_1' }, query: {} };
    const res = mockRes();

    await getProductReviews(req, res);

    expect(ReviewModel.calculateRatingStats).toHaveBeenCalledWith('prod_1');
    expect(ReviewModel.findByProductId).toHaveBeenCalledWith('prod_1', {
      page: 1,
      limit: 10,
      filters: {}
    });
    expect(res.status).toHaveBeenCalledWith(200);
    expect(res.status().json).toHaveBeenCalledWith({
      success: true,
      data: {
        stats: {
          averageRating: 3.5,
          totalReviews: 20,
          distribution: { 1: 2, 2: 3, 3: 5, 4: 6, 5: 4 }
        },
        pagination: {
          totalReviews: 2,
          currentPage: 1,
          totalPages: 1
        },
        reviews: [{ id: 'rev1' }, { id: 'rev2' }]
      }
    });
  });

  test('successful retrieval with custom pagination and minRating filter', async () => {
    const req = {
      params: { productId: 'prod_2' },
      query: { page: '2', limit: '5', minRating: '3' }
    };
    const res = mockRes();

    await getProductReviews(req, res);

    expect(ReviewModel.findByProductId).toHaveBeenCalledWith('prod_2', {
      page: 2,
      limit: 5,
      filters: { minRating: 3 }
    });
    expect(res.status).toHaveBeenCalledWith(200);
  });

  test('catches unexpected errors and returns 500', async () => {
    const error = new Error('Unexpected');
    ReviewModel.findByProductId = jest.fn().mockRejectedValue(error);
    const req = { params: { productId: 'prod_1' }, query: {} };
    const res = mockRes();

    await getProductReviews(req, res);

    expect(res.status).toHaveBeenCalledWith(500);
    expect(res.status().json).toHaveBeenCalledWith({
      success: false,
      error: 'Failed to retrieve product reviews',
      details: 'Unexpected'
    });
  });
});