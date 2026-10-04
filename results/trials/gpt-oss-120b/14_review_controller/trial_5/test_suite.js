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
    // Default successful mocks
    ProductCatalog.findById = jest.fn().mockResolvedValue({ id: 'p1' });
    ProductCatalog.updateStats = jest.fn().mockResolvedValue({});
    ReviewModel.findOne = jest.fn().mockResolvedValue(null);
    ReviewModel.create = jest.fn().mockImplementation(async (data) => ({
      id: `rev_${Date.now()}`,
      ...data,
      createdAt: new Date()
    }));
    ReviewModel.calculateRatingStats = jest.fn().mockResolvedValue({
      averageRating: 4.2,
      totalReviews: 10,
      distribution: { 1: 0, 2: 1, 3: 2, 4: 3, 5: 4 }
    });
  });

  test('responds 401 when user not authenticated', async () => {
    const req = { params: { productId: 'p1' }, body: { rating: 5, title: 'Good', comment: 'Nice product!' } };
    const res = mockRes();

    await addReview(req, res);

    expect(res.status).toHaveBeenCalledWith(401);
    expect(res.json).toHaveBeenCalledWith({
      success: false,
      error: 'Authentication required'
    });
  });

  test('responds 400 when productId is missing', async () => {
    const req = { user: { id: 'u1' }, body: { rating: 5, title: 'Good', comment: 'Nice product!' } };
    const res = mockRes();

    await addReview(req, res);

    expect(res.status).toHaveBeenCalledWith(400);
    expect(res.json).toHaveBeenCalledWith({
      success: false,
      error: 'Product ID is required'
    });
  });

  test('responds 400 for invalid rating', async () => {
    const req = {
      params: { productId: 'p1' },
      user: { id: 'u1' },
      body: { rating: 6, title: 'Great', comment: 'I really like this product.' }
    };
    const res = mockRes();

    await addReview(req, res);

    expect(res.status).toHaveBeenCalledWith(400);
    expect(res.json).toHaveBeenCalledWith({
      success: false,
      error: 'Rating must be an integer between 1 and 5'
    });
  });

  test('responds 400 when title is empty', async () => {
    const req = {
      params: { productId: 'p1' },
      user: { id: 'u1' },
      body: { rating: 4, title: '   ', comment: 'Valid comment length.' }
    };
    const res = mockRes();

    await addReview(req, res);

    expect(res.status).toHaveBeenCalledWith(400);
    expect(res.json).toHaveBeenCalledWith({
      success: false,
      error: 'Review title is required'
    });
  });

  test('responds 400 when comment is too short', async () => {
    const req = {
      params: { productId: 'p1' },
      user: { id: 'u1' },
      body: { rating: 4, title: 'Nice', comment: 'Too short' }
    };
    const res = mockRes();

    await addReview(req, res);

    expect(res.status).toHaveBeenCalledWith(400);
    expect(res.json).toHaveBeenCalledWith({
      success: false,
      error: 'Review comment must be at least 10 characters long'
    });
  });

  test('responds 404 when product does not exist', async () => {
    ProductCatalog.findById.mockResolvedValue(null);
    const req = {
      params: { productId: 'unknown' },
      user: { id: 'u1' },
      body: { rating: 4, title: 'Nice', comment: 'Sufficiently long comment.' }
    };
    const res = mockRes();

    await addReview(req, res);

    expect(res.status).toHaveBeenCalledWith(404);
    expect(res.json).toHaveBeenCalledWith({
      success: false,
      error: 'Product not found'
    });
  });

  test('responds 409 when user already reviewed the product', async () => {
    ReviewModel.findOne.mockResolvedValue({ id: 'rev123' });
    const req = {
      params: { productId: 'p1' },
      user: { id: 'u1' },
      body: { rating: 4, title: 'Nice', comment: 'Sufficiently long comment.' }
    };
    const res = mockRes();

    await addReview(req, res);

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
        rating: 5,
        title: 'Excellent',
        comment: 'I absolutely love this product! It works perfectly.'
      }
    };
    const res = mockRes();

    await addReview(req, res);

    // Verify calls
    expect(ProductCatalog.findById).toHaveBeenCalledWith('p1');
    expect(ReviewModel.findOne).toHaveBeenCalledWith({ productId: 'p1', userId: 'u1' });
    expect(ReviewModel.create).toHaveBeenCalledWith({
      productId: 'p1',
      userId: 'u1',
      rating: 5,
      title: 'Excellent',
      comment: 'I absolutely love this product! It works perfectly.'
    });
    expect(ReviewModel.calculateRatingStats).toHaveBeenCalledWith('p1');
    expect(ProductCatalog.updateStats).toHaveBeenCalledWith('p1', {
      averageRating: 4.2,
      totalReviews: 10
    });

    expect(res.status).toHaveBeenCalledWith(201);
    expect(res.json).toHaveBeenCalledWith(
      expect.objectContaining({
        success: true,
        message: 'Review submitted successfully',
        data: expect.objectContaining({
          review: expect.objectContaining({
            productId: 'p1',
            userId: 'u1',
            rating: 5,
            title: 'Excellent',
            comment: 'I absolutely love this product! It works perfectly.'
          }),
          productStats: {
            averageRating: 4.2,
            totalReviews: 10,
            distribution: { 1: 0, 2: 1, 3: 2, 4: 3, 5: 4 }
          }
        })
      })
    );
  });
});

describe('getProductReviews controller', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    ReviewModel.calculateRatingStats = jest.fn().mockResolvedValue({
      averageRating: 3.5,
      totalReviews: 20,
      distribution: { 1: 2, 2: 3, 3: 5, 4: 6, 5: 4 }
    });
    ReviewModel.findByProductId = jest.fn().mockResolvedValue({
      reviews: [{ id: 'rev1', rating: 5, title: 'Great', comment: '...' }],
      total: 1
    });
  });

  test('responds 400 when productId is missing', async () => {
    const req = { query: {} };
    const res = mockRes();

    await getProductReviews(req, res);

    expect(res.status).toHaveBeenCalledWith(400);
    expect(res.json).toHaveBeenCalledWith({
      success: false,
      error: 'Product ID is required'
    });
  });

  test('responds 400 for invalid pagination parameters', async () => {
    const req = {
      params: { productId: 'p1' },
      query: { page: '0', limit: '100' }
    };
    const res = mockRes();

    await getProductReviews(req, res);

    expect(res.status).toHaveBeenCalledWith(400);
    expect(res.json).toHaveBeenCalledWith({
      success: false,
      error: 'Invalid pagination parameters: page >= 1, 1 <= limit <= 50'
    });
  });

  test('responds 400 for invalid minRating filter', async () => {
    const req = {
      params: { productId: 'p1' },
      query: { minRating: '6' }
    };
    const res = mockRes();

    await getProductReviews(req, res);

    expect(res.status).toHaveBeenCalledWith(400);
    expect(res.json).toHaveBeenCalledWith({
      success: false,
      error: 'minRating must be an integer between 1 and 5'
    });
  });

  test('successfully retrieves reviews with pagination and stats', async () => {
    const req = {
      params: { productId: 'p1' },
      query: { page: '2', limit: '5', minRating: '3' }
    };
    const res = mockRes();

    await getProductReviews(req, res);

    // Verify internal calls
    expect(ReviewModel.calculateRatingStats).toHaveBeenCalledWith('p1');
    expect(ReviewModel.findByProductId).toHaveBeenCalledWith('p1', {
      page: 2,
      limit: 5,
      filters: { minRating: 3 }
    });

    expect(res.status).toHaveBeenCalledWith(200);
    expect(res.json).toHaveBeenCalledWith(
      expect.objectContaining({
        success: true,
        data: expect.objectContaining({
          stats: {
            averageRating: 3.5,
            totalReviews: 20,
            distribution: { 1: 2, 2: 3, 3: 5, 4: 6, 5: 4 }
          },
          pagination: expect.objectContaining({
            totalReviews: 1,
            currentPage: 2,
            totalPages: 1
          }),
          reviews: [{ id: 'rev1', rating: 5, title: 'Great', comment: '...' }]
        })
      })
    );
  });
});