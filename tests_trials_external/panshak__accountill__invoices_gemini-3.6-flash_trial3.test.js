import { jest } from '@jest/globals';
import mongoose from 'mongoose';

jest.mock('../models/InvoiceModel.js', () => {
  const MockInvoice = jest.fn().mockImplementation(function (data) {
    Object.assign(this, data);
    this.save = jest.fn();
  });
  MockInvoice.find = jest.fn();
  MockInvoice.countDocuments = jest.fn();
  MockInvoice.findById = jest.fn();
  MockInvoice.findByIdAndUpdate = jest.fn();
  MockInvoice.findByIdAndRemove = jest.fn();
  return {
    __esModule: true,
    default: MockInvoice,
  };
});

import InvoiceModel from '../models/InvoiceModel.js';
import {
  getInvoicesByUser,
  getTotalCount,
  getInvoices,
  createInvoice,
  getInvoice,
  updateInvoice,
  deleteInvoice,
} from '../dataset/external/panshak__accountill/server/controllers/invoices.js';

const mockRequest = (params = {}, query = {}, body = {}) => ({
  params,
  query,
  body,
});

const mockResponse = () => {
  const res = {};
  res.status = jest.fn().mockReturnValue(res);
  res.json = jest.fn().mockReturnValue(res);
  res.send = jest.fn().mockReturnValue(res);
  return res;
};

describe('Invoices Controller', () => {
  afterEach(() => {
    jest.clearAllMocks();
  });

  describe('getInvoicesByUser', () => {
    test('should return invoices for a given creator/searchQuery', async () => {
      const req = mockRequest({}, { searchQuery: 'user123' });
      const res = mockResponse();
      const mockData = [{ id: '1', creator: 'user123' }];
      InvoiceModel.find.mockResolvedValue(mockData);

      await getInvoicesByUser(req, res);

      expect(InvoiceModel.find).toHaveBeenCalledWith({ creator: 'user123' });
      expect(res.status).toHaveBeenCalledWith(200);
      expect(res.json).toHaveBeenCalledWith({ data: mockData });
    });

    test('should return status 404 when find fails', async () => {
      const req = mockRequest({}, { searchQuery: 'user123' });
      const res = mockResponse();
      const errorMessage = 'Database error';
      InvoiceModel.find.mockRejectedValue(new Error(errorMessage));

      await getInvoicesByUser(req, res);

      expect(res.status).toHaveBeenCalledWith(404);
      expect(res.json).toHaveBeenCalledWith({ message: errorMessage });
    });
  });

  describe('getTotalCount', () => {
    test('should return total count of invoices for searchQuery', async () => {
      const req = mockRequest({}, { searchQuery: 'user123' });
      const res = mockResponse();
      InvoiceModel.countDocuments.mockResolvedValue(10);

      await getTotalCount(req, res);

      expect(InvoiceModel.countDocuments).toHaveBeenCalledWith({ creator: 'user123' });
      expect(res.status).toHaveBeenCalledWith(200);
      expect(res.json).toHaveBeenCalledWith(10);
    });

    test('should return status 404 on error', async () => {
      const req = mockRequest({}, { searchQuery: 'user123' });
      const res = mockResponse();
      InvoiceModel.countDocuments.mockRejectedValue(new Error('Count failed'));

      await getTotalCount(req, res);

      expect(res.status).toHaveBeenCalledWith(404);
      expect(res.json).toHaveBeenCalledWith({ message: 'Count failed' });
    });
  });

  describe('getInvoices', () => {
    test('should return all invoices sorted by _id descending', async () => {
      const req = mockRequest();
      const res = mockResponse();
      const mockInvoices = [{ _id: '2' }, { _id: '1' }];
      InvoiceModel.find.mockReturnValue({
        sort: jest.fn().mockResolvedValue(mockInvoices),
      });

      await getInvoices(req, res);

      expect(InvoiceModel.find).toHaveBeenCalledWith({});
      expect(res.status).toHaveBeenCalledWith(200);
      expect(res.json).toHaveBeenCalledWith(mockInvoices);
    });

    test('should return status 409 on error', async () => {
      const req = mockRequest();
      const res = mockResponse();
      InvoiceModel.find.mockReturnValue({
        sort: jest.fn().mockRejectedValue(new Error('Find error')),
      });

      await getInvoices(req, res);

      expect(res.status).toHaveBeenCalledWith(409);
      expect(res.json).toHaveBeenCalledWith('Find error');
    });
  });

  describe('createInvoice', () => {
    test('should create and save a new invoice', async () => {
      const req = mockRequest({}, {}, { amount: 100, creator: 'user1' });
      const res = mockResponse();

      InvoiceModel.prototype.save = jest.fn().mockResolvedValue(true);

      await createInvoice(req, res);

      expect(res.status).toHaveBeenCalledWith(201);
      expect(res.json).toHaveBeenCalled();
    });

    test('should return status 409 on save failure', async () => {
      const req = mockRequest({}, {}, { amount: 100 });
      const res = mockResponse();

      InvoiceModel.prototype.save = jest.fn().mockRejectedValue(new Error('Save failed'));

      await createInvoice(req, res);

      expect(res.status).toHaveBeenCalledWith(409);
      expect(res.json).toHaveBeenCalledWith('Save failed');
    });
  });

  describe('getInvoice', () => {
    test('should return invoice by ID', async () => {
      const req = mockRequest({ id: 'inv123' });
      const res = mockResponse();
      const mockInvoice = { _id: 'inv123', amount: 500 };
      InvoiceModel.findById.mockResolvedValue(mockInvoice);

      await getInvoice(req, res);

      expect(InvoiceModel.findById).toHaveBeenCalledWith('inv123');
      expect(res.status).toHaveBeenCalledWith(200);
      expect(res.json).toHaveBeenCalledWith(mockInvoice);
    });

    test('should return status 409 on error', async () => {
      const req = mockRequest({ id: 'inv123' });
      const res = mockResponse();
      InvoiceModel.findById.mockRejectedValue(new Error('Fetch failed'));

      await getInvoice(req, res);

      expect(res.status).toHaveBeenCalledWith(409);
      expect(res.json).toHaveBeenCalledWith({ message: 'Fetch failed' });
    });
  });

  describe('updateInvoice', () => {
    test('should return 404 if invalid ObjectId', async () => {
      const req = mockRequest({ id: 'invalid-id' }, {}, { amount: 200 });
      const res = mockResponse();
      jest.spyOn(mongoose.Types.ObjectId, 'isValid').mockReturnValue(false);

      await updateInvoice(req, res);

      expect(res.status).toHaveBeenCalledWith(404);
      expect(res.send).toHaveBeenCalledWith('No invoice with that id');
    });

    test('should update invoice and return updated object', async () => {
      const req = mockRequest({ id: '507f1f77bcf86cd799439011' }, {}, { amount: 200 });
      const res = mockResponse();
      const updatedMock = { _id: '507f1f77bcf86cd799439011', amount: 200 };

      jest.spyOn(mongoose.Types.ObjectId, 'isValid').mockReturnValue(true);
      InvoiceModel.findByIdAndUpdate.mockResolvedValue(updatedMock);

      await updateInvoice(req, res);

      expect(InvoiceModel.findByIdAndUpdate).toHaveBeenCalledWith(
        '507f1f77bcf86cd799439011',
        { amount: 200, _id: '507f1f77bcf86cd799439011' },
        { new: true }
      );
      expect(res.json).toHaveBeenCalledWith(updatedMock);
    });
  });

  describe('deleteInvoice', () => {
    test('should return 404 if invalid ObjectId', async () => {
      const req = mockRequest({ id: 'invalid-id' });
      const res = mockResponse();
      jest.spyOn(mongoose.Types.ObjectId, 'isValid').mockReturnValue(false);

      await deleteInvoice(req, res);

      expect(res.status).toHaveBeenCalledWith(404);
      expect(res.send).toHaveBeenCalledWith('No invoice with that id');
    });

    test('should remove invoice and return success message', async () => {
      const req = mockRequest({ id: '507f1f77bcf86cd799439011' });
      const res = mockResponse();

      jest.spyOn(mongoose.Types.ObjectId, 'isValid').mockReturnValue(true);
      InvoiceModel.findByIdAndRemove.mockResolvedValue(true);

      await deleteInvoice(req, res);

      expect(InvoiceModel.findByIdAndRemove).toHaveBeenCalledWith('507f1f77bcf86cd799439011');
      expect(res.json).toHaveBeenCalledWith({ message: 'Invoice deleted successfully' });
    });
  });
});