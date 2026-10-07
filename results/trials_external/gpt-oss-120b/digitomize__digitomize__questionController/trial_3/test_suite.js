import { jest } from '@jest/globals';
import {
  createQuestions,
  getQuestionByQId,
  deleteQuestionByQId,
} from '../dataset/external/digitomize__digitomize/backend/DSA_sheets/controllers/questionController.js';
import QuestionModel from '../dataset/external/digitomize__digitomize/backend/DSA_sheets/models/questionModel.js';

jest.mock(
  '../dataset/external/digitomize__digitomize/backend/DSA_sheets/models/questionModel.js',
);

const mockRes = () => {
  const res = {};
  res.status = jest.fn().mockReturnValue(res);
  res.json = jest.fn().mockReturnValue(res);
  return res;
};

describe('questionController', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  describe('createQuestions', () => {
    it('should return 400 when request body is not an array', async () => {
      const req = { body: {} };
      const res = mockRes();

      await createQuestions(req, res);

      expect(res.status).toHaveBeenCalledWith(400);
      expect(res.json).toHaveBeenCalledWith({
        error: 'Bad Request',
        message: 'Invalid or empty array of questions provided.',
      });
    });

    it('should return 400 when request body is an empty array', async () => {
      const req = { body: [] };
      const res = mockRes();

      await createQuestions(req, res);

      expect(res.status).toHaveBeenCalledWith(400);
      expect(res.json).toHaveBeenCalledWith({
        error: 'Bad Request',
        message: 'Invalid or empty array of questions provided.',
      });
    });

    it('should return 409 when duplicate q_id(s) exist', async () => {
      const req = {
        body: [
          { q_id: 'Q1', text: 'question 1' },
          { q_id: 'Q2', text: 'question 2' },
        ],
      };
      const res = mockRes();

      // Mock find to return an existing question for Q1
      QuestionModel.find.mockResolvedValueOnce([{ q_id: 'Q1' }]);

      await createQuestions(req, res);

      expect(QuestionModel.find).toHaveBeenCalledWith({
        q_id: { $in: ['Q1', 'Q2'] },
      });
      expect(res.status).toHaveBeenCalledWith(409);
      expect(res.json).toHaveBeenCalledWith({
        error: 'Conflict',
        message:
          'Questions with the following q_ids already exist: Q1.',
      });
    });

    it('should create questions and return 201 with saved data', async () => {
      const req = {
        body: [
          { q_id: 'Q3', text: 'question 3' },
          { q_id: 'Q4', text: 'question 4' },
        ],
      };
      const res = mockRes();

      // No duplicates
      QuestionModel.find.mockResolvedValueOnce([]);

      // Mock insertMany to resolve with saved documents
      const savedDocs = [
        { _id: '1', q_id: 'Q3', text: 'question 3' },
        { _id: '2', q_id: 'Q4', text: 'question 4' },
      ];
      QuestionModel.insertMany.mockResolvedValueOnce(savedDocs);

      await createQuestions(req, res);

      expect(QuestionModel.find).toHaveBeenCalledWith({
        q_id: { $in: ['Q3', 'Q4'] },
      });
      expect(QuestionModel.insertMany).toHaveBeenCalled();
      expect(res.status).toHaveBeenCalledWith(201);
      expect(res.json).toHaveBeenCalledWith(savedDocs);
    });

    it('should handle unexpected errors with 500', async () => {
      const req = { body: [{ q_id: 'Q5', text: 'question 5' }] };
      const res = mockRes();

      // Force find to throw
      const error = new Error('DB failure');
      QuestionModel.find.mockRejectedValueOnce(error);
      console.error = jest.fn(); // suppress console.error in test output

      await createQuestions(req, res);

      expect(res.status).toHaveBeenCalledWith(500);
      expect(res.json).toHaveBeenCalledWith({
        error: 'Internal Server Error',
        message: 'An unexpected error occurred. Please try again later.',
      });
    });
  });

  describe('getQuestionByQId', () => {
    it('should return 400 when q_id is missing', async () => {
      const req = { body: {} };
      const res = mockRes();

      await getQuestionByQId(req, res);

      expect(res.status).toHaveBeenCalledWith(400);
      expect(res.json).toHaveBeenCalledWith({
        error: 'Bad Request',
        message: 'q_id is required to get a question.',
      });
    });

    it('should return 404 when question not found', async () => {
      const req = { body: { q_id: 'NON_EXISTENT' } };
      const res = mockRes();

      QuestionModel.findOne.mockResolvedValueOnce(null);

      await getQuestionByQId(req, res);

      expect(QuestionModel.findOne).toHaveBeenCalledWith({ q_id: 'NON_EXISTENT' });
      expect(res.status).toHaveBeenCalledWith(404);
      expect(res.json).toHaveBeenCalledWith({
        error: 'Not Found',
        message: 'Question not found.',
      });
    });

    it('should return 200 with the found question', async () => {
      const req = { body: { q_id: 'Q6' } };
      const res = mockRes();

      const foundQuestion = { _id: '10', q_id: 'Q6', text: 'some question' };
      QuestionModel.findOne.mockResolvedValueOnce(foundQuestion);

      await getQuestionByQId(req, res);

      expect(QuestionModel.findOne).toHaveBeenCalledWith({ q_id: 'Q6' });
      expect(res.status).toHaveBeenCalledWith(200);
      expect(res.json).toHaveBeenCalledWith(foundQuestion);
    });

    it('should handle unexpected errors with 500', async () => {
      const req = { body: { q_id: 'Q7' } };
      const res = mockRes();

      QuestionModel.findOne.mockRejectedValueOnce(new Error('DB error'));
      console.error = jest.fn();

      await getQuestionByQId(req, res);

      expect(res.status).toHaveBeenCalledWith(500);
      expect(res.json).toHaveBeenCalledWith({
        error: 'Internal Server Error',
        message: 'An unexpected error occurred. Please try again later.',
      });
    });
  });

  describe('deleteQuestionByQId', () => {
    it('should return 400 when q_id is missing', async () => {
      const req = { body: {} };
      const res = mockRes();

      await deleteQuestionByQId(req, res);

      expect(res.status).toHaveBeenCalledWith(400);
      expect(res.json).toHaveBeenCalledWith({
        error: 'Bad Request',
        message: 'q_id is required for deletion.',
      });
    });

    it('should return 404 when question to delete does not exist', async () => {
      const req = { body: { q_id: 'MISSING' } };
      const res = mockRes();

      QuestionModel.findOneAndDelete.mockResolvedValueOnce(null);

      await deleteQuestionByQId(req, res);

      expect(QuestionModel.findOneAndDelete).toHaveBeenCalledWith({ q_id: 'MISSING' });
      expect(res.status).toHaveBeenCalledWith(404);
      expect(res.json).toHaveBeenCalledWith({
        error: 'Not Found',
        message: 'Question not found for deletion.',
      });
    });

    it('should delete the question and return 200 with details', async () => {
      const req = { body: { q_id: 'Q8' } };
      const res = mockRes();

      const deletedDoc = { _id: '20', q_id: 'Q8', text: 'to be deleted' };
      QuestionModel.findOneAndDelete.mockResolvedValueOnce(deletedDoc);

      await deleteQuestionByQId(req, res);

      expect(QuestionModel.findOneAndDelete).toHaveBeenCalledWith({ q_id: 'Q8' });
      expect(res.status).toHaveBeenCalledWith(200);
      expect(res.json).toHaveBeenCalledWith({
        status: 'success',
        message: 'Question deleted successfully.',
        deletedQuestion: deletedDoc,
      });
    });

    it('should handle unexpected errors with 500', async () => {
      const req = { body: { q_id: 'Q9' } };
      const res = mockRes();

      QuestionModel.findOneAndDelete.mockRejectedValueOnce(new Error('DB error'));
      console.error = jest.fn();

      await deleteQuestionByQId(req, res);

      expect(res.status).toHaveBeenCalledWith(500);
      expect(res.json).toHaveBeenCalledWith({
        error: 'Internal Server Error',
        message: 'An unexpected error occurred. Please try again later.',
      });
    });
  });
});