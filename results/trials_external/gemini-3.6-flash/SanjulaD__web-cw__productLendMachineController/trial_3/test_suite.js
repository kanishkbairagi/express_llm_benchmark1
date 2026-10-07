import { jest } from '@jest/globals';

jest.mock('../dataset/external/SanjulaD__web-cw/backend/models/productLendMachineModel.js', () => {
    const mockModel = jest.fn().mockImplementation(function (data) {
        Object.assign(this, data);
        this.save = jest.fn().mockResolvedValue({ _id: 'created_id', ...data });
    });
    mockModel.find = jest.fn();
    mockModel.findById = jest.fn();
    return mockModel;
});

import ProductLendMachines from '../dataset/external/SanjulaD__web-cw/backend/models/productLendMachineModel.js';
import {
    getLendMachnines,
    getLendMachnineById,
    deleteLendMachnine,
    createLendMachine,
    updateLendMachine
} from '../dataset/external/SanjulaD__web-cw/backend/controllers/productLendMachineController.js';

describe('Product Lend Machine Controller', () => {
    let req;
    let res;
    let next;

    beforeEach(() => {
        jest.clearAllMocks();
        req = {
            params: {},
            body: {},
            user: { _id: 'user_123' }
        };
        res = {
            json: jest.fn(),
            status: jest.fn().mockReturnThis()
        };
        next = jest.fn();
    });

    describe('getLendMachnines', () => {
        it('should fetch all lend machines and return json response', async () => {
            const mockMachines = [{ name: 'Machine 1' }, { name: 'Machine 2' }];
            ProductLendMachines.find.mockResolvedValue(mockMachines);

            await getLendMachnines(req, res, next);

            expect(ProductLendMachines.find).toHaveBeenCalledWith({});
            expect(res.json).toHaveBeenCalledWith(mockMachines);
        });
    });

    describe('getLendMachnineById', () => {
        it('should return machine when found by id', async () => {
            req.params.id = 'machine_123';
            const mockMachine = { _id: 'machine_123', name: 'Test Machine' };
            ProductLendMachines.findById.mockResolvedValue(mockMachine);

            await getLendMachnineById(req, res, next);

            expect(ProductLendMachines.findById).toHaveBeenCalledWith('machine_123');
            expect(res.json).toHaveBeenCalledWith(mockMachine);
        });

        it('should return 404 and pass error to next if machine not found', async () => {
            req.params.id = 'non_existing_id';
            ProductLendMachines.findById.mockResolvedValue(null);

            await getLendMachnineById(req, res, next);

            expect(res.status).toHaveBeenCalledWith(404);
            expect(next).toHaveBeenCalledWith(expect.any(Error));
            expect(next.mock.calls[0][0].message).toBe('Machine not Found');
        });
    });

    describe('deleteLendMachnine', () => {
        it('should delete machine and return success message when found', async () => {
            req.params.id = 'machine_123';
            const mockMachine = {
                _id: 'machine_123',
                remove: jest.fn().mockResolvedValue({})
            };
            ProductLendMachines.findById.mockResolvedValue(mockMachine);

            await deleteLendMachnine(req, res, next);

            expect(ProductLendMachines.findById).toHaveBeenCalledWith('machine_123');
            expect(mockMachine.remove).toHaveBeenCalled();
            expect(res.json).toHaveBeenCalledWith({ message: 'Machine Removed' });
        });

        it('should return 404 and pass error to next when machine to delete is not found', async () => {
            req.params.id = 'non_existing_id';
            ProductLendMachines.findById.mockResolvedValue(null);

            await deleteLendMachnine(req, res, next);

            expect(res.status).toHaveBeenCalledWith(404);
            expect(next).toHaveBeenCalledWith(expect.any(Error));
            expect(next.mock.calls[0][0].message).toBe('Machine not Found');
        });
    });

    describe('createLendMachine', () => {
        it('should create a sample lend machine and return 201 status', async () => {
            await createLendMachine(req, res, next);

            expect(ProductLendMachines).toHaveBeenCalledWith({
                name: 'sample machine',
                user: 'user_123',
                image: '/images/farmMachine.jpg',
                description: 'sample description',
                target_plant: 'sample category',
                price: 0,
                quantity: 0,
                machine_power: '0HP'
            });
            expect(res.status).toHaveBeenCalledWith(201);
            expect(res.json).toHaveBeenCalledWith(
                expect.objectContaining({
                    name: 'sample machine',
                    user: 'user_123'
                })
            );
        });
    });

    describe('updateLendMachine', () => {
        it('should update machine and return updated data with 201 status', async () => {
            req.params.id = 'machine_123';
            req.body = {
                name: 'Updated Name',
                price: 150,
                image: '/images/updated.jpg',
                description: 'Updated Description',
                target_plant: 'Updated Plant',
                quantity: 10,
                machine_power: '50HP'
            };

            const existingMachine = {
                _id: 'machine_123',
                name: 'Old Name',
                save: jest.fn().mockImplementation(function () {
                    return Promise.resolve(this);
                })
            };

            ProductLendMachines.findById.mockResolvedValue(existingMachine);

            await updateLendMachine(req, res, next);

            expect(ProductLendMachines.findById).toHaveBeenCalledWith('machine_123');
            expect(existingMachine.name).toBe('Updated Name');
            expect(existingMachine.price).toBe(150);
            expect(existingMachine.image).toBe('/images/updated.jpg');
            expect(existingMachine.description).toBe('Updated Description');
            expect(existingMachine.target_plant).toBe('Updated Plant');
            expect(existingMachine.quantity).toBe(10);
            expect(existingMachine.machine_power).toBe('50HP');
            expect(existingMachine.save).toHaveBeenCalled();
            expect(res.status).toHaveBeenCalledWith(201);
            expect(res.json).toHaveBeenCalledWith(existingMachine);
        });

        it('should return 401 and error when updating non-existent machine', async () => {
            req.params.id = 'non_existing_id';
            ProductLendMachines.findById.mockResolvedValue(null);

            await updateLendMachine(req, res, next);

            expect(res.status).toHaveBeenCalledWith(401);
            expect(next).toHaveBeenCalledWith(expect.any(Error));
            expect(next.mock.calls[0][0].message).toBe('Product not found');
        });
    });
});