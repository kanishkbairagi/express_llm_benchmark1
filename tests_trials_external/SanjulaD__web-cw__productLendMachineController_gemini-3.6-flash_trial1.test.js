import { jest } from '@jest/globals';
import ProductLendMachines from '../dataset/external/SanjulaD__web-cw/backend/models/productLendMachineModel.js';
import {
    getLendMachnines,
    getLendMachnineById,
    deleteLendMachnine,
    createLendMachine,
    updateLendMachine
} from '../dataset/external/SanjulaD__web-cw/backend/controllers/productLendMachineController.js';

jest.mock('../dataset/external/SanjulaD__web-cw/backend/models/productLendMachineModel.js', () => {
    const mockModel = jest.fn().mockImplementation((data) => ({
        ...data,
        save: jest.fn().mockResolvedValue({ _id: 'mocked_id', ...data })
    }));
    mockModel.find = jest.fn();
    mockModel.findById = jest.fn();
    return {
        __esModule: true,
        default: mockModel
    };
});

describe('productLendMachineController', () => {
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

    describe('getLendMachnines', () => {
        it('should fetch all lending machines and respond with json', async () => {
            const mockMachines = [
                { name: 'Machine 1', price: 100 },
                { name: 'Machine 2', price: 200 }
            ];
            ProductLendMachines.find.mockResolvedValue(mockMachines);

            await getLendMachnines(req, res, next);

            expect(ProductLendMachines.find).toHaveBeenCalledWith({});
            expect(res.json).toHaveBeenCalledWith(mockMachines);
        });
    });

    describe('getLendMachnineById', () => {
        it('should fetch lending machine by id if found', async () => {
            req.params.id = 'machine_123';
            const mockMachine = { _id: 'machine_123', name: 'Machine 1' };
            ProductLendMachines.findById.mockResolvedValue(mockMachine);

            await getLendMachnineById(req, res, next);

            expect(ProductLendMachines.findById).toHaveBeenCalledWith('machine_123');
            expect(res.json).toHaveBeenCalledWith(mockMachine);
        });

        it('should set status to 404 and pass error to next if machine not found', async () => {
            req.params.id = 'non_existent_id';
            ProductLendMachines.findById.mockResolvedValue(null);

            await getLendMachnineById(req, res, next);

            expect(ProductLendMachines.findById).toHaveBeenCalledWith('non_existent_id');
            expect(res.status).toHaveBeenCalledWith(404);
            expect(next).toHaveBeenCalledWith(expect.objectContaining({
                message: 'Machine not Found'
            }));
        });
    });

    describe('deleteLendMachnine', () => {
        it('should remove lending machine if found', async () => {
            req.params.id = 'machine_123';
            const mockMachine = {
                _id: 'machine_123',
                remove: jest.fn().mockResolvedValue()
            };
            ProductLendMachines.findById.mockResolvedValue(mockMachine);

            await deleteLendMachnine(req, res, next);

            expect(ProductLendMachines.findById).toHaveBeenCalledWith('machine_123');
            expect(mockMachine.remove).toHaveBeenCalled();
            expect(res.json).toHaveBeenCalledWith({ message: 'Machine Removed' });
        });

        it('should set status to 404 and pass error to next if machine not found for deletion', async () => {
            req.params.id = 'non_existent_id';
            ProductLendMachines.findById.mockResolvedValue(null);

            await deleteLendMachnine(req, res, next);

            expect(ProductLendMachines.findById).toHaveBeenCalledWith('non_existent_id');
            expect(res.status).toHaveBeenCalledWith(404);
            expect(next).toHaveBeenCalledWith(expect.objectContaining({
                message: 'Machine not Found'
            }));
        });
    });

    describe('createLendMachine', () => {
        it('should create a new lend machine and respond with status 201', async () => {
            req.user = { _id: 'user_456' };

            await createLendMachine(req, res, next);

            expect(ProductLendMachines).toHaveBeenCalledWith({
                name: 'sample machine',
                user: 'user_456',
                image: '/images/farmMachine.jpg',
                description: 'sample description',
                target_plant: 'sample category',
                price: 0,
                quantity: 0,
                machine_power: '0HP',
            });
            expect(res.status).toHaveBeenCalledWith(201);
            expect(res.json).toHaveBeenCalledWith(expect.objectContaining({
                name: 'sample machine',
                user: 'user_456'
            }));
        });
    });

    describe('updateLendMachine', () => {
        it('should update lend machine details and respond with 201 if machine exists', async () => {
            req.params.id = 'machine_123';
            req.body = {
                name: 'Updated Machine',
                price: 500,
                image: '/images/updated.jpg',
                description: 'Updated description',
                target_plant: 'Wheat',
                quantity: 10,
                machine_power: '15HP'
            };

            const existingMachine = {
                name: 'Old Name',
                price: 0,
                image: '/images/old.jpg',
                description: 'Old description',
                target_plant: 'None',
                quantity: 0,
                machine_power: '0HP',
                save: jest.fn().mockImplementation(function() {
                    return Promise.resolve(this);
                })
            };

            ProductLendMachines.findById.mockResolvedValue(existingMachine);

            await updateLendMachine(req, res, next);

            expect(ProductLendMachines.findById).toHaveBeenCalledWith('machine_123');
            expect(existingMachine.name).toBe('Updated Machine');
            expect(existingMachine.price).toBe(500);
            expect(existingMachine.image).toBe('/images/updated.jpg');
            expect(existingMachine.description).toBe('Updated description');
            expect(existingMachine.target_plant).toBe('Wheat');
            expect(existingMachine.quantity).toBe(10);
            expect(existingMachine.machine_power).toBe('15HP');
            expect(existingMachine.save).toHaveBeenCalled();
            expect(res.status).toHaveBeenCalledWith(201);
            expect(res.json).toHaveBeenCalledWith(existingMachine);
        });

        it('should set status to 401 and pass error to next if machine not found for update', async () => {
            req.params.id = 'non_existent_id';
            ProductLendMachines.findById.mockResolvedValue(null);

            await updateLendMachine(req, res, next);

            expect(ProductLendMachines.findById).toHaveBeenCalledWith('non_existent_id');
            expect(res.status).toHaveBeenCalledWith(401);
            expect(next).toHaveBeenCalledWith(expect.objectContaining({
                message: 'Product not found'
            }));
        });
    });
});