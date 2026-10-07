import { jest } from '@jest/globals';

const mockResponseHandler = {
  created: jest.fn(),
  error: jest.fn(),
  notfound: jest.fn(),
  ok: jest.fn()
};

const mockReviewModel = jest.fn();
mockReviewModel.findOne = jest.fn();
mockReviewModel.find = jest.fn();

jest.unstable_mockModule('../handlers/response.handler.js', () => ({
  default: mockResponseHandler
}));

jest.unstable_mockModule('../models/review.model.js', () => ({
  default: mockReviewModel
}));

const { default: reviewController } = await import(
  '../dataset/external/trananhtuat__fullstack-mern-movie-2022/server/src/controllers/review.controller.js'
);

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
    it('should create a review successfully and return 201 created response', async () => {
      req.params.movieId = 'movie123';
      req.body = { content: 'Great movie!', mediaType: 'movie' };

      const mockSave = jest.fn().mockResolvedValue(true);
      mockReviewModel.mockImplementation((data) => ({
        ...data,
        _doc: { ...data },
        id: 'review123',
        save: mockSave
      }));

      await reviewController.create(req, res);

      expect(mockReviewModel).toHaveBeenCalledWith({
        user: 'user123',
        movieId: 'movie123',
        content: 'Great movie!',
        mediaType: 'movie'
      });
      expect(mockSave).toHaveBeenCalled();
      expect(mockResponseHandler.created).toHaveBeenCalledWith(res, {
        user: req.user,
        movieId: 'movie123',
        content: 'Great movie!',
        mediaType: 'movie',
        id: 'review123'
      });
    });

    it('should call responseHandler.error on failure', async () => {
      req.params.movieId = 'movie123';
      mockReviewModel.mockImplementation(() => ({
        save: jest.fn().mockRejectedValue(new Error('Database error'))
      }));

      await reviewController.create(req, res);

      expect(mockResponseHandler.error).toHaveBeenCalledWith(res);
    });
  });

  describe('remove', () => {
    it('should remove review successfully and return ok response', async () => {
      req.params.reviewId = 'review123';
      const mockReview = {
        _id: 'review123',
        user: 'user123',
        remove: jest.fn().mockResolvedValue(true)
      };

      mockReviewModel.findOne.mockResolvedValue(mockReview);

      await reviewController.remove(req, res);

      expect(mockReviewModel.findOne).toHaveBeenCalledWith({
        _id: 'review123',
        user: 'user123'
      });
      expect(mockReview.remove).toHaveBeenCalled();
      expect(mockResponseHandler.ok).toHaveBeenCalledWith(res);
    });

    it('should return notfound when review does not exist', async () => {
      req.params.reviewId = 'nonexistent';
      mockReviewModel.findOne.mockResolvedValue(null);

      await reviewController.remove(req, res);

      expect(mockReviewModel.findOne).toHaveBeenCalledWith({
        _id: 'nonexistent',
        user: 'user123'
      });
      expect(mockResponseHandler.notfound).toHaveBeenCalledWith(res);
      expect(mockResponseHandler.ok).not.toHaveBeenCalled();
    });

    it('should call responseHandler.error on exception', async () => {
      req.params.reviewId = 'review123';
      mockReviewModel.findOne.mockRejectedValue(new Error('Database error'));

      await reviewController.remove(req, res);

      expect(mockResponseHandler.error).toHaveBeenCalledWith(res);
    });
  });

  describe('getReviewsOfUser', () => {
    it('should return user reviews sorted by createdAt descending', async () => {
      const mockReviews = [
        { id: 'r1', content: 'Review 1' },
        { id: 'r2', content: 'Review 2' }
      ];
      const mockSort = jest.fn().mockResolvedValue(mockReviews);
      mockReviewModel.find.mockReturnValue({ sort: mockSort });

      await reviewController.getReviewsOfUser(req, res);

      expect(mockReviewModel.find).toHaveBeenCalledWith({ user: 'user123' });
      expect(mockSort).toHaveBeenCalledWith('-createdAt');
      expect(mockResponseHandler.ok).toHaveBeenCalledWith(res, mockReviews);
    });

    it('should call responseHandler.error on exception', async () => {
      mockReviewModel.find.mockReturnValue({
        sort: jest.fn().mockRejectedValue(new Error('Database error'))
      });

      await reviewController.getReviewsOfUser(req, res);

      expect(mockResponseHandler.error).toHaveBeenCalledWith(res);
    });
  });
});