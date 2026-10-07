import { jest } from '@jest/globals';
import mongoose from 'mongoose';

jest.mock('../dataset/external/panshak__accountill/server/models/ClientModel.js');
import ClientModel from '../dataset/external/panshak__accountill/server/models/ClientModel.js';

import {
    getClient,
    getClients,
    createClient,
    updateClient,
    deleteClient,
    getClientsByUser
} from '../dataset/external/panshak__accountill/server/controllers/clients.js';

describe('Clients Controller Unit Tests', () => {
    let req;
    let res;

    beforeEach(() => {
        jest.clearAllMocks();
        req = {
            params: {},
            query: {},
            body: {}
        };
        res = {
            status: jest.fn().mockReturnThis(),
            json: jest.fn().mockReturnThis(),
            send: jest.fn().mockReturnThis()
        };
    });

    describe('getClient', () => {
        it('should return a client by ID with status 200', async () => {
            const mockClient = { _id: '123', name: 'John Doe', email: 'john@example.com' };
            req.params = { id: '123' };
            ClientModel.findById.mockResolvedValue(mockClient);

            await getClient(req, res);

            expect(ClientModel.findById).toHaveBeenCalledWith('123');
            expect(res.status).toHaveBeenCalledWith(200);
            expect(res.json).toHaveBeenCalledWith(mockClient);
        });

        it('should return status 404 if error occurs', async () => {
            req.params = { id: '123' };
            ClientModel.findById.mockRejectedValue(new Error('Client not found'));

            await getClient(req, res);

            expect(res.status).toHaveBeenCalledWith(404);
            expect(res.json).toHaveBeenCalledWith({ message: 'Client not found' });
        });
    });

    describe('getClients', () => {
        it('should return paginated clients data', async () => {
            req.query = { page: '2' };
            const mockClients = [{ _id: '1', name: 'Client 1' }, { _id: '2', name: 'Client 2' }];
            const totalDocs = 20;

            ClientModel.countDocuments.mockResolvedValue(totalDocs);

            const skipMock = jest.fn().mockResolvedValue(mockClients);
            const limitMock = jest.fn().mockReturnValue({ skip: skipMock });
            const sortMock = jest.fn().mockReturnValue({ limit: limitMock });
            ClientModel.find.mockReturnValue({ sort: sortMock });

            await getClients(req, res);

            expect(ClientModel.countDocuments).toHaveBeenCalledWith({});
            expect(ClientModel.find).toHaveBeenCalled();
            expect(sortMock).toHaveBeenCalledWith({ _id: -1 });
            expect(limitMock).toHaveBeenCalledWith(8);
            expect(skipMock).toHaveBeenCalledWith(8); // page 2: (2 - 1) * 8 = 8

            expect(res.json).toHaveBeenCalledWith({
                data: mockClients,
                currentPage: 2,
                numberOfPages: 3 // Math.ceil(20 / 8)
            });
        });

        it('should return status 404 on database error', async () => {
            req.query = { page: '1' };
            ClientModel.countDocuments.mockRejectedValue(new Error('Database error'));

            await getClients(req, res);

            expect(res.status).toHaveBeenCalledWith(404);
            expect(res.json).toHaveBeenCalledWith({ message: 'Database error' });
        });
    });

    describe('createClient', () => {
        it('should create a new client and return status 201', async () => {
            req.body = { name: 'Acme Corp', email: 'acme@example.com' };
            const saveMock = jest.fn().mockResolvedValue(true);

            ClientModel.mockImplementation((data) => ({
                ...data,
                save: saveMock
            }));

            await createClient(req, res);

            expect(saveMock).toHaveBeenCalled();
            expect(res.status).toHaveBeenCalledWith(201);
            expect(res.json).toHaveBeenCalledWith(expect.objectContaining({
                name: 'Acme Corp',
                email: 'acme@example.com',
                createdAt: expect.any(String)
            }));
        });

        it('should return status 409 if save fails', async () => {
            req.body = { name: 'Acme Corp' };
            const saveMock = jest.fn().mockRejectedValue(new Error('Validation failed'));

            ClientModel.mockImplementation((data) => ({
                ...data,
                save: saveMock
            }));

            await createClient(req, res);

            expect(res.status).toHaveBeenCalledWith(409);
            expect(res.json).toHaveBeenCalledWith('Validation failed');
        });
    });

    describe('updateClient', () => {
        it('should return 404 if the client ID is invalid', async () => {
            req.params = { id: 'invalid-id' };
            jest.spyOn(mongoose.Types.ObjectId, 'isValid').mockReturnValue(false);

            await updateClient(req, res);

            expect(res.status).toHaveBeenCalledWith(404);
            expect(res.send).toHaveBeenCalledWith('No client with that id');
        });

        it('should update and return the client if ID is valid', async () => {
            const validId = '507f1f77bcf86cd799439011';
            req.params = { id: validId };
            req.body = { name: 'Updated Corp' };

            jest.spyOn(mongoose.Types.ObjectId, 'isValid').mockReturnValue(true);
            const updatedClient = { _id: validId, name: 'Updated Corp' };
            ClientModel.findByIdAndUpdate.mockResolvedValue(updatedClient);

            await updateClient(req, res);

            expect(ClientModel.findByIdAndUpdate).toHaveBeenCalledWith(
                validId,
                { name: 'Updated Corp', _id: validId },
                { new: true }
            );
            expect(res.json).toHaveBeenCalledWith(updatedClient);
        });
    });

    describe('deleteClient', () => {
        it('should return 404 if the client ID is invalid', async () => {
            req.params = { id: 'invalid-id' };
            jest.spyOn(mongoose.Types.ObjectId, 'isValid').mockReturnValue(false);

            await deleteClient(req, res);

            expect(res.status).toHaveBeenCalledWith(404);
            expect(res.send).toHaveBeenCalledWith('No Client with that id');
        });

        it('should remove the client and return success message if ID is valid', async () => {
            const validId = '507f1f77bcf86cd799439011';
            req.params = { id: validId };

            jest.spyOn(mongoose.Types.ObjectId, 'isValid').mockReturnValue(true);
            ClientModel.findByIdAndRemove.mockResolvedValue(true);

            await deleteClient(req, res);

            expect(ClientModel.findByIdAndRemove).toHaveBeenCalledWith(validId);
            expect(res.json).toHaveBeenCalledWith({ message: 'Client deleted successfully' });
        });
    });

    describe('getClientsByUser', () => {
        it('should return clients for a specific user ID', async () => {
            req.query = { searchQuery: 'user_123' };
            const mockClients = [{ _id: '1', userId: 'user_123' }];
            ClientModel.find.mockResolvedValue(mockClients);

            await getClientsByUser(req, res);

            expect(ClientModel.find).toHaveBeenCalledWith({ userId: 'user_123' });
            expect(res.json).toHaveBeenCalledWith({ data: mockClients });
        });

        it('should return status 404 if query fails', async () => {
            req.query = { searchQuery: 'user_123' };
            ClientModel.find.mockRejectedValue(new Error('User not found'));

            await getClientsByUser(req, res);

            expect(res.status).toHaveBeenCalledWith(404);
            expect(res.json).toHaveBeenCalledWith({ message: 'User not found' });
        });
    });
});