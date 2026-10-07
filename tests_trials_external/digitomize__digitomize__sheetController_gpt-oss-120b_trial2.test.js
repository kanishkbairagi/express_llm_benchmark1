import { jest } from '@jest/globals';
import {
  createSheet,
  removeSheet,
  getSheets,
  addQuestions,
  removeQuestion,
} from '../dataset/external/digitomize__digitomize/backend/DSA_sheets/controllers/sheetController.js';
import SheetModel from '../dataset/external/digitomize__digitomize/backend/DSA_sheets/models/sheetModel.js';
import { getQuestionByQId } from '../dataset/external/digitomize__digitomize/backend/DSA_sheets/controllers/questionController.js';

jest.mock(
  '../dataset/external/digitomize__digitomize/backend/DSA_sheets/models/sheetModel.js',
);
jest.mock(
  '../dataset/external/digitomize__digitomize/backend/DSA_sheets/controllers/questionController.js',
);

const makeRes = () => {
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
    it('should create and return a sheet on valid input', async () => {
      const savedObj = { _id: '123', name: 'Test', s_id: 's1', desc: 'd', questions: [] };
      const mockSave = jest.fn().mockResolvedValue(savedObj);
      SheetModel.mockImplementation(function (data) {
        this.save = mockSave;
        Object.assign(this, data);
      });

      const req = { body: { name: 'Test', s_id: 's1', desc: 'd', questions: [] } };
      const res = makeRes();

      await createSheet(req, res);

      expect(SheetModel).toHaveBeenCalledWith({
        name: 'Test',
        s_id: 's1',
        desc: 'd',
        questions: [],
      });
      expect(mockSave).toHaveBeenCalled();
      expect(res.status).toHaveBeenCalledWith(201);
      expect(res.json).toHaveBeenCalledWith(savedObj);
    });

    it('should return 400 when required fields are missing', async () => {
      const req = { body: { name: 'Test', s_id: 's1' } };
      const res = makeRes();

      await createSheet(req, res);

      expect(res.status).toHaveBeenCalledWith(400);
      expect(res.json).toHaveBeenCalledWith(
        expect.objectContaining({ error: 'Bad Request' })
      );
    });

    it('should return 500 on internal error', async () => {
      const mockSave = jest.fn().mockRejectedValue(new Error('boom'));
      SheetModel.mockImplementation(function (data) {
        this.save = mockSave;
        Object.assign(this, data);
      });

      const req = {
        body: { name: 'Test', s_id: 's1', desc: 'd', questions: [] },
      };
      const res = makeRes();

      await createSheet(req, res);

      expect(res.status).toHaveBeenCalledWith(500);
      expect(res.json).toHaveBeenCalledWith(
        expect.objectContaining({ error: 'Internal Server Error' })
      );
    });
  });

  describe('removeSheet', () => {
    it('should remove a sheet when found', async () => {
      SheetModel.findOne.mockResolvedValue({ s_id: 's1' });
      SheetModel.deleteOne.mockResolvedValue({ deletedCount: 1 });

      const req = { body: { s_id: 's1' } };
      const res = makeRes();

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
      const res = makeRes();

      await removeSheet(req, res);

      expect(res.status).toHaveBeenCalledWith(400);
    });

    it('should return 404 when sheet does not exist', async () => {
      SheetModel.findOne.mockResolvedValue(null);

      const req = { body: { s_id: 'missing' } };
      const res = makeRes();

      await removeSheet(req, res);

      expect(res.status).toHaveBeenCalledWith(404);
    });
  });

  describe('addQuestions', () => {
    const baseSheet = {
      s_id: 's1',
      questions: ['q1'],
      save: jest.fn().mockResolvedValue(),
    };

    it('should add new questions when none conflict', async () => {
      SheetModel.findOne.mockResolvedValue(baseSheet);
      const req = { body: { s_id: 's1', q_ids: ['q2', 'q3'] } };
      const res = makeRes();

      await addQuestions(req, res);

      expect(baseSheet.questions).toEqual(['q1', 'q2', 'q3']);
      expect(baseSheet.save).toHaveBeenCalled();
      expect(res.status).toHaveBeenCalledWith(200);
      expect(res.json).toHaveBeenCalledWith(
        expect.objectContaining({ status: 'success' })
      );
    });

    it('should return 409 when some questions already exist', async () => {
      SheetModel.findOne.mockResolvedValue(baseSheet);
      const req = { body: { s_id: 's1', q_ids: ['q1', 'q2'] } };
      const res = makeRes();

      await addQuestions(req, res);

      expect(res.status).toHaveBeenCalledWith(409);
      expect(res.json).toHaveBeenCalledWith(
        expect.objectContaining({ error: 'Conflict' })
      );
    });

    it('should return 400 for invalid payload', async () => {
      const req = { body: { s_id: 's1', q_ids: [] } };
      const res = makeRes();

      await addQuestions(req, res);

      expect(res.status).toHaveBeenCalledWith(400);
    });

    it('should return 404 when sheet not found', async () => {
      SheetModel.findOne.mockResolvedValue(null);
      const req = { body: { s_id: 'nope', q_ids: ['q2'] } };
      const res = makeRes();

      await addQuestions(req, res);

      expect(res.status).toHaveBeenCalledWith(404);
    });
  });

  describe('removeQuestion', () => {
    const sheetWithQuestions = {
      s_id: 's1',
      questions: ['q1', 'q2'],
      save: jest.fn().mockResolvedValue(),
    };

    it('should remove an existing question', async () => {
      SheetModel.findOne.mockResolvedValue(sheetWithQuestions);
      const req = { body: { s_id: 's1', q_id: 'q1' } };
      const res = makeRes();

      await removeQuestion(req, res);

      expect(sheetWithQuestions.questions).toEqual(['q2']);
      expect(sheetWithQuestions.save).toHaveBeenCalled();
      expect(res.status).toHaveBeenCalledWith(200);
    });

    it('should return 404 when question not in sheet', async () => {
      SheetModel.findOne.mockResolvedValue(sheetWithQuestions);
      const req = { body: { s_id: 's1', q_id: 'q3' } };
      const res = makeRes();

      await removeQuestion(req, res);

      expect(res.status).toHaveBeenCalledWith(404);
      expect(res.json).toHaveBeenCalledWith(
        expect.objectContaining({ error: 'Not Found' })
      );
    });

    it('should return 400 when required fields missing', async () => {
      const req = { body: { s_id: 's1' } };
      const res = makeRes();

      await removeQuestion(req, res);

      expect(res.status).toHaveBeenCalledWith(400);
    });

    it('should return 404 when sheet does not exist', async () => {
      SheetModel.findOne.mockResolvedValue(null);
      const req = { body: { s_id: 'nope', q_id: 'q1' } };
      const res = makeRes();

      await removeQuestion(req, res);

      expect(res.status).toHaveBeenCalledWith(404);
    });
  });

  describe('getSheets', () => {
    it('should fetch sheets and enrich with question details', async () => {
      const fakeSheets = [
        {
          toObject: () => ({ _id: '1', name: 'S1', questions: ['q1'] }),
          questions: ['q1'],
        },
        {
          toObject: () => ({ _id: '2', name: 'S2', questions: ['q2', 'q3'] }),
          questions: ['q2', 'q3'],
        },
      ];
      SheetModel.find.mockResolvedValue(fakeSheets);
      getQuestionByQId.mockImplementation(({ params }) => ({
        q_id: params.q_id,
        detail: `detail-${params.q_id}`,
      }));

      const req = {};
      const res = makeRes();

      await getSheets(req, res);

      expect(SheetModel.find).toHaveBeenCalled();
      expect(getQuestionByQId).toHaveBeenCalledTimes(3);
      expect(res.status).toHaveBeenCalledWith(200);
      expect(res.json).toHaveBeenCalledWith(
        expect.objectContaining({
          count: 2,
          sheets: expect.arrayContaining([
            expect.objectContaining({
              questions: expect.arrayContaining([
                expect.objectContaining({ q_id: 'q1' }),
              ]),
            }),
          ]),
        })
      );
    });

    it('should return 500 on error', async () => {
      SheetModel.find.mockRejectedValue(new Error('db fail'));

      const req = {};
      const res = makeRes();

      await getSheets(req, res);

      expect(res.status).toHaveBeenCalledWith(500);
    });
  });
});