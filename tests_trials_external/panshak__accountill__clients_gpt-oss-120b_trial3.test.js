import { jest } from '@jest/globals';
import {
  getClient,
  getClients,
  createClient,
  updateClient,
  deleteClient,
  getClientsByUser,
} from '../dataset/external/panshak__accountill/server/controllers/clients.js';
import mongoose from 'mongoose';

// ----- Mock the ClientModel -----
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
import ClientModel from '../dataset/external/panshak__accountill/server/models/ClientModel.js';

// ----- Helper to build a mock response -----
const mockResponse = () => {
  const res = {};
  res.status = jest.fn().mockReturnValue(res);
  res.json = jest.fn().mockReturnValue(res);
  res.send = jest.fn().mockReturnValue(res);
  return res;
};

describe('clients controller', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    // default ObjectId validation to true
    jest.spyOn(mongoose.Types.ObjectId, 'isValid').mockReturnValue(true);
  });

  // -------- getClient ----------
  it('getClient returns client with status 200', async () => {
    const req = { params: { id: '123' } };
    const res = mockResponse();
    const fakeClient = { _id: '123', name: 'Test' };
    ClientModel.findById.mockResolvedValue(fakeClient);

    await getClient(req, res);

    expect(ClientModel.findById).toHaveBeenCalledWith('123');
    expect(res.status).toHaveBeenCalledWith(200);
    expect(res.json).toHaveBeenCalledWith(fakeClient);
  });

  it('getClient handles errors with status 404', async () => {
    const req = { params: { id: 'bad' } };
    const res = mockResponse();
    const error = new Error('Not found');
    ClientModel.findById.mockRejectedValue(error);

    await getClient(req, res);

    expect(res.status).toHaveBeenCalledWith(404);
    expect(res.json).toHaveBeenCalledWith({ message: error.message });
  });

  // -------- getClients ----------
  it('getClients returns paginated data', async () => {
    const req = { query: { page: '2' } };
    const res = mockResponse();

    const totalDocs = 20;
    const fakeClients = [{ _id: 'a' }, { _id: 'b' }];
    ClientModel.countDocuments.mockResolvedValue(totalDocs);
    ClientModel.find.mockReturnValue({
      sort: () => ({
        limit: () => ({
          skip: () => Promise.resolve(fakeClients),
        }),
      }),
    });

    await getClients(req, res);

    expect(ClientModel.countDocuments).toHaveBeenCalledWith({});
    expect(ClientModel.find).toHaveBeenCalled();
    expect(res.json).toHaveBeenCalledWith({
      data: fakeClients,
      currentPage: 2,
      numberOfPages: Math.ceil(totalDocs / 8),
    });
  });

  it('getClients handles errors with status 404', async () => {
    const req = { query: { page: '1' } };
    const res = mockResponse();
    const error = new Error('DB error');
    ClientModel.countDocuments.mockRejectedValue(error);

    await getClients(req, res);

    expect(res.status).toHaveBeenCalledWith(404);
    expect(res.json).toHaveBeenCalledWith({ message: error.message });
  });

  // -------- createClient ----------
  it('createClient saves a new client and returns 201', async () => {
    const req = { body: { name: 'New' } };
    const res = mockResponse();

    const savedClient = { _id: 'new', name: 'New', createdAt: expect.any(String) };
    // mock the instance returned by new ClientModel()
    const saveMock = jest.fn().mockResolvedValue();
    const MockedClientClass = jest.fn(() => ({
      ...savedClient,
      save: saveMock,
    }));
    jest.doMock('../dataset/external/panshak__accountill/server/models/ClientModel.js', () => ({
      __esModule: true,
      default: MockedClientClass,
    }));

    // re-import after mocking class
    const { createClient } = await import(
      '../dataset/external/panshak__accountill/server/controllers/clients.js'
    );

    await createClient(req, res);

    expect(saveMock).toHaveBeenCalled();
    expect(res.status).toHaveBeenCalledWith(201);
    expect(res.json).toHaveBeenCalledWith(expect.objectContaining({ name: 'New' }));
  });

  it('createClient handles validation errors with status 409', async () => {
    const req = { body: { name: 'Bad' } };
    const res = mockResponse();

    const saveMock = jest.fn().mockRejectedValue(new Error('Validation error'));
    const MockedClientClass = jest.fn(() => ({
      save: saveMock,
    }));
    jest.doMock('../dataset/external/panshak__accountill/server/models/ClientModel.js', () => ({
      __esModule: true,
      default: MockedClientClass,
    }));

    const { createClient } = await import(
      '../dataset/external/panshak__accountill/server/controllers/clients.js'
    );

    await createClient(req, res);

    expect(res.status).toHaveBeenCalledWith(409);
    expect(res.json).toHaveBeenCalledWith('Validation error');
  });

  // -------- updateClient ----------
  it('updateClient returns updated client when id is valid', async () => {
    const req = { params: { id: 'validId' }, body: { name: 'Updated' } };
    const res = mockResponse();
    const updated = { _id: 'validId', name: 'Updated' };
    ClientModel.findByIdAndUpdate.mockResolvedValue(updated);

    await updateClient(req, res);

    expect(mongoose.Types.ObjectId.isValid).toHaveBeenCalledWith('validId');
    expect(ClientModel.findByIdAndUpdate).toHaveBeenCalledWith(
      'validId',
      { name: 'Updated', _id: 'validId' },
      { new: true }
    );
    expect(res.json).toHaveBeenCalledWith(updated);
  });

  it('updateClient rejects invalid ObjectId with 404', async () => {
    const req = { params: { id: 'bad' }, body: {} };
    const res = mockResponse();
    mongoose.Types.ObjectId.isValid.mockReturnValueOnce(false);

    await updateClient(req, res);

    expect(res.status).toHaveBeenCalledWith(404);
    expect(res.send).toHaveBeenCalledWith('No client with that id');
    expect(ClientModel.findByIdAndUpdate).not.toHaveBeenCalled();
  });

  // -------- deleteClient ----------
  it('deleteClient removes client when id is valid', async () => {
    const req = { params: { id: 'validId' } };
    const res = mockResponse();
    ClientModel.findByIdAndRemove.mockResolvedValue({});

    await deleteClient(req, res);

    expect(mongoose.Types.ObjectId.isValid).toHaveBeenCalledWith('validId');
    expect(ClientModel.findByIdAndRemove).toHaveBeenCalledWith('validId');
    expect(res.json).toHaveBeenCalledWith({ message: 'Client deleted successfully' });
  });

  it('deleteClient rejects invalid ObjectId with 404', async () => {
    const req = { params: { id: 'bad' } };
    const res = mockResponse();
    mongoose.Types.ObjectId.isValid.mockReturnValueOnce(false);

    await deleteClient(req, res);

    expect(res.status).toHaveBeenCalledWith(404);
    expect(res.send).toHaveBeenCalledWith('No Client with that id');
    expect(ClientModel.findByIdAndRemove).not.toHaveBeenCalled();
  });

  // -------- getClientsByUser ----------
  it('getClientsByUser returns clients for given userId', async () => {
    const req = { query: { searchQuery: 'user123' } };
    const res = mockResponse();
    const userClients = [{ _id: 'c1', userId: 'user123' }];
    ClientModel.find.mockResolvedValue(userClients);

    await getClientsByUser(req, res);

    expect(ClientModel.find).toHaveBeenCalledWith({ userId: 'user123' });
    expect(res.json).toHaveBeenCalledWith({ data: userClients });
  });

  it('getClientsByUser handles errors with status 404', async () => {
    const req = { query: { searchQuery: 'user123' } };
    const res = mockResponse();
    const error = new Error('DB fail');
    ClientModel.find.mockRejectedValue(error);

    await getClientsByUser(req, res);

    expect(res.status).toHaveBeenCalledWith(404);
    expect(res.json).toHaveBeenCalledWith({ message: error.message });
  });
});