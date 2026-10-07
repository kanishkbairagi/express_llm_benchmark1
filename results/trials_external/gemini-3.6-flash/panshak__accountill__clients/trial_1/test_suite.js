import { jest } from '@jest/globals';
import mongoose from 'mongoose';

jest.mock('../models/ClientModel.js');
import ClientModel from '../models/ClientModel.js';

import {
  getClient,
  getClients,
  createClient,
  updateClient,
  deleteClient,
  getClientsByUser,
} from '../dataset/external/panshak__accountill/server/controllers/clients.js';

describe('Clients Controller Unit Tests', () => {
  let req;
  let res;

  beforeEach(() => {
    req = {
      params: {},
      query: {},
      body: {},
    };
    res = {
      status: jest.fn().mockReturnThis(),
      json: jest.fn().mockReturnThis(),
      send: jest.fn().mockReturnThis(),
    };
    jest.clearAllMocks();
  });

  describe('getClient', () => {
    it('should return client with status 200 when client exists', async () => {
      const mockClient = { _id: '123', name: 'John Doe' };
      req.params = { id: '123' };
      ClientModel.findById = jest.fn().mockResolvedValue(mockClient);

      await getClient(req, res);

      expect(ClientModel.findById).toHaveBeenCalledWith('123');
      expect(res.status).toHaveBeenCalledWith(200);
      expect(res.json).toHaveBeenCalledWith(mockClient);
    });

    it('should return status 404 with error message when exception occurs', async () => {
      req.params = { id: '123' };
      ClientModel.findById = jest.fn().mockRejectedValue(new Error('Client not found'));

      await getClient(req, res);

      expect(res.status).toHaveBeenCalledWith(404);
      expect(res.json).toHaveBeenCalledWith({ message: 'Client not found' });
    });
  });

  describe('getClients', () => {
    it('should return paginated clients with correct meta data', async () => {
      req.query = { page: '2' };
      const mockClients = [{ name: 'Client 1' }, { name: 'Client 2' }];

      ClientModel.countDocuments = jest.fn().mockResolvedValue(20);

      const skipMock = jest.fn().mockResolvedValue(mockClients);
      const limitMock = jest.fn().mockReturnValue({ skip: skipMock });
      const sortMock = jest.fn().mockReturnValue({ limit: limitMock });
      ClientModel.find = jest.fn().mockReturnValue({ sort: sortMock });

      await getClients(req, res);

      expect(ClientModel.countDocuments).toHaveBeenCalledWith({});
      expect(ClientModel.find).toHaveBeenCalled();
      expect(sortMock).toHaveBeenCalledWith({ _id: -1 });
      expect(limitMock).toHaveBeenCalledWith(8);
      expect(skipMock).toHaveBeenCalledWith(8);
      expect(res.json).toHaveBeenCalledWith({
        data: mockClients,
        currentPage: 2,
        numberOfPages: 3,
      });
    });

    it('should return status 404 on error', async () => {
      req.query = { page: '1' };
      ClientModel.countDocuments = jest.fn().mockRejectedValue(new Error('Database error'));

      await getClients(req, res);

      expect(res.status).toHaveBeenCalledWith(404);
      expect(res.json).toHaveBeenCalledWith({ message: 'Database error' });
    });
  });

  describe('createClient', () => {
    it('should save new client and return status 201', async () => {
      req.body = { name: 'Jane Doe', email: 'jane@example.com' };
      const saveMock = jest.fn().mockResolvedValue();

      ClientModel.mockImplementation((data) => ({
        ...data,
        save: saveMock,
      }));

      await createClient(req, res);

      expect(saveMock).toHaveBeenCalled();
      expect(res.status).toHaveBeenCalledWith(201);
      expect(res.json).toHaveBeenCalledWith(
        expect.objectContaining({
          name: 'Jane Doe',
          email: 'jane@example.com',
          createdAt: expect.any(String),
        })
      );
    });

    it('should return status 409 when saving fails', async () => {
      req.body = { name: 'Jane Doe' };
      const saveMock = jest.fn().mockRejectedValue(new Error('Save error'));

      ClientModel.mockImplementation((data) => ({
        ...data,
        save: saveMock,
      }));

      await createClient(req, res);

      expect(res.status).toHaveBeenCalledWith(409);
      expect(res.json).toHaveBeenCalledWith('Save error');
    });
  });

  describe('updateClient', () => {
    it('should return status 404 if ObjectId is invalid', async () => {
      req.params = { id: 'invalid-id' };
      jest.spyOn(mongoose.Types.ObjectId, 'isValid').mockReturnValue(false);

      await updateClient(req, res);

      expect(res.status).toHaveBeenCalledWith(404);
      expect(res.send).toHaveBeenCalledWith('No client with that id');
    });

    it('should update client and return json when ID is valid', async () => {
      const validId = new mongoose.Types.ObjectId().toHexString();
      req.params = { id: validId };
      req.body = { name: 'Updated Name' };
      const updatedClient = { _id: validId, name: 'Updated Name' };

      jest.spyOn(mongoose.Types.ObjectId, 'isValid').mockReturnValue(true);
      ClientModel.findByIdAndUpdate = jest.fn().mockResolvedValue(updatedClient);

      await updateClient(req, res);

      expect(ClientModel.findByIdAndUpdate).toHaveBeenCalledWith(
        validId,
        { name: 'Updated Name', _id: validId },
        { new: true }
      );
      expect(res.json).toHaveBeenCalledWith(updatedClient);
    });
  });

  describe('deleteClient', () => {
    it('should return status 404 if ObjectId is invalid', async () => {
      req.params = { id: 'invalid-id' };
      jest.spyOn(mongoose.Types.ObjectId, 'isValid').mockReturnValue(false);

      await deleteClient(req, res);

      expect(res.status).toHaveBeenCalledWith(404);
      expect(res.send).toHaveBeenCalledWith('No Client with that id');
    });

    it('should remove client and return success message when ID is valid', async () => {
      const validId = new mongoose.Types.ObjectId().toHexString();
      req.params = { id: validId };

      jest.spyOn(mongoose.Types.ObjectId, 'isValid').mockReturnValue(true);
      ClientModel.findByIdAndRemove = jest.fn().mockResolvedValue({});

      await deleteClient(req, res);

      expect(ClientModel.findByIdAndRemove).toHaveBeenCalledWith(validId);
      expect(res.json).toHaveBeenCalledWith({ message: 'Client deleted successfully' });
    });
  });

  describe('getClientsByUser', () => {
    it('should return clients matching user search query', async () => {
      req.query = { searchQuery: 'user123' };
      const userClients = [{ userId: 'user123', name: 'User Client' }];
      ClientModel.find = jest.fn().mockResolvedValue(userClients);

      await getClientsByUser(req, res);

      expect(ClientModel.find).toHaveBeenCalledWith({ userId: 'user123' });
      expect(res.json).toHaveBeenCalledWith({ data: userClients });
    });

    it('should return status 404 on error', async () => {
      req.query = { searchQuery: 'user123' };
      ClientModel.find = jest.fn().mockRejectedValue(new Error('Search failed'));

      await getClientsByUser(req, res);

      expect(res.status).toHaveBeenCalledWith(404);
      expect(res.json).toHaveBeenCalledWith({ message: 'Search failed' });
    });
  });
});