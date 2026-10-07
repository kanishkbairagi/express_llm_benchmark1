import { jest } from '@jest/globals';
import {
  getConsumerProducts,
  getConsumerProductById,
  deleteConsumerProduct,
  createConsumer,
  updateConsumer,
} from '../dataset/external/SanjulaD__web-cw/backend/controllers/consumerProductControlller.js';
import ConsumerProducts from '../dataset/external/SanjulaD__web-cw/backend/models/consumerProductModel.js';

jest.mock('../dataset/external/SanjulaD__web-cw/backend/models/consumerProductModel.js', () => {
  class MockConsumer {
    constructor(data) {
      this._id = 'generated-id';
      Object.assign(this, data);
      this.save = jest.fn().mockResolvedValue(this);
      this.remove = jest.fn().mockResolvedValue();
    }
    static find = jest.fn();
    static findById = jest.fn();
  }
  return {
    __esModule: true,
    default: MockConsumer,
  };
});

describe('Consumer Product Controllers', () => {
  let req;
  let res;
  let next;

  beforeEach(() => {
    req = { params: {}, body: {}, user: { _id: 'user-id' } };
    res = {
      status: jest.fn().mockReturnThis(),
      json: jest.fn(),
    };
    next = jest.fn();
    jest.clearAllMocks();
  });

  describe('getConsumerProducts', () => {
    it('should return all consumer products', async () => {
      const mockProducts = [{ prod_name: 'A' }, { prod_name: 'B' }];
      ConsumerProducts.find.mockResolvedValue(mockProducts);

      await getConsumerProducts(req, res, next);

      expect(ConsumerProducts.find).toHaveBeenCalledWith({});
      expect(res.json).toHaveBeenCalledWith(mockProducts);
      expect(next).not.toHaveBeenCalled();
    });
  });

  describe('getConsumerProductById', () => {
    it('should return product when found', async () => {
      const mockProduct = { prod_name: 'A', _id: '123' };
      ConsumerProducts.findById.mockResolvedValue(mockProduct);
      req.params.id = '123';

      await getConsumerProductById(req, res, next);

      expect(ConsumerProducts.findById).toHaveBeenCalledWith('123');
      expect(res.json).toHaveBeenCalledWith(mockProduct);
      expect(next).not.toHaveBeenCalled();
    });

    it('should handle not‑found error', async () => {
      ConsumerProducts.findById.mockResolvedValue(null);
      req.params.id = 'nonexistent';

      await getConsumerProductById(req, res, next);

      expect(ConsumerProducts.findById).toHaveBeenCalledWith('nonexistent');
      expect(res.status).toHaveBeenCalledWith(404);
      expect(next).toHaveBeenCalledWith(expect.any(Error));
    });
  });

  describe('deleteConsumerProduct', () => {
    it('should delete product when it exists', async () => {
      const mockDoc = new ConsumerProducts({});
      ConsumerProducts.findById.mockResolvedValue(mockDoc);
      req.params.id = 'delete-id';

      await deleteConsumerProduct(req, res, next);

      expect(ConsumerProducts.findById).toHaveBeenCalledWith('delete-id');
      expect(mockDoc.remove).toHaveBeenCalled();
      expect(res.json).toHaveBeenCalledWith({ message: 'Consumer product removed' });
      expect(next).not.toHaveBeenCalled();
    });

    it('should handle not‑found deletion', async () => {
      ConsumerProducts.findById.mockResolvedValue(null);
      req.params.id = 'missing-id';

      await deleteConsumerProduct(req, res, next);

      expect(ConsumerProducts.findById).toHaveBeenCalledWith('missing-id');
      expect(res.status).toHaveBeenCalledWith(404);
      expect(next).toHaveBeenCalledWith(expect.any(Error));
    });
  });

  describe('createConsumer', () => {
    it('should create and return a new consumer product', async () => {
      const mockSaved = { _id: 'new-id', prod_name: 'Sample name' };
      ConsumerProducts.mockImplementation(() => ({
        save: jest.fn().mockResolvedValue(mockSaved),
      }));
      await createConsumer(req, res, next);

      expect(ConsumerProducts).toHaveBeenCalledWith(
        expect.objectContaining({
          prod_name: 'Sample name',
          user: 'user-id',
        })
      );
      expect(res.status).toHaveBeenCalledWith(201);
      expect(res.json).toHaveBeenCalledWith(mockSaved);
      expect(next).not.toHaveBeenCalled();
    });
  });

  describe('updateConsumer', () => {
    const updateData = {
      prod_name: 'Updated',
      price: 10,
      image: '/new/image.jpg',
      seller_name: 'New Seller',
      prod_size: '1kg',
      quantity: 5,
      avalaible_location: 'New Location',
    };

    it('should update existing product', async () => {
      const mockDoc = new ConsumerProducts({ _id: 'up-id' });
      ConsumerProducts.findById.mockResolvedValue(mockDoc);
      req.params.id = 'up-id';
      req.body = updateData;

      await updateConsumer(req, res, next);

      expect(ConsumerProducts.findById).toHaveBeenCalledWith('up-id');
      // ensure fields were set
      for (const [key, value] of Object.entries(updateData)) {
        expect(mockDoc[key]).toBe(value);
      }
      expect(mockDoc.save).toHaveBeenCalled();
      expect(res.status).toHaveBeenCalledWith(201);
      expect(res.json).toHaveBeenCalledWith(mockDoc);
      expect(next).not.toHaveBeenCalled();
    });

    it('should handle update when product not found', async () => {
      ConsumerProducts.findById.mockResolvedValue(null);
      req.params.id = 'missing-id';
      req.body = updateData;

      await updateConsumer(req, res, next);

      expect(ConsumerProducts.findById).toHaveBeenCalledWith('missing-id');
      expect(res.status).toHaveBeenCalledWith(401);
      expect(next).toHaveBeenCalledWith(expect.any(Error));
    });
  });
});