import { jest } from '@jest/globals';

jest.unstable_mockModule(
  '../dataset/external/digitomize__digitomize/backend/DSA_sheets/models/questionModel.js',
  () => {
    const MockQuestionModel = jest.fn().mockImplementation((data) => ({
      ...data,
    }));
    MockQuestionModel.find = jest.fn();
    MockQuestionModel.insertMany = jest.fn();
    MockQuestionModel.findOne = jest.fn();
    MockQuestionModel.findOneAndDelete = jest.fn();
    return {
      default: MockQuestionModel,
    };
  }
);

const QuestionModel = (
  await import(
    '../dataset/external/digitomize__digitomize/backend/DSA_sheets/models/questionModel.js'
  )
).default;

const { createQuestions, getQuestionByQId, deleteQuestionByQId } =
  await import(
    '../dataset/external/digitomize__digitomize/backend/DSA_sheets/controllers/questionController.js'
  );

describe('questionController', () => {
  let req;
  let res;

  beforeEach(() => {
    jest.clearAllMocks();
    req = { body: {} };
    res = {
      status: jest.fn().mockReturnThis(),
      json: jest.fn().mockReturnThis(),
    };
  });

  beforeAll(() => {
    jest.spyOn(console, 'error').mockImplementation(() => {});
  });

  afterAll(() => {
    console.error.mockRestore();
  });

  describe('createQuestions', () => {
    it('should return 400 if questionsData is not an array', async () => {
      req.body = 'not an array';

      await createQuestions(req, res);

      expect(res.status).toHaveBeenCalledWith(400);
      expect(res.json).toHaveBeenCalledWith({
        error: 'Bad Request',
        message: 'Invalid or empty array of questions provided.',
      });
    });

    it('should return 400 if questionsData is an empty array', async () => {
      req.body = [];

      await createQuestions(req, res);

      expect(res.status).toHaveBeenCalledWith(400);
      expect(res.json).toHaveBeenCalledWith({
        error: 'Bad Request',
        message: 'Invalid or empty array of questions provided.',
      });
    });

    it('should return 409 if any question q_id already exists', async () => {
      req.body = [{ q_id: 'q1' }, { q_id: 'q2' }];
      QuestionModel.find.mockResolvedValue([{ q_id: 'q1' }]);

      await createQuestions(req, res);

      expect(QuestionModel.find).toHaveBeenCalledWith({
        q_id: { $in: ['q1', 'q2'] },
      });
      expect(res.status).toHaveBeenCalledWith(409);
      expect(res.json).toHaveBeenCalledWith({
        error: 'Conflict',
        message: 'Questions with the following q_ids already exist: q1.',
      });
    });

    it('should create and return 201 with saved questions on success', async () => {
      const questionsData = [{ q_id: 'q1', title: 'Q1' }, { q_id: 'q2', title: 'Q2' }];
      req.body = questionsData;

      QuestionModel.find.mockResolvedValue([]);
      QuestionModel.insertMany.mockResolvedValue(questionsData);

      await createQuestions(req, res);

      expect(QuestionModel.find).toHaveBeenCalledWith({
        q_id: { $in: ['q1', 'q2'] },
      });
      expect(QuestionModel.insertMany).toHaveBeenCalledWith(
        expect.arrayContaining([
          expect.objectContaining({ q_id: 'q1', title: 'Q1' }),
          expect.objectContaining({ q_id: 'q2', title: 'Q2' }),
        ])
      );
      expect(res.status).toHaveBeenCalledWith(201);
      expect(res.json).toHaveBeenCalledWith(questionsData);
    });

    it('should return 500 when an exception occurs', async () => {
      req.body = [{ q_id: 'q1' }];
      QuestionModel.find.mockRejectedValue(new Error('Database error'));

      await createQuestions(req, res);

      expect(res.status).toHaveBeenCalledWith(500);
      expect(res.json).toHaveBeenCalledWith({
        error: 'Internal Server Error',
        message: 'An unexpected error occurred. Please try again later.',
      });
    });
  });

  describe('getQuestionByQId', () => {
    it('should return 400 if q_id is not provided', async () => {
      req.body = {};

      await getQuestionByQId(req, res);

      expect(res.status).toHaveBeenCalledWith(400);
      expect(res.json).toHaveBeenCalledWith({
        error: 'Bad Request',
        message: 'q_id is required to get a question.',
      });
    });

    it('should return 404 if question is not found', async () => {
      req.body = { q_id: 'non_existent_id' };
      QuestionModel.findOne.mockResolvedValue(null);

      await getQuestionByQId(req, res);

      expect(QuestionModel.findOne).toHaveBeenCalledWith({ q_id: 'non_existent_id' });
      expect(res.status).toHaveBeenCalledWith(404);
      expect(res.json).toHaveBeenCalledWith({
        error: 'Not Found',
        message: 'Question not found.',
      });
    });

    it('should return 200 with the found question', async () => {
      const mockQuestion = { q_id: 'q1', title: 'Two Sum' };
      req.body = { q_id: 'q1' };
      QuestionModel.findOne.mockResolvedValue(mockQuestion);

      await getQuestionByQId(req, res);

      expect(QuestionModel.findOne).toHaveBeenCalledWith({ q_id: 'q1' });
      expect(res.status).toHaveBeenCalledWith(200);
      expect(res.json).toHaveBeenCalledWith(mockQuestion);
    });

    it('should return 500 when an exception occurs', async () => {
      req.body = { q_id: 'q1' };
      QuestionModel.findOne.mockRejectedValue(new Error('Database error'));

      await getQuestionByQId(req, res);

      expect(res.status).toHaveBeenCalledWith(500);
      expect(res.json).toHaveBeenCalledWith({
        error: 'Internal Server Error',
        message: 'An unexpected error occurred. Please try again later.',
      });
    });
  });

  describe('deleteQuestionByQId', () => {
    it('should return 400 if q_id is not provided', async () => {
      req.body = {};

      await deleteQuestionByQId(req, res);

      expect(res.status).toHaveBeenCalledWith(400);
      expect(res.json).toHaveBeenCalledWith({
        error: 'Bad Request',
        message: 'q_id is required for deletion.',
      });
    });

    it('should return 404 if question to delete is not found', async () => {
      req.body = { q_id: 'non_existent_id' };
      QuestionModel.findOneAndDelete.mockResolvedValue(null);

      await deleteQuestionByQId(req, res);

      expect(QuestionModel.findOneAndDelete).toHaveBeenCalledWith({ q_id: 'non_existent_id' });
      expect(res.status).toHaveBeenCalledWith(404);
      expect(res.json).toHaveBeenCalledWith({
        error: 'Not Found',
        message: 'Question not found for deletion.',
      });
    });

    it('should return 200 and success status with deleted question', async () => {
      const mockDeletedQuestion = { q_id: 'q1', title: 'Two Sum' };
      req.body = { q_id: 'q1' };
      QuestionModel.findOneAndDelete.mockResolvedValue(mockDeletedQuestion);

      await deleteQuestionByQId(req, res);

      expect(QuestionModel.findOneAndDelete).toHaveBeenCalledWith({ q_id: 'q1' });
      expect(res.status).toHaveBeenCalledWith(200);
      expect(res.json).toHaveBeenCalledWith({
        status: 'success',
        message: 'Question deleted successfully.',
        deletedQuestion: mockDeletedQuestion,
      });
    });

    it('should return 500 when an exception occurs', async () => {
      req.body = { q_id: 'q1' };
      QuestionModel.findOneAndDelete.mockRejectedValue(new Error('Database error'));

      await deleteQuestionByQId(req, res);

      expect(res.status).toHaveBeenCalledWith(500);
      expect(res.json).toHaveBeenCalledWith({
        error: 'Internal Server Error',
        message: 'An unexpected error occurred. Please try again later.',
      });
    });
  });
});