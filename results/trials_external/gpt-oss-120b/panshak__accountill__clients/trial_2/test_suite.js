import { jest } from '@jest/globals';
import {
  getClient,
  getClients,
  createClient,
  updateClient,
  deleteClient,
  getClientsByUser,
} from '../dataset/external/panshak__accountill/server/controllers/clients.js';

// Mock the ClientModel
jest.mock('../dataset/external/panshak__accountill/server/models/ClientModel.js', () => ({
  __esModule: true,
  default: {
    findById: jest.fn(),
    countDocuments: jest.fn(),
    find: jest.fn(),
    findByIdAndUpdate: jest.fn(),
    findByIdAndRemove: jest.fn(),
  },
}));

// Mock mongoose
jest.mock('mongoose', () => ({
  __esModule: true,
  Types: {
    ObjectId: {
      isValid: jest.fn(),
    },
  },
}));

// Import the mocked modules after jest.mock calls
import ClientModel from '../dataset/external/panshak__accountill/server/models/ClientModel.js';
import mongoose from 'mongoose';

const mockRes = () => {
  const res = {};
  res.status = jest.fn().mockReturnValue(res);
  res.json = jest.fn().mockReturnValue(res);
  res.send = jest.fn().mockReturnValue(res);
  return res;
};

describe('clients controller', () => {
  afterEach(() => {
    jest.clearAllMocks();
  });

  describe('getClient', () => {
    it('should return client with status 200 on success', async () => {
      const req = { params: { id: '123' } };
      const res = mockRes();
      const clientData = { _id: '123', name: 'Test' };
      ClientModel.findById.mockResolvedValue(clientData);

      await getClient(req, res);

      expect(ClientModel.findById).toHaveBeenCalledWith('123');
      expect(res.status).toHaveBeenCalledWith(200);
      expect(res.json).toHaveBeenCalledWith(clientData);
    });

    it('should return status 404 with error message on failure', async () => {
      const req = { params: { id: '123' } };
      const res = mockRes();
      const error = new Error('Not found');
      ClientModel.findById.mockRejectedValue(error);

      await getClient(req, res);

      expect(res.status).toHaveBeenCalledWith(404);
      expect(res.json).toHaveBeenCalledWith({ message: error.message });
    });
  });

  describe('getClients', () => {
    it('should return paginated clients data', async () => {
      const req = { query: { page: '2' } };
      const res = mockRes();
      const mockClients = [{ _id: 'c1' }, { _id: 'c2' }];
      const totalDocs = 20;

      ClientModel.countDocuments.mockResolvedValue(totalDocs);
      ClientModel.find.mockReturnValue({
        sort: jest.fn().mockReturnThis(),
        limit: jest.fn().mockReturnThis(),
        skip: jest.fn().mockResolvedValue(mockClients),
      });

      await getClients(req, res);

      expect(ClientModel.countDocuments).toHaveBeenCalledWith({});
      expect(ClientModel.find).toHaveBeenCalled();
      expect(res.json).toHaveBeenCalledWith({
        data: mockClients,
        currentPage: 2,
        numberOfPages: Math.ceil(totalDocs / 8),
      });
    });

    it('should handle errors with status 404', async () => {
      const req = { query: { page: '1' } };
      const res = mockRes();
      const error = new Error('DB error');
      ClientModel.countDocuments.mockRejectedValue(error);

      await getClients(req, res);

      expect(res.status).toHaveBeenCalledWith(404);
      expect(res.json).toHaveBeenCalledWith({ message: error.message });
    });
  });

  describe('createClient', () => {
    it('should create a client and respond with 201', async () => {
      const req = { body: { name: 'New Client' } };
      const res = mockRes();

      const savedClient = { _id: 'newId', name: 'New Client', createdAt: expect.any(String) };
      const mockSave = jest.fn().mockResolvedValue();
      // Mock the constructor to return an object with save()
      jest.spyOn(ClientModel, 'default').mockImplementation((data) => ({
        ...data,
        save: mockSave,
        toJSON: () => data,
      }));
      // Since the controller uses `new ClientModel(...)`, we need to mock the class.
      const OriginalClass = ClientModel.default;
      const MockedClass = function (data) {
        this._doc = data;
        this.save = mockSave;
      };
      MockedClass.prototype = Object.create(OriginalClass.prototype);
      jest.mocked(ClientModel.default).mockImplementation((data) => new MockedClass(data));

      // Actually easier: override the constructor directly
      const NewClientMock = function (data) {
        this._id = 'newId';
        this.name = data.name;
        this.createdAt = data.createdAt;
        this.save = mockSave;
      };
      // Replace default export with mock constructor
      jest.spyOn(ClientModel, 'default').mockImplementation((data) => new NewClientMock(data));

      await createClient(req, res);

      expect(mockSave).toHaveBeenCalled();
      expect(res.status).toHaveBeenCalledWith(201);
      expect(res.json).toHaveBeenCalledWith(expect.objectContaining({ name: 'New Client' }));
    });

    it('should respond with 409 on save error', async () => {
      const req = { body: { name: 'Bad Client' } };
      const res = mockRes();
      const error = new Error('Validation error');

      const mockSave = jest.fn().mockRejectedValue(error);
      jest.spyOn(ClientModel, 'default').mockImplementation((data) => ({
        ...data,
        save: mockSave,
      }));

      await createClient(req, res);

      expect(res.status).toHaveBeenCalledWith(409);
      expect(res.json).toHaveBeenCalledWith(error.message);
    });
  });

  describe('updateClient', () => {
    it('should return 404 when id is invalid', async () => {
      const req = { params: { id: 'invalid-id' }, body: { name: 'Update' } };
      const res = mockRes();
      mongoose.Types.ObjectId.isValid.mockReturnValue(false);

      await updateClient(req, res);

      expect(res.status).toHaveBeenCalledWith(404);
      expect(res.send).toHaveBeenCalledWith('No client with that id');
    });

    it('should update and return the updated client', async () => {
      const req = { params: { id: '60f6c0d5f1c2a2b8c8e4d9e1' }, body: { name: 'Updated' } };
      const res = mockRes();
      const updated = { _id: req.params.id, name: 'Updated' };
      mongoose.Types.ObjectId.isValid.mockReturnValue(true);
      ClientModel.findByIdAndUpdate.mockResolvedValue(updated);

      await updateClient(req, res);

      expect(ClientModel.findByIdAndUpdate).toHaveBeenCalledWith(
        req.params.id,
        { ...req.body, _id: req.params.id },
        { new: true }
      );
      expect(res.json).toHaveBeenCalledWith(updated);
    });
  });

  describe('deleteClient', () => {
    it('should return 404 when id is invalid', async () => {
      const req = { params: { id: 'bad' } };
      const res = mockRes();
      mongoose.Types.ObjectId.isValid.mockReturnValue(false);

      await deleteClient(req, res);

      expect(res.status).toHaveBeenCalledWith(404);
      expect(res.send).toHaveBeenCalledWith('No Client with that id');
    });

    it('should delete client and respond with success message', async () => {
      const req = { params: { id: '60f6c0d5f1c2a2b8c8e4d9e2' } };
      const res = mockRes();
      mongoose.Types.ObjectId.isValid.mockReturnValue(true);
      ClientModel.findByIdAndRemove.mockResolvedValue({});

      await deleteClient(req, res);

      expect(ClientModel.findByIdAndRemove).toHaveBeenCalledWith(req.params.id);
      expect(res.json).toHaveBeenCalledWith({ message: 'Client deleted successfully' });
    });
  });

  describe('getClientsByUser', () => {
    it('should return clients filtered by userId', async () => {
      const req = { query: { searchQuery: 'user123' } };
      const res = mockRes();
      const clients = [{ _id: 'c1', userId: 'user123' }];
      ClientModel.find.mockResolvedValue(clients);

      await getClientsByUser(req, res);

      expect(ClientModel.find).toHaveBeenCalledWith({ userId: 'user123' });
      expect(res.json).toHaveBeenCalledWith({ data: clients });
    });

    it('should handle errors with status 404', async () => {
      const req = { query: { searchQuery: 'user123' } };
      const res = mockRes();
      const error = new Error('DB fail');
      ClientModel.find.mockRejectedValue(error);

      await getClientsByUser(req, res);

      expect(res.status).toHaveBeenCalledWith(404);
      expect(res.json).toHaveBeenCalledWith({ message: error.message });
    });
  });
});