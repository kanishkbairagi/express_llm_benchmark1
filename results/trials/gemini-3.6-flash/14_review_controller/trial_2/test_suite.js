import { jest } from '@jest/globals';
import {
  ProductCatalog,
  ReviewModel,
  addReview,
  getProductReviews
} from '../dataset/14_review_controller.js';

describe('14_review_controller.js unit tests', () => {
  let req;
  let res;

  beforeEach(() => {
    req = {
      params: {},
      body: {},
      query: {},
      user: null
    };
    res = {
      status: jest.fn().mockReturnThis(),
      json: jest.fn().mockReturnThis()
    };
    jest.restoreAllMocks();
  });

  describe('ProductCatalog and ReviewModel default implementations', () => {
    it('should test ProductCatalog default methods', async () => {
      const p = await ProductCatalog.findById('123');
      expect(p).toBeNull();

      const stats = await ProductCatalog.updateStats('123', { averageRating: 4 });
      expect(stats).toEqual({ id: '123', averageRating: 4 });
    });

    it('should test ReviewModel default methods', async () => {
      const review = await ReviewModel.findOne({ productId: 'p1', userId: 'u1' });
      expect(review).toBeNull();

      const created = await ReviewModel.create({ title: 'Test' });
      expect(created.title).toBe('Test');
      expect(created.id).toBeDefined();

      const list = await ReviewModel.findByProductId('p1', {});
      expect(list).toEqual({ reviews: [], total: 0 });

      const calcStats = await ReviewModel.calculateRatingStats('p1');
      expect(calcStats).toEqual({
        averageRating: 0,
        totalReviews: 0,
        distribution: { 1: 0, 2: 0, 3: 0, 4: 0, 5: 0 }
      });
    });
  });

  describe('addReview', () => {
    it('should return 401 if user is not authenticated', async () => {
      req.user = null;
      req.body = { userId: null };

      await addReview(req, res);

      expect(res.status).toHaveBeenCalledWith(401);
      expect(res.json).toHaveBeenCalledWith({
        success: false,
        error: 'Authentication required'
      });
    });

    it('should return 400 if productId is missing', async () => {
      req.user = { id: 'user1' };
      req.params = {};

      await addReview(req, res);

      expect(res.status).toHaveBeenCalledWith(400);
      expect(res.json).toHaveBeenCalledWith({
        success: false,
        error: 'Product ID is required'
      });
    });

    it('should return 400 if rating is invalid (not integer, out of bounds)', async () => {
      req.user = { id: 'user1' };
      req.params = { productId: 'prod1' };

      const invalidRatings = [0, 6, 3.5, 'abc', null];
      for (const rating of invalidRatings) {
        req.body = { rating, title: 'Good Title', comment: 'Valid comment length' };
        await addReview(req, res);
        expect(res.status).toHaveBeenCalledWith(400);
        expect(res.json).toHaveBeenCalledWith({
          success: false,
          error: 'Rating must be an integer between 1 and 5'
        });
      }
    });

    it('should return 400 if title is invalid', async () => {
      req.user = { id: 'user1' };
      req.params = { productId: 'prod1' };

      const invalidTitles = ['', '   ', null, 123];
      for (const title of invalidTitles) {
        req.body = { rating: 5, title, comment: 'Valid comment length' };
        await addReview(req, res);
        expect(res.status).toHaveBeenCalledWith(400);
        expect(res.json).toHaveBeenCalledWith({
          success: false,
          error: 'Review title is required'
        });
      }
    });

    it('should return 400 if comment is invalid (< 10 chars)', async () => {
      req.user = { id: 'user1' };
      req.params = { productId: 'prod1' };

      const invalidComments = ['', 'short', '   nine   ', 123, null];
      for (const comment of invalidComments) {
        req.body = { rating: 5, title: 'Title', comment };
        await addReview(req, res);
        expect(res.status).toHaveBeenCalledWith(400);
        expect(res.json).toHaveBeenCalledWith({
          success: false,
          error: 'Review comment must be at least 10 characters long'
        });
      }
    });

    it('should return 404 if product is not found', async () => {
      req.user = { id: 'user1' };
      req.params = { productId: 'prod1' };
      req.body = { rating: 5, title: 'Great', comment: 'This product is really awesome!' };

      jest.spyOn(ProductCatalog, 'findById').mockResolvedValue(null);

      await addReview(req, res);

      expect(res.status).toHaveBeenCalledWith(404);
      expect(res.json).toHaveBeenCalledWith({
        success: false,
        error: 'Product not found'
      });
    });

    it('should return 409 if review already exists', async () => {
      req.user = { id: 'user1' };
      req.params = { productId: 'prod1' };
      req.body = { rating: 5, title: 'Great', comment: 'This product is really awesome!' };

      jest.spyOn(ProductCatalog, 'findById').mockResolvedValue({ id: 'prod1' });
      jest.spyOn(ReviewModel, 'findOne').mockResolvedValue({ id: 'rev1' });

      await addReview(req, res);

      expect(res.status).toHaveBeenCalledWith(409);
      expect(res.json).toHaveBeenCalledWith({
        success: false,
        error: 'You have already submitted a review for this product'
      });
    });

    it('should successfully create review using req.body.userId if req.user is absent', async () => {
      req.user = undefined;
      req.params = { productId: 'prod1' };
      req.body = {
        userId: 'user_body',
        rating: '5',
        title: '  Great Product  ',
        comment: '  This product is really awesome!  '
      };

      const mockProduct = { id: 'prod1' };
      const mockNewReview = {
        id: 'rev123',
        productId: 'prod1',
        userId: 'user_body',
        rating: 5,
        title: 'Great Product',
        comment: 'This product is really awesome!'
      };
      const mockStats = { averageRating: 5, totalReviews: 1 };

      jest.spyOn(ProductCatalog, 'findById').mockResolvedValue(mockProduct);
      jest.spyOn(ReviewModel, 'findOne').mockResolvedValue(null);
      jest.spyOn(ReviewModel, 'create').mockResolvedValue(mockNewReview);
      jest.spyOn(ReviewModel, 'calculateRatingStats').mockResolvedValue(mockStats);
      jest.spyOn(ProductCatalog, 'updateStats').mockResolvedValue({ id: 'prod1', ...mockStats });

      await addReview(req, res);

      expect(ReviewModel.create).toHaveBeenCalledWith({
        productId: 'prod1',
        userId: 'user_body',
        rating: 5,
        title: 'Great Product',
        comment: 'This product is really awesome!'
      });
      expect(ProductCatalog.updateStats).toHaveBeenCalledWith('prod1', {
        averageRating: 5,
        totalReviews: 1
      });
      expect(res.status).toHaveBeenCalledWith(201);
      expect(res.json).toHaveBeenCalledWith({
        success: true,
        message: 'Review submitted successfully',
        data: {
          review: mockNewReview,
          productStats: mockStats
        }
      });
    });

    it('should return 500 when an exception is thrown', async () => {
      req.user = { id: 'user1' };
      req.params = { productId: 'prod1' };
      req.body = { rating: 5, title: 'Great', comment: 'This product is really awesome!' };

      jest.spyOn(ProductCatalog, 'findById').mockRejectedValue(new Error('DB failure'));

      await addReview(req, res);

      expect(res.status).toHaveBeenCalledWith(500);
      expect(res.json).toHaveBeenCalledWith({
        success: false,
        error: 'Failed to submit review',
        details: 'DB failure'
      });
    });
  });

  describe('getProductReviews', () => {
    it('should return 400 if productId is missing', async () => {
      req.params = {};

      await getProductReviews(req, res);

      expect(res.status).toHaveBeenCalledWith(400);
      expect(res.json).toHaveBeenCalledWith({
        success: false,
        error: 'Product ID is required'
      });
    });

    it('should return 400 for invalid pagination parameters', async () => {
      req.params = { productId: 'prod1' };

      const invalidPaginationCases = [
        { page: '0', limit: '10' },
        { page: '1', limit: '0' },
        { page: '1', limit: '51' },
        { page: 'invalid', limit: '10' },
        { page: '1', limit: 'invalid' }
      ];

      for (const query of invalidPaginationCases) {
        req.query = query;
        await getProductReviews(req, res);

        expect(res.status).toHaveBeenCalledWith(400);
        expect(res.json).toHaveBeenCalledWith({
          success: false,
          error: 'Invalid pagination parameters: page >= 1, 1 <= limit <= 50'
        });
      }
    });

    it('should return 400 for invalid minRating parameter', async () => {
      req.params = { productId: 'prod1' };

      const invalidMinRatings = ['0', '6', 'invalid'];
      for (const minRating of invalidMinRatings) {
        req.query = { page: '1', limit: '10', minRating };
        await getProductReviews(req, res);

        expect(res.status).toHaveBeenCalledWith(400);
        expect(res.json).toHaveBeenCalledWith({
          success: false,
          error: 'minRating must be an integer between 1 and 5'
        });
      }
    });

    it('should return 200 with formatted response and filters when query is valid', async () => {
      req.params = { productId: 'prod1' };
      req.query = { page: '2', limit: '5', minRating: '4' };

      const mockStats = { averageRating: 4.2, totalReviews: 12 };
      const mockReviews = [{ id: 'rev1', rating: 4 }, { id: 'rev2', rating: 5 }];

      jest.spyOn(ReviewModel, 'calculateRatingStats').mockResolvedValue(mockStats);
      jest.spyOn(ReviewModel, 'findByProductId').mockResolvedValue({
        reviews: mockReviews,
        total: 12
      });

      await getProductReviews(req, res);

      expect(ReviewModel.findByProductId).toHaveBeenCalledWith('prod1', {
        page: 2,
        limit: 5,
        filters: { minRating: 4 }
      });
      expect(res.status).toHaveBeenCalledWith(200);
      expect(res.json).toHaveBeenCalledWith({
        success: true,
        data: {
          stats: mockStats,
          pagination: {
            totalReviews: 12,
            currentPage: 2,
            totalPages: 3
          },
          reviews: mockReviews
        }
      });
    });

    it('should handle pagination default values and total = 0 correctly', async () => {
      req.params = { productId: 'prod1' };
      req.query = {};

      const mockStats = { averageRating: 0, totalReviews: 0 };

      jest.spyOn(ReviewModel, 'calculateRatingStats').mockResolvedValue(mockStats);
      jest.spyOn(ReviewModel, 'findByProductId').mockResolvedValue({
        reviews: [],
        total: 0
      });

      await getProductReviews(req, res);

      expect(ReviewModel.findByProductId).toHaveBeenCalledWith('prod1', {
        page: 1,
        limit: 10,
        filters: {}
      });
      expect(res.status).toHaveBeenCalledWith(200);
      expect(res.json).toHaveBeenCalledWith({
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

    it('should return 500 when an exception is thrown', async () => {
      req.params = { productId: 'prod1' };

      jest.spyOn(ReviewModel, 'calculateRatingStats').mockRejectedValue(new Error('Fetch stats error'));

      await getProductReviews(req, res);

      expect(res.status).toHaveBeenCalledWith(500);
      expect(res.json).toHaveBeenCalledWith({
        success: false,
        error: 'Failed to retrieve product reviews',
        details: 'Fetch stats error'
      });
    });
  });
});