import { jest } from '@jest/globals';

jest.mock('../dataset/external/SanjulaD__web-cw/backend/models/consumerProductModel.js', () => {
    const mockModel = jest.fn().mockImplementation(function (data) {
        Object.assign(this, data);
        this.save = jest.fn().mockResolvedValue(this);
    });
    mockModel.find = jest.fn();
    mockModel.findById = jest.fn();
    return mockModel;
});

import ConsumerProducts from '../dataset/external/SanjulaD__web-cw/backend/models/consumerProductModel.js';
import {
    getConsumerProducts,
    getConsumerProductById,
    deleteConsumerProduct,
    createConsumer,
    updateConsumer
} from '../dataset/external/SanjulaD__web-cw/backend/controllers/consumerProductControlller.js';

describe('Consumer Product Controller', () => {
    let req;
    let res;
    let next;

    beforeEach(() => {
        req = {
            params: {},
            body: {},
            user: {}
        };
        res = {
            status: jest.fn().mockReturnThis(),
            json: jest.fn().mockReturnThis()
        };
        next = jest.fn();
        jest.clearAllMocks();
    });

    describe('getConsumerProducts', () => {
        it('should fetch all consumer products and respond with json', async () => {
            const mockProducts = [{ name: 'Prod 1' }, { name: 'Prod 2' }];
            ConsumerProducts.find.mockResolvedValue(mockProducts);

            await getConsumerProducts(req, res, next);

            expect(ConsumerProducts.find).toHaveBeenCalledWith({});
            expect(res.json).toHaveBeenCalledWith(mockProducts);
        });
    });

    describe('getConsumerProductById', () => {
        it('should return a product if found by ID', async () => {
            const mockProduct = { _id: '123', name: 'Test Product' };
            req.params.id = '123';
            ConsumerProducts.findById.mockResolvedValue(mockProduct);

            await getConsumerProductById(req, res, next);

            expect(ConsumerProducts.findById).toHaveBeenCalledWith('123');
            expect(res.json).toHaveBeenCalledWith(mockProduct);
        });

        it('should set status 404 and throw error if product not found', async () => {
            req.params.id = 'nonexistent';
            ConsumerProducts.findById.mockResolvedValue(null);

            await expect(getConsumerProductById(req, res, next)).rejects.toThrow('Consumer Product not Found');
            expect(res.status).toHaveBeenCalledWith(404);
        });
    });

    describe('deleteConsumerProduct', () => {
        it('should remove product if found and return success message', async () => {
            const mockProduct = {
                _id: '123',
                remove: jest.fn().mockResolvedValue(true)
            };
            req.params.id = '123';
            ConsumerProducts.findById.mockResolvedValue(mockProduct);

            await deleteConsumerProduct(req, res, next);

            expect(ConsumerProducts.findById).toHaveBeenCalledWith('123');
            expect(mockProduct.remove).toHaveBeenCalled();
            expect(res.json).toHaveBeenCalledWith({ message: 'Consumer product removed' });
        });

        it('should set status 404 and throw error if product to delete is not found', async () => {
            req.params.id = 'nonexistent';
            ConsumerProducts.findById.mockResolvedValue(null);

            await expect(deleteConsumerProduct(req, res, next)).rejects.toThrow('Consumer Product not Found');
            expect(res.status).toHaveBeenCalledWith(404);
        });
    });

    describe('createConsumer', () => {
        it('should create a new product and return status 201 with created product', async () => {
            req.user = { _id: 'user123' };

            await createConsumer(req, res, next);

            expect(ConsumerProducts).toHaveBeenCalledWith({
                prod_name: 'Sample name',
                user: 'user123',
                seller_name: 'Sample seller',
                image: '/images/consumer/mogra_rice.jpg',
                price: 0,
                prod_size: '0kg',
                quantity: 0,
                avalaible_location: 'Sample location'
            });
            expect(res.status).toHaveBeenCalledWith(201);
            expect(res.json).toHaveBeenCalled();
        });
    });

    describe('updateConsumer', () => {
        it('should update and save product if found, returning status 201', async () => {
            req.params.id = '123';
            req.body = {
                prod_name: 'Updated Name',
                price: 100,
                image: '/images/updated.jpg',
                seller_name: 'Updated Seller',
                prod_size: '5kg',
                quantity: 10,
                avalaible_location: 'Updated Location'
            };

            const mockProduct = {
                _id: '123',
                save: jest.fn().mockResolvedValue(true)
            };
            ConsumerProducts.findById.mockResolvedValue(mockProduct);

            await updateConsumer(req, res, next);

            expect(ConsumerProducts.findById).toHaveBeenCalledWith('123');
            expect(mockProduct.prod_name).toBe('Updated Name');
            expect(mockProduct.price).toBe(100);
            expect(mockProduct.image).toBe('/images/updated.jpg');
            expect(mockProduct.seller_name).toBe('Updated Seller');
            expect(mockProduct.prod_size).toBe('5kg');
            expect(mockProduct.quantity).toBe(10);
            expect(mockProduct.avalaible_location).toBe('Updated Location');
            expect(mockProduct.save).toHaveBeenCalled();
            expect(res.status).toHaveBeenCalledWith(201);
            expect(res.json).toHaveBeenCalledWith(mockProduct);
        });

        it('should set status 401 and throw error if product to update is not found', async () => {
            req.params.id = 'nonexistent';
            req.body = {};
            ConsumerProducts.findById.mockResolvedValue(null);

            await expect(updateConsumer(req, res, next)).rejects.toThrow('Product not found');
            expect(res.status).toHaveBeenCalledWith(401);
        });
    });
});