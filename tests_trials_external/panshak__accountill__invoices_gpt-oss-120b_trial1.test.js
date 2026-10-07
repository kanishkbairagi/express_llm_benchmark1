import { jest } from '@jest/globals';

// Mock mongoose
jest.mock('mongoose', () => ({
    Types: {
        ObjectId: {
            isValid: jest.fn(),
        },
    },
}));

// Mock InvoiceModel
jest.mock('../dataset/external/panshak__accountill/server/models/InvoiceModel.js', () => {
    class MockInvoice {
        constructor(data) {
            Object.assign(this, data);
        }
        // instance method
        save = jest.fn().mockResolvedValue(undefined);
        // static methods
        static find = jest.fn();
        static countDocuments = jest.fn();
        static findById = jest.fn();
        static findByIdAndUpdate = jest.fn();
        static findByIdAndRemove = jest.fn();
    }
    return { __esModule: true, default: MockInvoice };
});

import {
    getInvoicesByUser,
    getTotalCount,
    getInvoices,
    createInvoice,
    getInvoice,
    updateInvoice,
    deleteInvoice,
} from '../dataset/external/panshak__accountill/server/controllers/invoices.js';
import InvoiceModel from '../dataset/external/panshak__accountill/server/models/InvoiceModel.js';
import mongoose from 'mongoose';

const mockRes = () => {
    const res = {};
    res.status = jest.fn().mockReturnValue(res);
    res.json = jest.fn().mockReturnValue(res);
    res.send = jest.fn().mockReturnValue(res);
    return res;
};

describe('Invoices Controller', () => {
    beforeEach(() => {
        jest.clearAllMocks();
    });

    describe('getInvoicesByUser', () => {
        it('should return invoices for a valid user', async () => {
            const fakeInvoices = [{ _id: '1' }, { _id: '2' }];
            InvoiceModel.find.mockResolvedValue(fakeInvoices);

            const req = { query: { searchQuery: 'user123' } };
            const res = mockRes();

            await getInvoicesByUser(req, res);

            expect(InvoiceModel.find).toHaveBeenCalledWith({ creator: 'user123' });
            expect(res.status).toHaveBeenCalledWith(200);
            expect(res.json).toHaveBeenCalledWith({ data: fakeInvoices });
        });

        it('should handle errors from the model', async () => {
            InvoiceModel.find.mockRejectedValue(new Error('db error'));

            const req = { query: { searchQuery: 'user123' } };
            const res = mockRes();

            await getInvoicesByUser(req, res);

            expect(res.status).toHaveBeenCalledWith(404);
            expect(res.json).toHaveBeenCalledWith({ message: 'db error' });
        });
    });

    describe('getTotalCount', () => {
        it('should return total count for a user', async () => {
            InvoiceModel.countDocuments.mockResolvedValue(7);

            const req = { query: { searchQuery: 'userA' } };
            const res = mockRes();

            await getTotalCount(req, res);

            expect(InvoiceModel.countDocuments).toHaveBeenCalledWith({ creator: 'userA' });
            expect(res.status).toHaveBeenCalledWith(200);
            expect(res.json).toHaveBeenCalledWith(7);
        });

        it('should handle model errors', async () => {
            InvoiceModel.countDocuments.mockRejectedValue(new Error('count fail'));

            const req = { query: { searchQuery: 'userA' } };
            const res = mockRes();

            await getTotalCount(req, res);

            expect(res.status).toHaveBeenCalledWith(404);
            expect(res.json).toHaveBeenCalledWith({ message: 'count fail' });
        });
    });

    describe('getInvoices', () => {
        it('should return all invoices sorted descending', async () => {
            const fakeInvoices = [{ _id: '3' }, { _id: '2' }, { _id: '1' }];
            InvoiceModel.find.mockReturnValue({
                sort: jest.fn().mockResolvedValue(fakeInvoices),
            });

            const req = {};
            const res = mockRes();

            await getInvoices(req, res);

            expect(InvoiceModel.find).toHaveBeenCalledWith({});
            expect(res.status).toHaveBeenCalledWith(200);
            expect(res.json).toHaveBeenCalledWith(fakeInvoices);
        });

        it('should handle errors from find/sort', async () => {
            InvoiceModel.find.mockReturnValue({
                sort: jest.fn().mockRejectedValue(new Error('sort error')),
            });

            const req = {};
            const res = mockRes();

            await getInvoices(req, res);

            expect(res.status).toHaveBeenCalledWith(409);
            expect(res.json).toHaveBeenCalledWith('sort error');
        });
    });

    describe('createInvoice', () => {
        it('should create and return a new invoice', async () => {
            const payload = { amount: 100, creator: 'userX' };
            const req = { body: payload };
            const res = mockRes();

            // Mock the instance's save to resolve
            const mockInstance = new InvoiceModel(payload);
            mockInstance.save.mockResolvedValue(undefined);
            jest.spyOn(InvoiceModel.prototype, 'constructor').mockReturnValue(mockInstance);

            await createInvoice(req, res);

            expect(mockInstance.save).toHaveBeenCalled();
            expect(res.status).toHaveBeenCalledWith(201);
            expect(res.json).toHaveBeenCalledWith(mockInstance);
        });

        it('should handle save errors', async () => {
            const payload = { amount: 200 };
            const req = { body: payload };
            const res = mockRes();

            const mockInstance = new InvoiceModel(payload);
            mockInstance.save.mockRejectedValue(new Error('save fail'));
            jest.spyOn(InvoiceModel.prototype, 'constructor').mockReturnValue(mockInstance);

            await createInvoice(req, res);

            expect(res.status).toHaveBeenCalledWith(409);
            expect(res.json).toHaveBeenCalledWith('save fail');
        });
    });

    describe('getInvoice', () => {
        it('should return invoice by id', async () => {
            const fakeInvoice = { _id: 'abc', amount: 50 };
            InvoiceModel.findById.mockResolvedValue(fakeInvoice);

            const req = { params: { id: 'abc' } };
            const res = mockRes();

            await getInvoice(req, res);

            expect(InvoiceModel.findById).toHaveBeenCalledWith('abc');
            expect(res.status).toHaveBeenCalledWith(200);
            expect(res.json).toHaveBeenCalledWith(fakeInvoice);
        });

        it('should handle errors from findById', async () => {
            InvoiceModel.findById.mockRejectedValue(new Error('not found'));

            const req = { params: { id: 'xyz' } };
            const res = mockRes();

            await getInvoice(req, res);

            expect(res.status).toHaveBeenCalledWith(409);
            expect(res.json).toHaveBeenCalledWith({ message: 'not found' });
        });
    });

    describe('updateInvoice', () => {
        it('should update and return the invoice when id is valid', async () => {
            mongoose.Types.ObjectId.isValid.mockReturnValue(true);
            const updated = { _id: 'upd1', amount: 999 };
            InvoiceModel.findByIdAndUpdate.mockResolvedValue(updated);

            const req = { params: { id: 'upd1' }, body: { amount: 999 } };
            const res = mockRes();

            await updateInvoice(req, res);

            expect(mongoose.Types.ObjectId.isValid).toHaveBeenCalledWith('upd1');
            expect(InvoiceModel.findByIdAndUpdate).toHaveBeenCalledWith(
                'upd1',
                { amount: 999, _id: 'upd1' },
                { new: true }
            );
            expect(res.json).toHaveBeenCalledWith(updated);
        });

        it('should respond with 404 when id is invalid', async () => {
            mongoose.Types.ObjectId.isValid.mockReturnValue(false);
            const req = { params: { id: 'invalid' } };
            const res = mockRes();

            await updateInvoice(req, res);

            expect(res.status).toHaveBeenCalledWith(404);
            expect(res.send).toHaveBeenCalledWith('No invoice with that id');
        });
    });

    describe('deleteInvoice', () => {
        it('should delete invoice when id is valid', async () => {
            mongoose.Types.ObjectId.isValid.mockReturnValue(true);
            InvoiceModel.findByIdAndRemove.mockResolvedValue(undefined);

            const req = { params: { id: 'del1' } };
            const res = mockRes();

            await deleteInvoice(req, res);

            expect(mongoose.Types.ObjectId.isValid).toHaveBeenCalledWith('del1');
            expect(InvoiceModel.findByIdAndRemove).toHaveBeenCalledWith('del1');
            expect(res.json).toHaveBeenCalledWith({ message: 'Invoice deleted successfully' });
        });

        it('should respond with 404 for invalid id', async () => {
            mongoose.Types.ObjectId.isValid.mockReturnValue(false);
            const req = { params: { id: 'bad' } };
            const res = mockRes();

            await deleteInvoice(req, res);

            expect(res.status).toHaveBeenCalledWith(404);
            expect(res.send).toHaveBeenCalledWith('No invoice with that id');
        });
    });
});