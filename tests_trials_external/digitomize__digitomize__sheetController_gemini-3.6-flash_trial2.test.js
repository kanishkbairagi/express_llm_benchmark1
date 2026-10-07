import { jest } from '@jest/globals';

jest.mock('../dataset/external/digitomize__digitomize/backend/DSA_sheets/models/sheetModel.js');
jest.mock('../dataset/external/digitomize__digitomize/backend/DSA_sheets/controllers/questionController.js');

import SheetModel from '../dataset/external/digitomize__digitomize/backend/DSA_sheets/models/sheetModel.js';
import { getQuestionByQId } from '../dataset/external/digitomize__digitomize/backend/DSA_sheets/controllers/questionController.js';
import {
  createSheet,
  removeSheet,
  getSheets,
  addQuestions,
  removeQuestion,
} from '../dataset/external/digitomize__digitomize/backend/DSA_sheets/controllers/sheetController.js';

describe('sheetController', () => {
  let req;
  let res;
  let consoleSpy;

  beforeEach(() => {
    jest.clearAllMocks();
    consoleSpy = jest.spyOn(console, 'error').mockImplementation(() => {});

    req = {
      body: {},
      params: {},
    };

    res = {
      status: jest.fn().mockReturnThis(),
      json: jest.fn().mockReturnThis(),
    };
  });

  afterEach(() => {
    consoleSpy.mockRestore();
  });

  describe('createSheet', () => {
    it('should return 400 if required fields are missing', async () => {
      req.body = { name: 'Sheet 1', s_id: 's1' }; // missing desc and questions

      await createSheet(req, res);

      expect(res.status).toHaveBeenCalledWith(400);
      expect(res.json).toHaveBeenCalledWith({
        error: 'Bad Request',
        message: 'Missing required fields. Please provide name, s_id, desc, and questions.',
      });
    });

    it('should create and return a new sheet on success', async () => {
      const sheetData = {
        name: 'Striver SDE',
        s_id: 'striver-sde',
        desc: 'SDE Sheet',
        questions: ['q1', 'q2'],
      };
      req.body = sheetData;

      const mockSave = jest.fn().mockResolvedValue(sheetData);
      SheetModel.mockImplementation(() => ({
        save: mockSave,
      }));

      await createSheet(req, res);

      expect(SheetModel).toHaveBeenCalledWith(sheetData);
      expect(mockSave).toHaveBeenCalled();
      expect(res.status).toHaveBeenCalledWith(201);
      expect(res.json).toHaveBeenCalledWith(sheetData);
    });

    it('should return 500 when database operation throws an error', async () => {
      req.body = {
        name: 'Sheet 1',
        s_id: 's1',
        desc: 'Desc 1',
        questions: ['q1'],
      };

      SheetModel.mockImplementation(() => ({
        save: jest.fn().mockRejectedValue(new Error('Database error')),
      }));

      await createSheet(req, res);

      expect(res.status).toHaveBeenCalledWith(500);
      expect(res.json).toHaveBeenCalledWith({
        error: 'Internal Server Error',
        message: 'An unexpected error occurred. Please try again later.',
      });
      expect(consoleSpy).toHaveBeenCalled();
    });
  });

  describe('removeSheet', () => {
    it('should return 400 if s_id is missing', async () => {
      req.body = {};

      await removeSheet(req, res);

      expect(res.status).toHaveBeenCalledWith(400);
      expect(res.json).toHaveBeenCalledWith({
        error: 'Bad Request',
        message: 'Missing required fields. Please provide s_id.',
      });
    });

    it('should return 404 if sheet is not found', async () => {
      req.body = { s_id: 'non-existent' };
      SheetModel.findOne.mockResolvedValue(null);

      await removeSheet(req, res);

      expect(SheetModel.findOne).toHaveBeenCalledWith({ s_id: 'non-existent' });
      expect(res.status).toHaveBeenCalledWith(404);
      expect(res.json).toHaveBeenCalledWith({
        error: 'Not Found',
        message: 'Sheet not found.',
      });
    });

    it('should remove the sheet and return 200 on success', async () => {
      req.body = { s_id: 's1' };
      SheetModel.findOne.mockResolvedValue({ s_id: 's1' });
      SheetModel.deleteOne.mockResolvedValue({ deletedCount: 1 });

      await removeSheet(req, res);

      expect(SheetModel.findOne).toHaveBeenCalledWith({ s_id: 's1' });
      expect(SheetModel.deleteOne).toHaveBeenCalledWith({ s_id: 's1' });
      expect(res.status).toHaveBeenCalledWith(200);
      expect(res.json).toHaveBeenCalledWith({
        status: 'success',
        message: 'Sheet removed successfully.',
      });
    });

    it('should return 500 if an error occurs during deletion', async () => {
      req.body = { s_id: 's1' };
      SheetModel.findOne.mockRejectedValue(new Error('DB failure'));

      await removeSheet(req, res);

      expect(res.status).toHaveBeenCalledWith(500);
      expect(res.json).toHaveBeenCalledWith({
        error: 'Internal Server Error',
        message: 'An unexpected error occurred. Please try again later.',
      });
      expect(consoleSpy).toHaveBeenCalled();
    });
  });

  describe('getSheets', () => {
    it('should fetch sheets and populate questions details', async () => {
      const mockSheets = [
        {
          s_id: 's1',
          questions: ['q1', 'q2'],
          toObject: () => ({ s_id: 's1', questions: ['q1', 'q2'] }),
        },
      ];

      SheetModel.find.mockResolvedValue(mockSheets);
      getQuestionByQId
        .mockResolvedValueOnce({ q_id: 'q1', name: 'Two Sum' })
        .mockResolvedValueOnce({ q_id: 'q2', name: 'Three Sum' });

      await getSheets(req, res);

      expect(SheetModel.find).toHaveBeenCalled();
      expect(getQuestionByQId).toHaveBeenCalledWith({ params: { q_id: 'q1' } });
      expect(getQuestionByQId).toHaveBeenCalledWith({ params: { q_id: 'q2' } });
      expect(res.status).toHaveBeenCalledWith(200);
      expect(res.json).toHaveBeenCalledWith({
        count: 1,
        sheets: [
          {
            s_id: 's1',
            questions: [
              { q_id: 'q1', name: 'Two Sum' },
              { q_id: 'q2', name: 'Three Sum' },
            ],
          },
        ],
      });
    });

    it('should handle empty sheets list', async () => {
      SheetModel.find.mockResolvedValue([]);

      await getSheets(req, res);

      expect(res.status).toHaveBeenCalledWith(200);
      expect(res.json).toHaveBeenCalledWith({
        count: 0,
        sheets: [],
      });
    });

    it('should return 500 when SheetModel.find fails', async () => {
      SheetModel.find.mockRejectedValue(new Error('Fetch failed'));

      await getSheets(req, res);

      expect(res.status).toHaveBeenCalledWith(500);
      expect(res.json).toHaveBeenCalledWith({
        error: 'Internal Server Error',
        message: 'An unexpected error occurred. Please try again later.',
      });
      expect(consoleSpy).toHaveBeenCalled();
    });
  });

  describe('addQuestions', () => {
    it('should return 400 if s_id or q_ids is missing/invalid', async () => {
      req.body = { s_id: 's1', q_ids: [] }; // empty array

      await addQuestions(req, res);

      expect(res.status).toHaveBeenCalledWith(400);
      expect(res.json).toHaveBeenCalledWith({
        error: 'Bad Request',
        message:
          'Invalid or missing required fields. Please provide s_id and a non-empty array of q_ids.',
      });
    });

    it('should return 404 if sheet is not found', async () => {
      req.body = { s_id: 's1', q_ids: ['q1'] };
      SheetModel.findOne.mockResolvedValue(null);

      await addQuestions(req, res);

      expect(res.status).toHaveBeenCalledWith(404);
      expect(res.json).toHaveBeenCalledWith({
        error: 'Not Found',
        message: 'Sheet not found.',
      });
    });

    it('should return 409 if any question already exists in sheet', async () => {
      req.body = { s_id: 's1', q_ids: ['q1', 'q2'] };
      const mockSheet = {
        s_id: 's1',
        questions: ['q1'],
      };
      SheetModel.findOne.mockResolvedValue(mockSheet);

      await addQuestions(req, res);

      expect(res.status).toHaveBeenCalledWith(409);
      expect(res.json).toHaveBeenCalledWith({
        error: 'Conflict',
        message: 'Questions with the following q_ids already exist in the sheet: q1.',
      });
    });

    it('should add questions and return 200 on success', async () => {
      req.body = { s_id: 's1', q_ids: ['q2', 'q3'] };
      const mockSheet = {
        s_id: 's1',
        questions: ['q1'],
        save: jest.fn().mockResolvedValue(true),
      };
      SheetModel.findOne.mockResolvedValue(mockSheet);

      await addQuestions(req, res);

      expect(mockSheet.questions).toEqual(['q1', 'q2', 'q3']);
      expect(mockSheet.save).toHaveBeenCalled();
      expect(res.status).toHaveBeenCalledWith(200);
      expect(res.json).toHaveBeenCalledWith({
        status: 'success',
        message: 'Questions added to the sheet successfully.',
        sheet: mockSheet,
      });
    });

    it('should return 500 when exception occurs', async () => {
      req.body = { s_id: 's1', q_ids: ['q1'] };
      SheetModel.findOne.mockRejectedValue(new Error('Server error'));

      await addQuestions(req, res);

      expect(res.status).toHaveBeenCalledWith(500);
      expect(res.json).toHaveBeenCalledWith({
        error: 'Internal Server Error',
        message: 'An unexpected error occurred. Please try again later.',
      });
    });
  });

  describe('removeQuestion', () => {
    it('should return 400 if s_id or q_id is missing', async () => {
      req.body = { s_id: 's1' };

      await removeQuestion(req, res);

      expect(res.status).toHaveBeenCalledWith(400);
      expect(res.json).toHaveBeenCalledWith({
        error: 'Bad Request',
        message: 'Missing required fields. Please provide s_id and q_id.',
      });
    });

    it('should return 404 if sheet is not found', async () => {
      req.body = { s_id: 's1', q_id: 'q1' };
      SheetModel.findOne.mockResolvedValue(null);

      await removeQuestion(req, res);

      expect(res.status).toHaveBeenCalledWith(404);
      expect(res.json).toHaveBeenCalledWith({
        error: 'Not Found',
        message: 'Sheet not found.',
      });
    });

    it('should return 404 if question is not in the sheet', async () => {
      req.body = { s_id: 's1', q_id: 'q99' };
      const mockSheet = {
        s_id: 's1',
        questions: ['q1', 'q2'],
      };
      SheetModel.findOne.mockResolvedValue(mockSheet);

      await removeQuestion(req, res);

      expect(res.status).toHaveBeenCalledWith(404);
      expect(res.json).toHaveBeenCalledWith({
        error: 'Not Found',
        message: 'Question not found in the sheet.',
      });
    });

    it('should remove question and return 200 on success', async () => {
      req.body = { s_id: 's1', q_id: 'q2' };
      const mockSheet = {
        s_id: 's1',
        questions: ['q1', 'q2', 'q3'],
        save: jest.fn().mockResolvedValue(true),
      };
      SheetModel.findOne.mockResolvedValue(mockSheet);

      await removeQuestion(req, res);

      expect(mockSheet.questions).toEqual(['q1', 'q3']);
      expect(mockSheet.save).toHaveBeenCalled();
      expect(res.status).toHaveBeenCalledWith(200);
      expect(res.json).toHaveBeenCalledWith({
        status: 'success',
        message: 'Question removed from the sheet successfully.',
        sheet: mockSheet,
      });
    });

    it('should return 500 when exception occurs', async () => {
      req.body = { s_id: 's1', q_id: 'q1' };
      SheetModel.findOne.mockRejectedValue(new Error('Unexpected error'));

      await removeQuestion(req, res);

      expect(res.status).toHaveBeenCalledWith(500);
      expect(res.json).toHaveBeenCalledWith({
        error: 'Internal Server Error',
        message: 'An unexpected error occurred. Please try again later.',
      });
    });
  });
});