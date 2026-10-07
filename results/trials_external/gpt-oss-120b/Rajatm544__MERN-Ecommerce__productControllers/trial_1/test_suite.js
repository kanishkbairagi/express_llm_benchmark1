import { jest } from '@jest/globals';
import {
  getAllProducts,
  getProductById,
  deleteProduct,
  createProduct,
  updateProduct,
  createProductReview,
  getTopProducts,
} from '../dataset/external/Rajatm544__MERN-Ecommerce/backend/controllers/productControllers.js';
import Product from '../dataset/external/Rajatm544__MERN-Ecommerce/backend/models/productModel.js';

jest.mock('../dataset/external/Rajatm544__MERN-Ecommerce/backend/models/productModel.js', () => {
  class MockProduct {
    static countDocuments = jest.fn();
    static find = jest.fn();
    static findById = jest.fn();
    constructor(data) {
      Object.assign(this, data);
      this.save = jest.fn();
      this.remove = jest.fn();
    }
  }
  return { __esModule: true, default: MockProduct };
});

const mockRes = () => {
  const res = {};
  res.status = jest.fn().mockReturnValue(res);
  res.json = jest.fn().mockReturnValue(res);
  return res;
};

describe('Product Controllers', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  describe('getAllProducts', () => {
    it('should return paginated products with correct page data', async () => {
      const req = { query: { pageNumber: '2', pageSize: '5', keyword: 'phone' } };
      const res = mockRes();

      const mockProducts = [{ name: 'Phone 1' }, { name: 'Phone 2' }];
      const countMock = 12;

      Product.countDocuments.mockResolvedValue(countMock);
      Product.find.mockReturnValue({
        limit: jest.fn().mockReturnThis(),
        skip: jest.fn().mockResolvedValue(mockProducts),
      });

      await getAllProducts(req, res);

      expect(Product.countDocuments).toHaveBeenCalledWith({
        name: { $regex: 'phone', $options: 'si' },
      });
      expect(Product.find).toHaveBeenCalledWith({
        name: { $regex: 'phone', $options: 'si' },
      });
      expect(res.json).toHaveBeenCalledWith({
        products: mockProducts,
        page: 2,
        pages: Math.ceil(countMock / 5),
      });
    });
  });

  describe('getProductById', () => {
    it('should return product when found', async () => {
      const req = { params: { id: '123' } };
      const res = mockRes();
      const next = jest.fn();

      const mockProduct = { _id: '123', name: 'Sample' };
      Product.findById.mockResolvedValue(mockProduct);

      await getProductById(req, res, next);

      expect(Product.findById).toHaveBeenCalledWith('123');
      expect(res.json).toHaveBeenCalledWith(mockProduct);
      expect(next).not.toHaveBeenCalled();
    });

    it('should forward 404 error when product not found', async () => {
      const req = { params: { id: '999' } };
      const res = mockRes();
      const next = jest.fn();

      Product.findById.mockResolvedValue(null);

      await getProductById(req, res, next);

      expect(res.status).toHaveBeenCalledWith(404);
      expect(next).toHaveBeenCalledWith(expect.any(Error));
      const err = next.mock.calls[0][0];
      expect(err.message).toBe('Product not found');
    });
  });

  describe('deleteProduct', () => {
    it('should delete product when it exists', async () => {
      const req = { params: { id: 'abc' } };
      const res = mockRes();
      const next = jest.fn();

      const mockProduct = {
        remove: jest.fn().mockResolvedValue(),
      };
      Product.findById.mockResolvedValue(mockProduct);

      await deleteProduct(req, res, next);

      expect(Product.findById).toHaveBeenCalledWith('abc');
      expect(mockProduct.remove).toHaveBeenCalled();
      expect(res.json).toHaveBeenCalledWith({ message: 'Product removed from DB' });
      expect(next).not.toHaveBeenCalled();
    });

    it('should forward 404 when product does not exist', async () => {
      const req = { params: { id: 'non' } };
      const res = mockRes();
      const next = jest.fn();

      Product.findById.mockResolvedValue(null);

      await deleteProduct(req, res, next);

      expect(res.status).toHaveBeenCalledWith(404);
      expect(next).toHaveBeenCalledWith(expect.any(Error));
      const err = next.mock.calls[0][0];
      expect(err.message).toBe('Product not found');
    });
  });

  describe('createProduct', () => {
    it('should create a new product and respond with 201', async () => {
      const req = { user: { _id: 'user1' } };
      const res = mockRes();
      const next = jest.fn();

      // Mock the instance created by `new Product`
      const savedProduct = { _id: 'newId', name: 'Sample' };
      // The constructor will assign fields; we need to make its `save` resolve to savedProduct
      Product.prototype.save.mockResolvedValue(savedProduct);

      await createProduct(req, res, next);

      expect(Product.prototype.save).toHaveBeenCalled();
      expect(res.status).toHaveBeenCalledWith(201);
      expect(res.json).toHaveBeenCalledWith(savedProduct);
      expect(next).not.toHaveBeenCalled();
    });
  });

  describe('updateProduct', () => {
    it('should update fields and respond with updated product', async () => {
      const req = {
        params: { id: 'upd1' },
        body: { name: 'New Name', price: 99 },
      };
      const res = mockRes();
      const next = jest.fn();

      const mockProduct = {
        name: 'Old',
        price: 10,
        save: jest.fn().mockResolvedValue({ _id: 'upd1', name: 'New Name', price: 99 }),
      };
      Product.findById.mockResolvedValue(mockProduct);

      await updateProduct(req, res, next);

      expect(Product.findById).toHaveBeenCalledWith('upd1');
      expect(mockProduct.name).toBe('New Name');
      expect(mockProduct.price).toBe(99);
      expect(mockProduct.save).toHaveBeenCalled();
      expect(res.status).toHaveBeenCalledWith(201);
      expect(res.json).toHaveBeenCalledWith({ _id: 'upd1', name: 'New Name', price: 99 });
      expect(next).not.toHaveBeenCalled();
    });

    it('should forward 404 when product not found', async () => {
      const req = { params: { id: 'missing' }, body: {} };
      const res = mockRes();
      const next = jest.fn();

      Product.findById.mockResolvedValue(null);

      await updateProduct(req, res, next);

      expect(res.status).toHaveBeenCalledWith(404);
      const err = next.mock.calls[0][0];
      expect(err).toBeInstanceOf(Error);
      expect(err.message).toBe('Product not available');
    });
  });

  describe('createProductReview', () => {
    const baseReq = {
      params: { id: 'rev1' },
      user: { _id: 'u1', name: 'John', avatar: 'avatar.png' },
      body: { rating: 4, review: 'Great!' },
    };

    it('should add review when product exists and not reviewed yet', async () => {
      const req = { ...baseReq };
      const res = mockRes();
      const next = jest.fn();

      const mockProduct = {
        reviews: [],
        numReviews: 0,
        rating: 0,
        save: jest.fn().mockResolvedValue(true),
        // used by controller to push new review
      };
      Product.findById.mockResolvedValue(mockProduct);

      await createProductReview(req, res, next);

      expect(Product.findById).toHaveBeenCalledWith('rev1');
      expect(mockProduct.reviews).toHaveLength(1);
      expect(mockProduct.numReviews).toBe(1);
      expect(mockProduct.rating).toBe(4);
      expect(mockProduct.save).toHaveBeenCalled();
      expect(res.status).toHaveBeenCalledWith(201);
      expect(res.json).toHaveBeenCalledWith({ message: 'Review Added' });
      expect(next).not.toHaveBeenCalled();
    });

    it('should forward 400 when user already reviewed', async () => {
      const req = { ...baseReq };
      const res = mockRes();
      const next = jest.fn();

      const mockProduct = {
        reviews: [{ user: 'u1' }],
        save: jest.fn(),
      };
      Product.findById.mockResolvedValue(mockProduct);

      await createProductReview(req, res, next);

      expect(res.status).toHaveBeenCalledWith(400);
      const err = next.mock.calls[0][0];
      expect(err.message).toBe('Product Already Reviewed');
    });

    it('should forward 404 when product does not exist', async () => {
      const req = { ...baseReq };
      const res = mockRes();
      const next = jest.fn();

      Product.findById.mockResolvedValue(null);

      await createProductReview(req, res, next);

      expect(res.status).toHaveBeenCalledWith(404);
      const err = next.mock.calls[0][0];
      expect(err.message).toBe('Product not available');
    });
  });

  describe('getTopProducts', () => {
    it('should return top 4 rated products', async () => {
      const req = {};
      const res = mockRes();

      const topProducts = [{ rating: 5 }, { rating: 4.5 }, { rating: 4 }, { rating: 3.5 }];
      Product.find.mockReturnValue({
        sort: jest.fn().mockReturnThis(),
        limit: jest.fn().mockResolvedValue(topProducts),
      });

      await getTopProducts(req, res);

      expect(Product.find).toHaveBeenCalledWith({});
      expect(res.json).toHaveBeenCalledWith(topProducts);
    });
  });
});