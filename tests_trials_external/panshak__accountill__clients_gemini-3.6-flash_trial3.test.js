import { jest } from '@jest/globals';
import mongoose from 'mongoose';

jest.mock('../models/ClientModel.js', () => {
  const MockClientModel = jest.fn().mockImplementation(function (data) {
    Object.assign(this, data);
    this.save = jest.fn().mockResolvedValue(this);
  });
  MockClientModel.find = jest.fn();
  MockClientModel.findById = jest.fn();
  MockClientModel.countDocuments = jest.fn();
  MockClientModel.findByIdAndUpdate = jest.fn();
  MockClientModel.findByIdAndRemove = jest.fn();
  return {
    __esModule: true,
    default: MockClientModel
  };
});

jest.mock('mongoose', () => ({
  Types: {
    ObjectId: {
      isValid: jest.fn()
    }
  }
}));

import ClientModel from '../models/ClientModel.js';
import {
  getClient,
  getClients,
  createClient,
  updateClient,
  deleteClient,
  getClientsByUser
} from '../dataset/external/panshak__accountill/server/controllers/clients.js';

const mockRequest = (params = {}, body = {}, query = {}) => ({
  params,
  body,
  query
});

const mockResponse = () => {
  const res = {};
  res.status = jest.fn().mockReturnValue(res);
  res.json = jest.fn().mockReturnValue(res);
  res.send = jest.fn().mockReturnValue(res);
  return res;
};

describe('Client Controller', () => {
  afterEach(() => {
    jest.clearAllMocks();
  });

  describe('getClient', () => {
    test('should fetch a single client by id with 200 status', async () => {
      const mockClient = { _id: '123', name: 'John Doe' };
      ClientModel.findById.mockResolvedValue(mockClient);

      const req = mockRequest({ id: '123' });
      const res = mockResponse();

      await getClient(req, res);

      expect(ClientModel.findById).toHaveBeenCalledWith('123');
      expect(res.status).toHaveBeenCalledWith(200);
      expect(res.json).toHaveBeenCalledWith(mockClient);
    });

    test('should return 404 error if fetching client fails', async () => {
      ClientModel.findById.mockRejectedValue(new Error('Client not found'));

      const req = mockRequest({ id: 'invalid-id' });
      const res = mockResponse();

      await getClient(req, res);

      expect(res.status).toHaveBeenCalledWith(404);
      expect(res.json).toHaveBeenCalledWith({ message: 'Client not found' });
    });
  });

  describe('getClients', () => {
    test('should fetch paginated clients successfully', async () => {
      const mockClients = [{ name: 'Client 1' }, { name: 'Client 2' }];
      const totalClients = 16;

      const skipMock = jest.fn().mockResolvedValue(mockClients);
      const limitMock = jest.fn().mockReturnValue({ skip: skipMock });
      const sortMock = jest.fn().mockReturnValue({ limit: limitMock });

      ClientModel.countDocuments.mockResolvedValue(totalClients);
      ClientModel.find.mockReturnValue({ sort: sortMock });

      const req = mockRequest({}, {}, { page: '2' });
      const res = mockResponse();

      await getClients(req, res);

      expect(ClientModel.countDocuments).toHaveBeenCalledWith({});
      expect(ClientModel.find).toHaveBeenCalled();
      expect(sortMock).toHaveBeenCalledWith({ _id: -1 });
      expect(limitMock).toHaveBeenCalledWith(8);
      expect(skipMock).toHaveBeenCalledWith(8); // (2 - 1) * 8
      expect(res.json).toHaveBeenCalledWith({
        data: mockClients,
        currentPage: 2,
        numberOfPages: 2
      });
    });

    test('should return 404 error when fetching clients fails', async () => {
      ClientModel.countDocuments.mockRejectedValue(new Error('Database error'));

      const req = mockRequest({}, {}, { page: '1' });
      const res = mockResponse();

      await getClients(req, res);

      expect(res.status).toHaveBeenCalledWith(404);
      expect(res.json).toHaveBeenCalledWith({ message: 'Database error' });
    });
  });

  describe('createClient', () => {
    test('should create a new client and return status 201', async () => {
      const clientData = { name: 'Jane Doe', email: 'jane@example.com' };
      const req = mockRequest({}, clientData);
      const res = mockResponse();

      await createClient(req, res);

      expect(res.status).toHaveBeenCalledWith(201);
      expect(res.json).toHaveBeenCalled();
      const savedData = res.json.mock.calls[0][0];
      expect(savedData.name).toBe(clientData.name);
      expect(savedData.email).toBe(clientData.email);
      expect(savedData).toHaveProperty('createdAt');
    });

    test('should return status 409 if creating client fails', async () => {
      ClientModel.mockImplementationOnce(function (data) {
        Object.assign(this, data);
        this.save = jest.fn().mockRejectedValue(new Error('Creation failed'));
      });

      const req = mockRequest({}, { name: 'Jane Doe' });
      const res = mockResponse();

      await createClient(req, res);

      expect(res.status).toHaveBeenCalledWith(409);
      expect(res.json).toHaveBeenCalledWith('Creation failed');
    });
  });

  describe('updateClient', () => {
    test('should return status 404 if object id is invalid', async () => {
      mongoose.Types.ObjectId.isValid.mockReturnValue(false);

      const req = mockRequest({ id: 'invalid-id' }, { name: 'Updated Name' });
      const res = mockResponse();

      await updateClient(req, res);

      expect(res.status).toHaveBeenCalledWith(404);
      expect(res.send).toHaveBeenCalledWith('No client with that id');
    });

    test('should update client and return updated json when id is valid', async () => {
      const id = '507f1f77bcf86cd799439011';
      mongoose.Types.ObjectId.isValid.mockReturnValue(true);

      const updatedClient = { _id: id, name: 'Updated Name' };
      ClientModel.findByIdAndUpdate.mockResolvedValue(updatedClient);

      const req = mockRequest({ id }, { name: 'Updated Name' });
      const res = mockResponse();

      await updateClient(req, res);

      expect(ClientModel.findByIdAndUpdate).toHaveBeenCalledWith(
        id,
        { name: 'Updated Name', _id: id },
        { new: true }
      );
      expect(res.json).toHaveBeenCalledWith(updatedClient);
    });
  });

  describe('deleteClient', () => {
    test('should return status 404 if object id is invalid', async () => {
      mongoose.Types.ObjectId.isValid.mockReturnValue(false);

      const req = mockRequest({ id: 'invalid-id' });
      const res = mockResponse();

      await deleteClient(req, res);

      expect(res.status).toHaveBeenCalledWith(404);
      expect(res.send).toHaveBeenCalledWith('No Client with that id');
    });

    test('should delete client and return success message when id is valid', async () => {
      const id = '507f1f77bcf86cd799439011';
      mongoose.Types.ObjectId.isValid.mockReturnValue(true);
      ClientModel.findByIdAndRemove.mockResolvedValue({});

      const req = mockRequest({ id });
      const res = mockResponse();

      await deleteClient(req, res);

      expect(ClientModel.findByIdAndRemove).toHaveBeenCalledWith(id);
      expect(res.json).toHaveBeenCalledWith({ message: 'Client deleted successfully' });
    });
  });

  describe('getClientsByUser', () => {
    test('should return clients matching user search query', async () => {
      const mockClients = [{ name: 'User Client 1' }];
      ClientModel.find.mockResolvedValue(mockClients);

      const req = mockRequest({}, {}, { searchQuery: 'user123' });
      const res = mockResponse();

      await getClientsByUser(req, res);

      expect(ClientModel.find).toHaveBeenCalledWith({ userId: 'user123' });
      expect(res.json).toHaveBeenCalledWith({ data: mockClients });
    });

    test('should return 404 error when getClientsByUser fails', async () => {
      ClientModel.find.mockRejectedValue(new Error('User clients error'));

      const req = mockRequest({}, {}, { searchQuery: 'user123' });
      const res = mockResponse();

      await getClientsByUser(req, res);

      expect(res.status).toHaveBeenCalledWith(404);
      expect(res.json).toHaveBeenCalledWith({ message: 'User clients error' });
    });
  });
});