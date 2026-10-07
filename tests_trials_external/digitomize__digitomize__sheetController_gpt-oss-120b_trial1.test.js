import { jest } from '@jest/globals';
import {
  createSheet,
  removeSheet,
  addQuestions,
  getSheets,
} from '../dataset/external/digitomize__digitomize/backend/DSA_sheets/controllers/sheetController.js';
import SheetModel from '../dataset/external/digitomize__digitomize/backend/DSA_sheets/models/sheetModel.js';
import { getQuestionByQId } from '../dataset/external/digitomize__digitomize/backend/DSA_sheets/controllers/questionController.js';

jest.mock('../dataset/external/digitomize__digitomize/backend/DSA_sheets/models/sheetModel.js');
jest.mock('../dataset/external/digitomize__digitomize/backend/DSA_sheets/controllers/questionController.js');

const mockRes = () => {
  const res = {};
  res.status = jest.fn().mockReturnValue(res);
  res.json = jest.fn().mockReturnValue(res);
  return res;
};

describe('sheetController', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  describe('createSheet', () => {
    it('should create and return a sheet when valid data is provided', async () => {
      const req = {
        body: { name: 'Test', s_id: 's1', desc: 'desc', questions: [] },
      };
      const saved = { _id: '123', name: 'Test', s_id: 's1', desc: 'desc', questions: [] };
      SheetModel.mockImplementation(() => ({
        save: jest.fn().mockResolvedValue(saved),
      }));

      const res = mockRes();

      await createSheet(req, res);

      expect(res.status).toHaveBeenCalledWith(201);
      expect(res.json).toHaveBeenCalledWith(saved);
    });

    it('should return 400 when required fields are missing', async () => {
      const req = { body: { name: 'Test' } };
      const res = mockRes();

      await createSheet(req, res);

      expect(res.status).toHaveBeenCalledWith(400);
      expect(res.json).toHaveBeenCalledWith(
        expect.objectContaining({ error: 'Bad Request' })
      );
    });

    it('should return 500 when an unexpected error occurs', async () => {
      const req = {
        body: { name: 'Test', s_id: 's1', desc: 'desc', questions: [] },
      };
      SheetModel.mockImplementation(() => ({
        save: jest.fn().mockRejectedValue(new Error('DB failure')),
      }));
      const res = mockRes();

      await createSheet(req, res);

      expect(res.status).toHaveBeenCalledWith(500);
      expect(res.json).toHaveBeenCalledWith(
        expect.objectContaining({ error: 'Internal Server Error' })
      );
    });
  });

  describe('removeSheet', () => {
    it('should delete an existing sheet and return success', async () => {
      const req = { body: { s_id: 's1' } };
      const mockSheet = { s_id: 's1' };
      SheetModel.findOne = jest.fn().mockResolvedValue(mockSheet);
      SheetModel.deleteOne = jest.fn().mockResolvedValue({ deletedCount: 1 });

      const res = mockRes();

      await removeSheet(req, res);

      expect(SheetModel.findOne).toHaveBeenCalledWith({ s_id: 's1' });
      expect(SheetModel.deleteOne).toHaveBeenCalledWith({ s_id: 's1' });
      expect(res.status).toHaveBeenCalledWith(200);
      expect(res.json).toHaveBeenCalledWith(
        expect.objectContaining({ status: 'success' })
      );
    });

    it('should return 400 when s_id is missing', async () => {
      const req = { body: {} };
      const res = mockRes();

      await removeSheet(req, res);

      expect(res.status).toHaveBeenCalledWith(400);
      expect(res.json).toHaveBeenCalledWith(
        expect.objectContaining({ error: 'Bad Request' })
      );
    });

    it('should return 404 when sheet does not exist', async () => {
      const req = { body: { s_id: 'unknown' } };
      SheetModel.findOne = jest.fn().mockResolvedValue(null);
      const res = mockRes();

      await removeSheet(req, res);

      expect(res.status).toHaveBeenCalledWith(404);
      expect(res.json).toHaveBeenCalledWith(
        expect.objectContaining({ error: 'Not Found' })
      );
    });
  });

  describe('addQuestions', () => {
    const baseSheet = { s_id: 's1', questions: ['q1'] , save: jest.fn()};

    it('should add new questions to a sheet', async () => {
      const req = { body: { s_id: 's1', q_ids: ['q2', 'q3'] } };
      SheetModel.findOne = jest.fn().mockResolvedValue({ ...baseSheet });

      const res = mockRes();

      await addQuestions(req, res);

      expect(baseSheet.questions).toEqual(['q1', 'q2', 'q3']);
      expect(baseSheet.save).toHaveBeenCalled();
      expect(res.status).toHaveBeenCalledWith(200);
      expect(res.json).toHaveBeenCalledWith(
        expect.objectContaining({ status: 'success' })
      );
    });

    it('should reject when required fields are invalid', async () => {
      const req = { body: { s_id: 's1', q_ids: [] } };
      const res = mockRes();

      await addQuestions(req, res);

      expect(res.status).toHaveBeenCalledWith(400);
      expect(res.json).toHaveBeenCalledWith(
        expect.objectContaining({ error: 'Bad Request' })
      );
    });

    it('should return 404 if sheet not found', async () => {
      const req = { body: { s_id: 'missing', q_ids: ['q2'] } };
      SheetModel.findOne = jest.fn().mockResolvedValue(null);
      const res = mockRes();

      await addQuestions(req, res);

      expect(res.status).toHaveBeenCalledWith(404);
      expect(res.json).toHaveBeenCalledWith(
        expect.objectContaining({ error: 'Not Found' })
      );
    });

    it('should return 409 when trying to add duplicate question ids', async () => {
      const req = { body: { s_id: 's1', q_ids: ['q1', 'q4'] } };
      SheetModel.findOne = jest.fn().mockResolvedValue({ ...baseSheet });
      const res = mockRes();

      await addQuestions(req, res);

      expect(res.status).toHaveBeenCalledWith(409);
      expect(res.json).toHaveBeenCalledWith(
        expect.objectContaining({ error: 'Conflict' })
      );
    });
  });

  describe('getSheets', () => {
    it('should return sheets with expanded question details', async () => {
      const sheetDoc = {
        toObject: () => ({
          _id: 's1',
          name: 'Sheet 1',
          s_id: 's1',
          desc: '',
          questions: ['q1', 'q2'],
        }),
        questions: ['q1', 'q2'],
      };
      SheetModel.find = jest.fn().mockResolvedValue([sheetDoc]);

      getQuestionByQId.mockImplementation(({ params }) => {
        return Promise.resolve({ q_id: params.q_id, title: `Question ${params.q_id}` });
      });

      const req = {};
      const res = mockRes();

      await getSheets(req, res);

      expect(res.status).toHaveBeenCalledWith(200);
      const responsePayload = res.json.mock.calls[0][0];
      expect(responsePayload.count).toBe(1);
      expect(responsePayload.sheets[0].questions).toEqual([
        { q_id: 'q1', title: 'Question q1' },
        { q_id: 'q2', title: 'Question q2' },
      ]);
    });

    it('should handle errors and respond with 500', async () => {
      SheetModel.find = jest.fn().mockRejectedValue(new Error('DB error'));
      const req = {};
      const res = mockRes();

      await getSheets(req, res);

      expect(res.status).toHaveBeenCalledWith(500);
      expect(res.json).toHaveBeenCalledWith(
        expect.objectContaining({ error: 'Internal Server Error' })
      );
    });
  });
});