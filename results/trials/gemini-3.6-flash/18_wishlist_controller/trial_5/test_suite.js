import { jest } from '@jest/globals';
import {
  ProductCatalog,
  WishlistModel,
  getWishlist,
  addToWishlist,
  removeFromWishlist
} from '../dataset/18_wishlist_controller.js';

const mockRequest = (overrides = {}) => ({
  user: undefined,
  query: undefined,
  body: undefined,
  params: undefined,
  ...overrides
});

const mockResponse = () => {
  const res = {};
  res.status = jest.fn().mockReturnValue(res);
  res.json = jest.fn().mockReturnValue(res);
  return res;
};

afterEach(() => {
  jest.restoreAllMocks();
});

describe('Wishlist Controller Unit Tests', () => {
  describe('getWishlist', () => {
    test('should return 401 when userId is missing', async () => {
      const req = mockRequest();
      const res = mockResponse();

      await getWishlist(req, res);

      expect(res.status).toHaveBeenCalledWith(401);
      expect(res.json).toHaveBeenCalledWith({
        success: false,
        error: 'Authentication required'
      });
    });

    test('should retrieve wishlist using req.user.id', async () => {
      const mockItems = [{ productId: 'p1', title: 'Product 1', price: 10 }];
      jest.spyOn(WishlistModel, 'findByUserId').mockResolvedValue({
        userId: 'user123',
        items: mockItems
      });

      const req = mockRequest({ user: { id: 'user123' } });
      const res = mockResponse();

      await getWishlist(req, res);

      expect(WishlistModel.findByUserId).toHaveBeenCalledWith('user123');
      expect(res.status).toHaveBeenCalledWith(200);
      expect(res.json).toHaveBeenCalledWith({
        success: true,
        data: {
          userId: 'user123',
          totalItems: 1,
          items: mockItems
        }
      });
    });

    test('should retrieve wishlist using req.query.userId when req.user is absent', async () => {
      jest.spyOn(WishlistModel, 'findByUserId').mockResolvedValue({
        userId: 'queryUser',
        items: []
      });

      const req = mockRequest({ query: { userId: 'queryUser' } });
      const res = mockResponse();

      await getWishlist(req, res);

      expect(WishlistModel.findByUserId).toHaveBeenCalledWith('queryUser');
      expect(res.status).toHaveBeenCalledWith(200);
      expect(res.json).toHaveBeenCalledWith({
        success: true,
        data: {
          userId: 'queryUser',
          totalItems: 0,
          items: []
        }
      });
    });

    test('should handle null wishlist returned from model safely', async () => {
      jest.spyOn(WishlistModel, 'findByUserId').mockResolvedValue(null);

      const req = mockRequest({ user: { id: 'user123' } });
      const res = mockResponse();

      await getWishlist(req, res);

      expect(res.status).toHaveBeenCalledWith(200);
      expect(res.json).toHaveBeenCalledWith({
        success: true,
        data: {
          userId: 'user123',
          totalItems: 0,
          items: []
        }
      });
    });

    test('should return 500 when an exception occurs', async () => {
      jest.spyOn(WishlistModel, 'findByUserId').mockRejectedValue(new Error('Database error'));

      const req = mockRequest({ user: { id: 'user123' } });
      const res = mockResponse();

      await getWishlist(req, res);

      expect(res.status).toHaveBeenCalledWith(500);
      expect(res.json).toHaveBeenCalledWith({
        success: false,
        error: 'Failed to retrieve wishlist',
        details: 'Database error'
      });
    });
  });

  describe('addToWishlist', () => {
    test('should return 401 when userId is missing', async () => {
      const req = mockRequest({ body: { productId: 'p1' } });
      const res = mockResponse();

      await addToWishlist(req, res);

      expect(res.status).toHaveBeenCalledWith(401);
      expect(res.json).toHaveBeenCalledWith({
        success: false,
        error: 'Authentication required'
      });
    });

    test('should return 400 when productId is missing or not a string', async () => {
      const req1 = mockRequest({ user: { id: 'user1' }, body: {} });
      const res1 = mockResponse();

      await addToWishlist(req1, res1);

      expect(res1.status).toHaveBeenCalledWith(400);
      expect(res1.json).toHaveBeenCalledWith({
        success: false,
        error: 'Valid productId is required'
      });

      const req2 = mockRequest({ user: { id: 'user1' }, body: { productId: 12345 } });
      const res2 = mockResponse();

      await addToWishlist(req2, res2);

      expect(res2.status).toHaveBeenCalledWith(400);
      expect(res2.json).toHaveBeenCalledWith({
        success: false,
        error: 'Valid productId is required'
      });
    });

    test('should return 404 when product does not exist in catalog', async () => {
      jest.spyOn(ProductCatalog, 'findById').mockResolvedValue(null);

      const req = mockRequest({ user: { id: 'user1' }, body: { productId: 'p1' } });
      const res = mockResponse();

      await addToWishlist(req, res);

      expect(ProductCatalog.findById).toHaveBeenCalledWith('p1');
      expect(res.status).toHaveBeenCalledWith(404);
      expect(res.json).toHaveBeenCalledWith({
        success: false,
        error: 'Product not found'
      });
    });

    test('should return 409 when product is already in wishlist', async () => {
      jest.spyOn(ProductCatalog, 'findById').mockResolvedValue({ id: 'p1', title: 'Test Product', price: 99 });
      jest.spyOn(WishlistModel, 'hasItem').mockResolvedValue(true);

      const req = mockRequest({ user: { id: 'user1' }, body: { productId: 'p1' } });
      const res = mockResponse();

      await addToWishlist(req, res);

      expect(WishlistModel.hasItem).toHaveBeenCalledWith('user1', 'p1');
      expect(res.status).toHaveBeenCalledWith(409);
      expect(res.json).toHaveBeenCalledWith({
        success: false,
        error: 'Product is already present in your wishlist'
      });
    });

    test('should add item successfully with title, note truncation, and return 201', async () => {
      const product = { id: 'p1', title: 'Laptop', price: 999 };
      const longNote = 'a'.repeat(150);
      const expectedNote = 'a'.repeat(100);

      jest.spyOn(ProductCatalog, 'findById').mockResolvedValue(product);
      jest.spyOn(WishlistModel, 'hasItem').mockResolvedValue(false);
      jest.spyOn(WishlistModel, 'addItem').mockResolvedValue({
        userId: 'user1',
        items: [{ productId: 'p1', title: 'Laptop', price: 999, note: expectedNote }]
      });

      const req = mockRequest({
        user: { id: 'user1' },
        body: { productId: 'p1', note: longNote }
      });
      const res = mockResponse();

      await addToWishlist(req, res);

      expect(WishlistModel.addItem).toHaveBeenCalledWith('user1', expect.objectContaining({
        productId: 'p1',
        title: 'Laptop',
        price: 999,
        note: expectedNote,
        addedAt: expect.any(Date)
      }));
      expect(res.status).toHaveBeenCalledWith(201);
      expect(res.json).toHaveBeenCalledWith({
        success: true,
        message: 'Item added to wishlist',
        data: expect.any(Object)
      });
    });

    test('should fall back to product name if title is not provided and user from req.body', async () => {
      const product = { id: 'p2', name: 'Smart Phone', price: 499 };

      jest.spyOn(ProductCatalog, 'findById').mockResolvedValue(product);
      jest.spyOn(WishlistModel, 'hasItem').mockResolvedValue(false);
      jest.spyOn(WishlistModel, 'addItem').mockResolvedValue({ userId: 'bodyUser', items: [] });

      const req = mockRequest({
        body: { userId: 'bodyUser', productId: 'p2' }
      });
      const res = mockResponse();

      await addToWishlist(req, res);

      expect(WishlistModel.addItem).toHaveBeenCalledWith('bodyUser', expect.objectContaining({
        productId: 'p2',
        title: 'Smart Phone',
        price: 499,
        note: null
      }));
      expect(res.status).toHaveBeenCalledWith(201);
    });

    test('should return 500 when error is thrown', async () => {
      jest.spyOn(ProductCatalog, 'findById').mockRejectedValue(new Error('Database timeout'));

      const req = mockRequest({ user: { id: 'user1' }, body: { productId: 'p1' } });
      const res = mockResponse();

      await addToWishlist(req, res);

      expect(res.status).toHaveBeenCalledWith(500);
      expect(res.json).toHaveBeenCalledWith({
        success: false,
        error: 'Failed to add item to wishlist',
        details: 'Database timeout'
      });
    });
  });

  describe('removeFromWishlist', () => {
    test('should return 401 when userId is missing', async () => {
      const req = mockRequest({ params: { productId: 'p1' } });
      const res = mockResponse();

      await removeFromWishlist(req, res);

      expect(res.status).toHaveBeenCalledWith(401);
      expect(res.json).toHaveBeenCalledWith({
        success: false,
        error: 'Authentication required'
      });
    });

    test('should return 400 when productId is missing from params', async () => {
      const req = mockRequest({ user: { id: 'user1' }, params: {} });
      const res = mockResponse();

      await removeFromWishlist(req, res);

      expect(res.status).toHaveBeenCalledWith(400);
      expect(res.json).toHaveBeenCalledWith({
        success: false,
        error: 'Product ID is required'
      });
    });

    test('should return 404 when product is not in wishlist', async () => {
      jest.spyOn(WishlistModel, 'hasItem').mockResolvedValue(false);

      const req = mockRequest({ user: { id: 'user1' }, params: { productId: 'p1' } });
      const res = mockResponse();

      await removeFromWishlist(req, res);

      expect(WishlistModel.hasItem).toHaveBeenCalledWith('user1', 'p1');
      expect(res.status).toHaveBeenCalledWith(404);
      expect(res.json).toHaveBeenCalledWith({
        success: false,
        error: 'Product not found in your wishlist'
      });
    });

    test('should remove item and return 200 when item exists in wishlist', async () => {
      jest.spyOn(WishlistModel, 'hasItem').mockResolvedValue(true);
      jest.spyOn(WishlistModel, 'removeItem').mockResolvedValue(true);

      const req = mockRequest({
        body: { userId: 'userInBody' },
        params: { productId: 'p1' }
      });
      const res = mockResponse();

      await removeFromWishlist(req, res);

      expect(WishlistModel.removeItem).toHaveBeenCalledWith('userInBody', 'p1');
      expect(res.status).toHaveBeenCalledWith(200);
      expect(res.json).toHaveBeenCalledWith({
        success: true,
        message: 'Product removed from wishlist',
        data: { productId: 'p1' }
      });
    });

    test('should return 500 when an exception occurs', async () => {
      jest.spyOn(WishlistModel, 'hasItem').mockRejectedValue(new Error('Connection failure'));

      const req = mockRequest({ user: { id: 'user1' }, params: { productId: 'p1' } });
      const res = mockResponse();

      await removeFromWishlist(req, res);

      expect(res.status).toHaveBeenCalledWith(500);
      expect(res.json).toHaveBeenCalledWith({
        success: false,
        error: 'Failed to remove item from wishlist',
        details: 'Connection failure'
      });
    });
  });

  describe('Default Mock Model Exports', () => {
    test('ProductCatalog findById default mock implementation', async () => {
      const res = await ProductCatalog.findById('123');
      expect(res).toBeNull();
    });

    test('WishlistModel default mock implementations', async () => {
      expect(await WishlistModel.findByUserId('u1')).toEqual({ userId: 'u1', items: [] });
      expect(await WishlistModel.addItem('u1', { productId: 'p1' })).toEqual({ userId: 'u1', items: [{ productId: 'p1' }] });
      expect(await WishlistModel.removeItem('u1', 'p1')).toBe(true);
      expect(await WishlistModel.hasItem('u1', 'p1')).toBe(false);
    });
  });
});