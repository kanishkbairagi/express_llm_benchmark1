import { jest } from '@jest/globals';

jest.mock('../handlers/response.handler.js', () => ({
  __esModule: true,
  default: {
    created: jest.fn(),
    error: jest.fn(),
    notfound: jest.fn(),
    ok: jest.fn()
  }
}));

jest.mock('../models/review.model.js', () => {
  const MockModel = jest.fn();
  MockModel.findOne = jest.fn();
  MockModel.find = jest.fn();
  return {
    __esModule: true,
    default: MockModel
  };
});

import reviewController from '../dataset/external/trananhtuat__fullstack-mern-movie-2022/server/src/controllers/review.controller.js';
import responseHandler from '../handlers/response.handler.js';
import reviewModel from '../models/review.model.js';

describe('Review Controller', () => {
  let req;
  let res;

  beforeEach(() => {
    jest.clearAllMocks();
    req = {
      params: {},
      user: { id: 'user123', name: 'Test User' },
      body: {}
    };
    res = {};
  });

  describe('create', () => {
    it('should create a review successfully and return created response', async () => {
      req.params = { movieId: 'movie123' };
      req.body = { content: 'Great movie!', mediaType: 'movie' };

      const mockSave = jest.fn().mockResolvedValue(true);
      const mockReviewInstance = {
        save: mockSave,
        _doc: { content: 'Great movie!', mediaType: 'movie' },
        id: 'review123'
      };

      reviewModel.mockImplementation(() => mockReviewInstance);

      await reviewController.create(req, res);

      expect(reviewModel).toHaveBeenCalledWith({
        user: req.user.id,
        movieId: 'movie123',
        content: 'Great movie!',
        mediaType: 'movie'
      });
      expect(mockSave).toHaveBeenCalled();
      expect(responseHandler.created).toHaveBeenCalledWith(res, {
        content: 'Great movie!',
        mediaType: 'movie',
        id: 'review123',
        user: req.user
      });
    });

    it('should handle errors and call responseHandler.error', async () => {
      req.params = { movieId: 'movie123' };
      
      reviewModel.mockImplementation(() => {
        throw new Error('Database error');
      });

      await reviewController.create(req, res);

      expect(responseHandler.error).toHaveBeenCalledWith(res);
    });
  });

  describe('remove', () => {
    it('should remove review if found and return ok response', async () => {
      req.params = { reviewId: 'review123' };
      const mockRemove = jest.fn().mockResolvedValue(true);
      const mockReview = { remove: mockRemove };

      reviewModel.findOne.mockResolvedValue(mockReview);

      await reviewController.remove(req, res);

      expect(reviewModel.findOne).toHaveBeenCalledWith({
        _id: 'review123',
        user: 'user123'
      });
      expect(mockRemove).toHaveBeenCalled();
      expect(responseHandler.ok).toHaveBeenCalledWith(res);
    });

    it('should return notfound response if review is not found', async () => {
      req.params = { reviewId: 'review123' };
      reviewModel.findOne.mockResolvedValue(null);

      await reviewController.remove(req, res);

      expect(reviewModel.findOne).toHaveBeenCalledWith({
        _id: 'review123',
        user: 'user123'
      });
      expect(responseHandler.notfound).toHaveBeenCalledWith(res);
      expect(responseHandler.ok).not.toHaveBeenCalled();
    });

    it('should handle errors and call responseHandler.error', async () => {
      req.params = { reviewId: 'review123' };
      reviewModel.findOne.mockRejectedValue(new Error('DB failure'));

      await reviewController.remove(req, res);

      expect(responseHandler.error).toHaveBeenCalledWith(res);
    });
  });

  describe('getReviewsOfUser', () => {
    it('should retrieve reviews of user sorted by createdAt and return ok response', async () => {
      const mockReviews = [
        { id: 'r1', content: 'Review 1' },
        { id: 'r2', content: 'Review 2' }
      ];

      const mockSort = jest.fn().mockResolvedValue(mockReviews);
      reviewModel.find.mockReturnValue({ sort: mockSort });

      await reviewController.getReviewsOfUser(req, res);

      expect(reviewModel.find).toHaveBeenCalledWith({ user: 'user123' });
      expect(mockSort).toHaveBeenCalledWith('-createdAt');
      expect(responseHandler.ok).toHaveBeenCalledWith(res, mockReviews);
    });

    it('should handle errors and call responseHandler.error', async () => {
      reviewModel.find.mockImplementation(() => {
        throw new Error('Failed to fetch');
      });

      await reviewController.getReviewsOfUser(req, res);

      expect(responseHandler.error).toHaveBeenCalledWith(res);
    });
  });
});