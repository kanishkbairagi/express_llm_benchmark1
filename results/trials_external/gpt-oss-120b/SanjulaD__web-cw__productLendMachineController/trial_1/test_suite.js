import { jest } from '@jest/globals';
import {
  getLendMachnines,
  getLendMachnineById,
  deleteLendMachnine,
  createLendMachine,
  updateLendMachine,
} from '../dataset/external/SanjulaD__web-cw/backend/controllers/productLendMachineController.js';

let mockFind, mockFindById, mockSave, mockRemove;

// Mock the ProductLendMachines model used inside the controller
jest.mock(
  '../dataset/external/SanjulaD__web-cw/backend/models/productLendMachineModel.js',
  () => {
    mockFind = jest.fn();
    mockFindById = jest.fn();
    mockSave = jest.fn();
    mockRemove = jest.fn();

    const MockModel = function (data) {
      this.data = data;
      this.save = mockSave;
      this.remove = mockRemove;
    };
    MockModel.find = mockFind;
    MockModel.findById = mockFindById;

    return { __esModule: true, default: MockModel };
  }
);

describe('productLendMachineController', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  describe('getLendMachnines', () => {
    it('should return all lend machines as JSON', async () => {
      const fakeMachines = [{ _id: '1' }, { _id: '2' }];
      mockFind.mockResolvedValue(fakeMachines);

      const req = {};
      const res = { json: jest.fn() };

      await getLendMachnines(req, res);

      expect(mockFind).toHaveBeenCalledWith({});
      expect(res.json).toHaveBeenCalledWith(fakeMachines);
    });
  });

  describe('getLendMachnineById', () => {
    it('should return machine when found', async () => {
      const machine = { _id: '123', name: 'machine' };
      mockFindById.mockResolvedValue(machine);

      const req = { params: { id: '123' } };
      const res = { json: jest.fn() };

      await getLendMachnineById(req, res);

      expect(mockFindById).toHaveBeenCalledWith('123');
      expect(res.json).toHaveBeenCalledWith(machine);
    });

    it('should throw 404 error when not found', async () => {
      mockFindById.mockResolvedValue(null);

      const req = { params: { id: 'nonexistent' } };
      const res = {
        status: jest.fn().mockReturnThis(),
        json: jest.fn(),
      };

      await expect(getLendMachnineById(req, res)).rejects.toThrow('Machine not Found');
      expect(res.status).toHaveBeenCalledWith(404);
    });
  });

  describe('deleteLendMachnine', () => {
    it('should remove machine and respond with message when found', async () => {
      const machine = { _id: 'del1', remove: mockRemove };
      mockFindById.mockResolvedValue(machine);
      mockRemove.mockResolvedValue();

      const req = { params: { id: 'del1' } };
      const res = { json: jest.fn() };

      await deleteLendMachnine(req, res);

      expect(mockFindById).toHaveBeenCalledWith('del1');
      expect(mockRemove).toHaveBeenCalled();
      expect(res.json).toHaveBeenCalledWith({ message: 'Machine Removed' });
    });

    it('should throw 404 error when machine does not exist', async () => {
      mockFindById.mockResolvedValue(null);

      const req = { params: { id: 'missing' } };
      const res = {
        status: jest.fn().mockReturnThis(),
        json: jest.fn(),
      };

      await expect(deleteLendMachnine(req, res)).rejects.toThrow('Machine not Found');
      expect(res.status).toHaveBeenCalledWith(404);
    });
  });

  describe('createLendMachine', () => {
    it('should create a machine and return it with 201 status', async () => {
      const savedMachine = { _id: 'newId', name: 'sample machine' };
      mockSave.mockResolvedValue(savedMachine);

      const req = { user: { _id: 'user123' } };
      const res = {
        status: jest.fn().mockReturnThis(),
        json: jest.fn(),
      };

      await createLendMachine(req, res);

      expect(res.status).toHaveBeenCalledWith(201);
      expect(res.json).toHaveBeenCalledWith(savedMachine);
    });
  });

  describe('updateLendMachine', () => {
    const updatedData = {
      name: 'updated name',
      price: 100,
      image: '/img.png',
      description: 'updated desc',
      target_plant: 'new plant',
      quantity: 5,
      machine_power: '5HP',
    };

    it('should update an existing machine and return it with 201 status', async () => {
      const existingMachine = {
        _id: 'upd1',
        save: mockSave,
      };
      mockFindById.mockResolvedValue(existingMachine);
      const updatedMachine = { _id: 'upd1', ...updatedData };
      mockSave.mockResolvedValue(updatedMachine);

      const req = { params: { id: 'upd1' }, body: updatedData };
      const res = {
        status: jest.fn().mockReturnThis(),
        json: jest.fn(),
      };

      await updateLendMachine(req, res);

      expect(mockFindById).toHaveBeenCalledWith('upd1');
      expect(mockSave).toHaveBeenCalled();
      expect(res.status).toHaveBeenCalledWith(201);
      expect(res.json).toHaveBeenCalledWith(updatedMachine);
    });

    it('should throw 401 error when machine to update does not exist', async () => {
      mockFindById.mockResolvedValue(null);

      const req = { params: { id: 'missing' }, body: updatedData };
      const res = {
        status: jest.fn().mockReturnThis(),
        json: jest.fn(),
      };

      await expect(updateLendMachine(req, res)).rejects.toThrow('Product not found');
      expect(res.status).toHaveBeenCalledWith(401);
    });
  });
});