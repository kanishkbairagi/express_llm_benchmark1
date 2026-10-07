import { jest } from '@jest/globals';

// Mock responseHandler
jest.mock(
  '../dataset/external/trananhtuat__fullstack-mern-movie-2022/server/src/handlers/response.handler.js',
  () => ({
    __esModule: true,
    default: {
      created: jest.fn(),
      ok: jest.fn(),
      notfound: jest.fn(),
      error: jest.fn(),
    },
  })
);

// Mock reviewModel
jest.mock(
  '../dataset/external/trananhtuat__fullstack-mern-movie-2022/server/src/models/review.model.js',
  () => {
    const mockInstance = {
      save: jest.fn(),
      remove: jest.fn(),
      _doc: { title: 'Sample Review', rating: 5 },
      id: 'mockReviewId',
    };
    const mockModel = jest.fn(() => mockInstance);
    mockModel.findOne = jest.fn();
    mockModel.find = jest.fn();
    return {
      __esModule: true,
      default: mockModel,
    };
  }
);

// Import after mocks are set up
import reviewController from '../dataset/external/trananhtuat__fullstack-mern-movie-2022/server/src/controllers/review.controller.js';
import responseHandler from '../dataset/external/trananhtuat__fullstack-mern-movie-2022/server/src/handlers/response.handler.js';
import reviewModel from '../dataset/external/trananhtuat__fullstack-mern-movie-2022/server/src/models/review.model.js';

describe('review.controller', () => {
  afterEach(() => {
    jest.clearAllMocks();
  });

  describe('create', () => {
    const req = {
      params: { movieId: 'movie123' },
      user: { id: 'user456' },
      body: { comment: 'Great movie!' },
    };
    const res = {};

    it('should create a review and respond with created', async () => {
      // Arrange
      const instance = reviewModel.mock.results[0].value;
      instance.save.mockResolvedValueOnce();

      // Act
      await reviewController.create(req, res);

      // Assert
      expect(reviewModel).toHaveBeenCalledWith({
        user: 'user456',
        movieId: 'movie123',
        comment: 'Great movie!',
      });
      expect(instance.save).toHaveBeenCalledTimes(1);
      expect(responseHandler.created).toHaveBeenCalledWith(res, {
        ...instance._doc,
        id: instance.id,
        user: req.user,
      });
    });

    it('should handle errors by calling responseHandler.error', async () => {
      const instance = reviewModel.mock.results[0].value;
      instance.save.mockRejectedValueOnce(new Error('save failed'));

      await reviewController.create(req, res);

      expect(responseHandler.error).toHaveBeenCalledWith(res);
    });
  });

  describe('remove', () => {
    const req = {
      params: { reviewId: 'rev789' },
      user: { id: 'user456' },
    };
    const res = {};

    it('should remove an existing review and respond ok', async () => {
      const mockReview = {
        remove: jest.fn().mockResolvedValueOnce(),
      };
      reviewModel.findOne.mockResolvedValueOnce(mockReview);

      await reviewController.remove(req, res);

      expect(reviewModel.findOne).toHaveBeenCalledWith({
        _id: 'rev789',
        user: 'user456',
      });
      expect(mockReview.remove).toHaveBeenCalledTimes(1);
      expect(responseHandler.ok).toHaveBeenCalledWith(res);
    });

    it('should respond notfound when review does not exist', async () => {
      reviewModel.findOne.mockResolvedValueOnce(null);

      await reviewController.remove(req, res);

      expect(responseHandler.notfound).toHaveBeenCalledWith(res);
    });

    it('should handle errors by calling responseHandler.error', async () => {
      reviewModel.findOne.mockRejectedValueOnce(new Error('db error'));

      await reviewController.remove(req, res);

      expect(responseHandler.error).toHaveBeenCalledWith(res);
    });
  });

  describe('getReviewsOfUser', () => {
    const req = {
      user: { id: 'user456' },
    };
    const res = {};

    it('should fetch reviews and respond ok with data', async () => {
      const mockReviews = [{ _id: '1' }, { _id: '2' }];
      const chain = {
        sort: jest.fn().mockResolvedValueOnce(mockReviews),
      };
      reviewModel.find.mockReturnValueOnce(chain);

      await reviewController.getReviewsOfUser(req, res);

      expect(reviewModel.find).toHaveBeenCalledWith({ user: 'user456' });
      expect(chain.sort).toHaveBeenCalledWith('-createdAt');
      expect(responseHandler.ok).toHaveBeenCalledWith(res, mockReviews);
    });

    it('should handle errors by calling responseHandler.error', async () => {
      const chain = {
        sort: jest.fn().mockRejectedValueOnce(new Error('db error')),
      };
      reviewModel.find.mockReturnValueOnce(chain);

      await reviewController.getReviewsOfUser(req, res);

      expect(responseHandler.error).toHaveBeenCalledWith(res);
    });
  });
});