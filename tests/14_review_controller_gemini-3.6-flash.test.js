import { jest } from '@jest/globals';
import {
  addReview,
  getProductReviews,
  ProductCatalog,
  ReviewModel
} from '../dataset/14_review_controller.js';

describe('14_review_controller unit tests', () => {
  let mockRes;

  beforeEach(() => {
    mockRes = {
      status: jest.fn().mockReturnThis(),
      json: jest.fn().mockReturnThis()
    };
    jest.restoreAllMocks();
  });

  describe('Mock Database Models Default Implementation', () => {
    test('ProductCatalog default methods work correctly', async () => {
      await expect(ProductCatalog.findById('p1')).resolves.toBeNull();
      await expect(ProductCatalog.updateStats('p1', { averageRating: 4 })).resolves.toEqual({
        id: 'p1',
        averageRating: 4
      });
    });

    test('ReviewModel default methods work correctly', async () => {
      await expect(ReviewModel.findOne({})).resolves.toBeNull();
      
      const created = await ReviewModel.create({ title: 'Great' });
      expect(created).toHaveProperty('id');
      expect(created.title).toBe('Great');

      await expect(ReviewModel.findByProductId('p1', {})).resolves.toEqual({
        reviews: [],
        total: 0
      });

      await expect(ReviewModel.calculateRatingStats('p1')).resolves.toEqual({
        averageRating: 0,
        totalReviews: 0,
        distribution: { 1: 0, 2: 0, 3: 0, 4: 0, 5: 0 }
      });
    });
  });

  describe('addReview', () => {
    test('returns 401 if userId is missing', async () => {
      const req = {
        params: { productId: 'prod_1' },
        body: { rating: 5, title: 'Good', comment: 'Valid comment length here' }
      };

      await addReview(req, mockRes);

      expect(mockRes.status).toHaveBeenCalledWith(401);
      expect(mockRes.json).toHaveBeenCalledWith({
        success: false,
        error: 'Authentication required'
      });
    });

    test('returns 400 if productId is missing', async () => {
      const req = {
        user: { id: 'user_1' },
        params: {},
        body: { rating: 5, title: 'Good', comment: 'Valid comment length here' }
      };

      await addReview(req, mockRes);

      expect(mockRes.status).toHaveBeenCalledWith(400);
      expect(mockRes.json).toHaveBeenCalledWith({
        success: false,
        error: 'Product ID is required'
      });
    });

    test.each([
      ['non-numeric string', 'abc'],
      ['floating number', 3.5],
      ['less than 1', 0],
      ['greater than 5', 6]
    ])('returns 400 for invalid rating (%s)', async (_, rating) => {
      const req = {
        user: { id: 'user_1' },
        params: { productId: 'prod_1' },
        body: { rating, title: 'Good', comment: 'Valid comment length here' }
      };

      await addReview(req, mockRes);

      expect(mockRes.status).toHaveBeenCalledWith(400);
      expect(mockRes.json).toHaveBeenCalledWith({
        success: false,
        error: 'Rating must be an integer between 1 and 5'
      });
    });

    test.each([
      ['missing title', undefined],
      ['non-string title', 12345],
      ['empty string title', '   ']
    ])('returns 400 for invalid title (%s)', async (_, title) => {
      const req = {
        user: { id: 'user_1' },
        params: { productId: 'prod_1' },
        body: { rating: 5, title, comment: 'Valid comment length here' }
      };

      await addReview(req, mockRes);

      expect(mockRes.status).toHaveBeenCalledWith(400);
      expect(mockRes.json).toHaveBeenCalledWith({
        success: false,
        error: 'Review title is required'
      });
    });

    test.each([
      ['missing comment', undefined],
      ['non-string comment', 12345678901],
      ['comment less than 10 chars', 'Short']
    ])('returns 400 for invalid comment (%s)', async (_, comment) => {
      const req = {
        user: { id: 'user_1' },
        params: { productId: 'prod_1' },
        body: { rating: 5, title: 'Good Title', comment }
      };

      await addReview(req, mockRes);

      expect(mockRes.status).toHaveBeenCalledWith(400);
      expect(mockRes.json).toHaveBeenCalledWith({
        success: false,
        error: 'Review comment must be at least 10 characters long'
      });
    });

    test('returns 404 if product does not exist', async () => {
      jest.spyOn(ProductCatalog, 'findById').mockResolvedValue(null);

      const req = {
        user: { id: 'user_1' },
        params: { productId: 'prod_99' },
        body: { rating: 5, title: 'Good Title', comment: 'This is a long enough review comment' }
      };

      await addReview(req, mockRes);

      expect(ProductCatalog.findById).toHaveBeenCalledWith('prod_99');
      expect(mockRes.status).toHaveBeenCalledWith(404);
      expect(mockRes.json).toHaveBeenCalledWith({
        success: false,
        error: 'Product not found'
      });
    });

    test('returns 409 if user already reviewed the product', async () => {
      jest.spyOn(ProductCatalog, 'findById').mockResolvedValue({ id: 'prod_1', name: 'Sample Product' });
      jest.spyOn(ReviewModel, 'findOne').mockResolvedValue({ id: 'rev_1', rating: 4 });

      const req = {
        user: { id: 'user_1' },
        params: { productId: 'prod_1' },
        body: { rating: 5, title: 'Good Title', comment: 'This is a long enough review comment' }
      };

      await addReview(req, mockRes);

      expect(ReviewModel.findOne).toHaveBeenCalledWith({ productId: 'prod_1', userId: 'user_1' });
      expect(mockRes.status).toHaveBeenCalledWith(409);
      expect(mockRes.json).toHaveBeenCalledWith({
        success: false,
        error: 'You have already submitted a review for this product'
      });
    });

    test('successfully creates a review and updates product stats', async () => {
      const mockProduct = { id: 'prod_1', name: 'Sample Product' };
      const mockCreatedReview = { id: 'rev_100', productId: 'prod_1', userId: 'user_2', rating: 5, title: 'Great', comment: 'This is a great product indeed' };
      const mockStats = { averageRating: 4.5, totalReviews: 2, distribution: { 1: 0, 2: 0, 3: 0, 4: 1, 5: 1 } };

      jest.spyOn(ProductCatalog, 'findById').mockResolvedValue(mockProduct);
      jest.spyOn(ReviewModel, 'findOne').mockResolvedValue(null);
      jest.spyOn(ReviewModel, 'create').mockResolvedValue(mockCreatedReview);
      jest.spyOn(ReviewModel, 'calculateRatingStats').mockResolvedValue(mockStats);
      jest.spyOn(ProductCatalog, 'updateStats').mockResolvedValue({});

      const req = {
        body: {
          userId: 'user_2',
          rating: '5',
          title: '  Great  ',
          comment: '  This is a great product indeed  '
        },
        params: { productId: 'prod_1' }
      };

      await addReview(req, mockRes);

      expect(ReviewModel.create).toHaveBeenCalledWith({
        productId: 'prod_1',
        userId: 'user_2',
        rating: 5,
        title: 'Great',
        comment: 'This is a great product indeed'
      });
      expect(ReviewModel.calculateRatingStats).toHaveBeenCalledWith('prod_1');
      expect(ProductCatalog.updateStats).toHaveBeenCalledWith('prod_1', {
        averageRating: 4.5,
        totalReviews: 2
      });

      expect(mockRes.status).toHaveBeenCalledWith(201);
      expect(mockRes.json).toHaveBeenCalledWith({
        success: true,
        message: 'Review submitted successfully',
        data: {
          review: mockCreatedReview,
          productStats: mockStats
        }
      });
    });

    test('returns 500 when an unexpected error occurs', async () => {
      jest.spyOn(ProductCatalog, 'findById').mockRejectedValue(new Error('Database error'));

      const req = {
        user: { id: 'user_1' },
        params: { productId: 'prod_1' },
        body: { rating: 5, title: 'Good Title', comment: 'This is a long enough review comment' }
      };

      await addReview(req, mockRes);

      expect(mockRes.status).toHaveBeenCalledWith(500);
      expect(mockRes.json).toHaveBeenCalledWith({
        success: false,
        error: 'Failed to submit review',
        details: 'Database error'
      });
    });
  });

  describe('getProductReviews', () => {
    test('returns 400 if productId is missing', async () => {
      const req = { params: {} };

      await getProductReviews(req, mockRes);

      expect(mockRes.status).toHaveBeenCalledWith(400);
      expect(mockRes.json).toHaveBeenCalledWith({
        success: false,
        error: 'Product ID is required'
      });
    });

    test.each([
      ['page < 1', 0, 10],
      ['page is NaN', 'invalid', 10],
      ['limit < 1', 1, 0],
      ['limit > 50', 1, 51],
      ['limit is NaN', 1, 'invalid']
    ])('returns 400 for invalid pagination parameters (%s)', async (_, page, limit) => {
      const req = {
        params: { productId: 'prod_1' },
        query: { page, limit }
      };

      await getProductReviews(req, mockRes);

      expect(mockRes.status).toHaveBeenCalledWith(400);
      expect(mockRes.json).toHaveBeenCalledWith({
        success: false,
        error: 'Invalid pagination parameters: page >= 1, 1 <= limit <= 50'
      });
    });

    test.each([
      ['minRating < 1', 0],
      ['minRating > 5', 6],
      ['minRating is NaN', 'abc']
    ])('returns 400 for invalid minRating (%s)', async (_, minRating) => {
      const req = {
        params: { productId: 'prod_1' },
        query: { minRating }
      };

      await getProductReviews(req, mockRes);

      expect(mockRes.status).toHaveBeenCalledWith(400);
      expect(mockRes.json).toHaveBeenCalledWith({
        success: false,
        error: 'minRating must be an integer between 1 and 5'
      });
    });

    test('returns 200 with stats and reviews (default pagination and minRating filter)', async () => {
      const mockStats = { averageRating: 4.0, totalReviews: 12, distribution: { 1: 0, 2: 1, 3: 1, 4: 5, 5: 5 } };
      const mockReviews = [{ id: 'rev_1', rating: 5, comment: 'Awesome product' }];

      jest.spyOn(ReviewModel, 'calculateRatingStats').mockResolvedValue(mockStats);
      jest.spyOn(ReviewModel, 'findByProductId').mockResolvedValue({
        reviews: mockReviews,
        total: 12
      });

      const req = {
        params: { productId: 'prod_1' },
        query: { minRating: '4' }
      };

      await getProductReviews(req, mockRes);

      expect(ReviewModel.calculateRatingStats).toHaveBeenCalledWith('prod_1');
      expect(ReviewModel.findByProductId).toHaveBeenCalledWith('prod_1', {
        page: 1,
        limit: 10,
        filters: { minRating: 4 }
      });

      expect(mockRes.status).toHaveBeenCalledWith(200);
      expect(mockRes.json).toHaveBeenCalledWith({
        success: true,
        data: {
          stats: mockStats,
          pagination: {
            totalReviews: 12,
            currentPage: 1,
            totalPages: 2
          },
          reviews: mockReviews
        }
      });
    });

    test('calculates totalPages as 1 when total is 0', async () => {
      const mockStats = { averageRating: 0, totalReviews: 0, distribution: { 1: 0, 2: 0, 3: 0, 4: 0, 5: 0 } };

      jest.spyOn(ReviewModel, 'calculateRatingStats').mockResolvedValue(mockStats);
      jest.spyOn(ReviewModel, 'findByProductId').mockResolvedValue({
        reviews: [],
        total: 0
      });

      const req = {
        params: { productId: 'prod_1' }
      };

      await getProductReviews(req, mockRes);

      expect(mockRes.status).toHaveBeenCalledWith(200);
      expect(mockRes.json).toHaveBeenCalledWith({
        success: true,
        data: {
          stats: mockStats,
          pagination: {
            totalReviews: 0,
            currentPage: 1,
            totalPages: 1
          },
          reviews: []
        }
      });
    });

    test('returns 500 when an error is thrown', async () => {
      jest.spyOn(ReviewModel, 'calculateRatingStats').mockRejectedValue(new Error('Retrieval failure'));

      const req = {
        params: { productId: 'prod_1' }
      };

      await getProductReviews(req, mockRes);

      expect(mockRes.status).toHaveBeenCalledWith(500);
      expect(mockRes.json).toHaveBeenCalledWith({
        success: false,
        error: 'Failed to retrieve product reviews',
        details: 'Retrieval failure'
      });
    });
  });
});