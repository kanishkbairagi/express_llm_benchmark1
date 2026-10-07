import { jest } from '@jest/globals';

const mockQuestionModel = {
  find: jest.fn(),
  insertMany: jest.fn(),
  findOne: jest.fn(),
  findOneAndDelete: jest.fn(),
};

jest.unstable_mockModule(
  '../dataset/external/digitomize__digitomize/backend/DSA_sheets/models/questionModel.js',
  () => {
    const MockModel = jest.fn().mockImplementation((data) => ({ ...data }));
    MockModel.find = mockQuestionModel.find;
    MockModel.insertMany = mockQuestionModel.insertMany;
    MockModel.findOne = mockQuestionModel.findOne;
    MockModel.findOneAndDelete = mockQuestionModel.findOneAndDelete;
    return { default: MockModel };
  }
);

const { createQuestions, getQuestionByQId, deleteQuestionByQId } =
  await import(
    '../dataset/external/digitomize__digitomize/backend/DSA_sheets/controllers/questionController.js'
  );

describe('questionController', () => {
  let req;
  let res;
  let consoleSpy;

  beforeEach(() => {
    req = { body: {} };
    res = {
      status: jest.fn().mockReturnThis(),
      json: jest.fn().mockReturnThis(),
    };
    consoleSpy = jest.spyOn(console, 'error').mockImplementation(() => {});
    jest.clearAllMocks();
  });

  afterEach(() => {
    consoleSpy.mockRestore();
  });

  describe('createQuestions', () => {
    it('should return 400 if req.body is not an array', async () => {
      req.body = 'not an array';

      await createQuestions(req, res);

      expect(res.status).toHaveBeenCalledWith(400);
      expect(res.json).toHaveBeenCalledWith({
        error: 'Bad Request',
        message: 'Invalid or empty array of questions provided.',
      });
    });

    it('should return 400 if req.body is an empty array', async () => {
      req.body = [];

      await createQuestions(req, res);

      expect(res.status).toHaveBeenCalledWith(400);
      expect(res.json).toHaveBeenCalledWith({
        error: 'Bad Request',
        message: 'Invalid or empty array of questions provided.',
      });
    });

    it('should return 409 if duplicate q_ids exist in database', async () => {
      req.body = [{ q_id: 'q1' }, { q_id: 'q2' }];
      mockQuestionModel.find.mockResolvedValue([{ q_id: 'q1' }]);

      await createQuestions(req, res);

      expect(mockQuestionModel.find).toHaveBeenCalledWith({
        q_id: { $in: ['q1', 'q2'] },
      });
      expect(res.status).toHaveBeenCalledWith(409);
      expect(res.json).toHaveBeenCalledWith({
        error: 'Conflict',
        message: 'Questions with the following q_ids already exist: q1.',
      });
    });

    it('should create and return 201 with saved questions if valid', async () => {
      const questionsInput = [
        { q_id: 'q1', title: 'Two Sum' },
        { q_id: 'q2', title: '3Sum' },
      ];
      req.body = questionsInput;
      mockQuestionModel.find.mockResolvedValue([]);
      mockQuestionModel.insertMany.mockResolvedValue(questionsInput);

      await createQuestions(req, res);

      expect(mockQuestionModel.find).toHaveBeenCalledWith({
        q_id: { $in: ['q1', 'q2'] },
      });
      expect(mockQuestionModel.insertMany).toHaveBeenCalledWith([
        { q_id: 'q1', title: 'Two Sum' },
        { q_id: 'q2', title: '3Sum' },
      ]);
      expect(res.status).toHaveBeenCalledWith(201);
      expect(res.json).toHaveBeenCalledWith(questionsInput);
    });

    it('should return 500 when database operation throws an error', async () => {
      req.body = [{ q_id: 'q1' }];
      mockQuestionModel.find.mockRejectedValue(new Error('Database error'));

      await createQuestions(req, res);

      expect(res.status).toHaveBeenCalledWith(500);
      expect(res.json).toHaveBeenCalledWith({
        error: 'Internal Server Error',
        message: 'An unexpected error occurred. Please try again later.',
      });
      expect(consoleSpy).toHaveBeenCalled();
    });
  });

  describe('getQuestionByQId', () => {
    it('should return 400 if q_id is not provided in req.body', async () => {
      req.body = {};

      await getQuestionByQId(req, res);

      expect(res.status).toHaveBeenCalledWith(400);
      expect(res.json).toHaveBeenCalledWith({
        error: 'Bad Request',
        message: 'q_id is required to get a question.',
      });
    });

    it('should return 404 if question is not found', async () => {
      req.body = { q_id: 'q999' };
      mockQuestionModel.findOne.mockResolvedValue(null);

      await getQuestionByQId(req, res);

      expect(mockQuestionModel.findOne).toHaveBeenCalledWith({ q_id: 'q999' });
      expect(res.status).toHaveBeenCalledWith(404);
      expect(res.json).toHaveBeenCalledWith({
        error: 'Not Found',
        message: 'Question not found.',
      });
    });

    it('should return 200 and the question if found', async () => {
      const foundQuestion = { q_id: 'q1', title: 'Two Sum' };
      req.body = { q_id: 'q1' };
      mockQuestionModel.findOne.mockResolvedValue(foundQuestion);

      await getQuestionByQId(req, res);

      expect(mockQuestionModel.findOne).toHaveBeenCalledWith({ q_id: 'q1' });
      expect(res.status).toHaveBeenCalledWith(200);
      expect(res.json).toHaveBeenCalledWith(foundQuestion);
    });

    it('should return 500 when database query throws an error', async () => {
      req.body = { q_id: 'q1' };
      mockQuestionModel.findOne.mockRejectedValue(new Error('DB failure'));

      await getQuestionByQId(req, res);

      expect(res.status).toHaveBeenCalledWith(500);
      expect(res.json).toHaveBeenCalledWith({
        error: 'Internal Server Error',
        message: 'An unexpected error occurred. Please try again later.',
      });
      expect(consoleSpy).toHaveBeenCalled();
    });
  });

  describe('deleteQuestionByQId', () => {
    it('should return 400 if q_id is missing', async () => {
      req.body = {};

      await deleteQuestionByQId(req, res);

      expect(res.status).toHaveBeenCalledWith(400);
      expect(res.json).toHaveBeenCalledWith({
        error: 'Bad Request',
        message: 'q_id is required for deletion.',
      });
    });

    it('should return 404 if question to delete is not found', async () => {
      req.body = { q_id: 'q999' };
      mockQuestionModel.findOneAndDelete.mockResolvedValue(null);

      await deleteQuestionByQId(req, res);

      expect(mockQuestionModel.findOneAndDelete).toHaveBeenCalledWith({
        q_id: 'q999',
      });
      expect(res.status).toHaveBeenCalledWith(404);
      expect(res.json).toHaveBeenCalledWith({
        error: 'Not Found',
        message: 'Question not found for deletion.',
      });
    });

    it('should return 200 and success response when question is deleted', async () => {
      const deletedQuestion = { q_id: 'q1', title: 'Two Sum' };
      req.body = { q_id: 'q1' };
      mockQuestionModel.findOneAndDelete.mockResolvedValue(deletedQuestion);

      await deleteQuestionByQId(req, res);

      expect(mockQuestionModel.findOneAndDelete).toHaveBeenCalledWith({
        q_id: 'q1',
      });
      expect(res.status).toHaveBeenCalledWith(200);
      expect(res.json).toHaveBeenCalledWith({
        status: 'success',
        message: 'Question deleted successfully.',
        deletedQuestion,
      });
    });

    it('should return 500 when finding and deleting question fails', async () => {
      req.body = { q_id: 'q1' };
      mockQuestionModel.findOneAndDelete.mockRejectedValue(
        new Error('Delete failure')
      );

      await deleteQuestionByQId(req, res);

      expect(res.status).toHaveBeenCalledWith(500);
      expect(res.json).toHaveBeenCalledWith({
        error: 'Internal Server Error',
        message: 'An unexpected error occurred. Please try again later.',
      });
      expect(consoleSpy).toHaveBeenCalled();
    });
  });
});