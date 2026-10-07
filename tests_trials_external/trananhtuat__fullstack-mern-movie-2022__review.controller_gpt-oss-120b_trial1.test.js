import { jest } from '@jest/globals';
import controller from '../dataset/external/trananhtuat__fullstack-mern-movie-2022/server/src/controllers/review.controller.js';
import responseHandler from '../dataset/external/trananhtuat__fullstack-mern-movie-2022/server/src/handlers/response.handler.js';
import reviewModel from '../dataset/external/trananhtuat__fullstack-mern-movie-2022/server/src/models/review.model.js';

jest.mock('../dataset/external/trananhtuat__fullstack-mern-movie-2022/server/src/handlers/response.handler.js', () => ({
  __esModule: true,
  default: {
    created: jest.fn(),
    error: jest.fn(),
    ok: jest.fn(),
    notfound: jest.fn(),
  },
}));

jest.mock('../dataset/external/trananhtuat__fullstack-mern-movie-2022/server/src/models/review.model.js', () => {
  const save = jest.fn();
  const remove = jest.fn();

  const ReviewMock = jest.fn(() => ({
    save,
    remove,
    _doc: { title: 'Mock Title', content: 'Mock Content' },
    id: 'mockReviewId',
  }));

  ReviewMock.findOne = jest.fn();
  ReviewMock.find = jest.fn();

  return ReviewMock;
});

describe('review.controller', () => {
  const req = {
    params: {},
    body: { rating: 5, comment: 'Great!' },
    user: { id: 'userId' },
  };
  const res = {};

  beforeEach(() => {
    jest.clearAllMocks();
    // reset mock implementations
    reviewModel.mockImplementation(() => ({
      save: jest.fn(),
      remove: jest.fn(),
      _doc: { title: 'Mock Title', content: 'Mock Content' },
      id: 'mockReviewId',
    }));
    reviewModel.findOne.mockReset();
    reviewModel.find.mockReset();
  });

  describe('create', () => {
    it('should create a review and send created response', async () => {
      req.params.movieId = 'movie123';
      const saveMock = jest.fn().mockResolvedValue(undefined);
      reviewModel.mockImplementation(() => ({
        save: saveMock,
        _doc: { title: 'Created', rating: 5 },
        id: 'newId',
      }));

      await controller.create(req, res);

      expect(saveMock).toHaveBeenCalledTimes(1);
      expect(responseHandler.created).toHaveBeenCalledWith(res, {
        title: 'Created',
        rating: 5,
        id: 'newId',
        user: req.user,
      });
    });

    it('should handle errors and call responseHandler.error', async () => {
      req.params.movieId = 'movie123';
      const saveMock = jest.fn().mockRejectedValue(new Error('save error'));
      reviewModel.mockImplementation(() => ({
        save: saveMock,
        _doc: {},
        id: 'errId',
      }));

      await controller.create(req, res);

      expect(saveMock).toHaveBeenCalledTimes(1);
      expect(responseHandler.error).toHaveBeenCalledWith(res);
    });
  });

  describe('remove', () => {
    it('should remove existing review and send ok response', async () => {
      req.params.reviewId = 'rev123';
      const removeMock = jest.fn().mockResolvedValue(undefined);
      reviewModel.findOne.mockResolvedValue({
        remove: removeMock,
      });

      await controller.remove(req, res);

      expect(reviewModel.findOne).toHaveBeenCalledWith({
        _id: 'rev123',
        user: 'userId',
      });
      expect(removeMock).toHaveBeenCalledTimes(1);
      expect(responseHandler.ok).toHaveBeenCalledWith(res);
    });

    it('should respond with notfound when review does not exist', async () => {
      req.params.reviewId = 'nonexistent';
      reviewModel.findOne.mockResolvedValue(null);

      await controller.remove(req, res);

      expect(responseHandler.notfound).toHaveBeenCalledWith(res);
    });

    it('should handle errors and call responseHandler.error', async () => {
      req.params.reviewId = 'errorId';
      reviewModel.findOne.mockRejectedValue(new Error('db error'));

      await controller.remove(req, res);

      expect(responseHandler.error).toHaveBeenCalledWith(res);
    });
  });

  describe('getReviewsOfUser', () => {
    it('should fetch reviews of the user and send ok response', async () => {
      const mockReviews = [{ id: 1 }, { id: 2 }];
      const sortMock = jest.fn().mockResolvedValue(mockReviews);
      reviewModel.find.mockReturnValue({ sort: sortMock });

      await controller.getReviewsOfUser(req, res);

      expect(reviewModel.find).toHaveBeenCalledWith({ user: 'userId' });
      expect(sortMock).toHaveBeenCalledWith('-createdAt');
      expect(responseHandler.ok).toHaveBeenCalledWith(res, mockReviews);
    });

    it('should handle errors and call responseHandler.error', async () => {
      reviewModel.find.mockImplementation(() => {
        throw new Error('query error');
      });

      await controller.getReviewsOfUser(req, res);

      expect(responseHandler.error).toHaveBeenCalledWith(res);
    });
  });
});