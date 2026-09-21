import { jest } from '@jest/globals';
import {
  ProductCatalog,
  WishlistModel,
  getWishlist,
  addToWishlist,
  removeFromWishlist
} from '../dataset/18_wishlist_controller.js';

describe('18_wishlist_controller Unit Tests', () => {
  let req;
  let res;

  beforeEach(() => {
    req = {
      user: undefined,
      query: {},
      body: {},
      params: {}
    };

    res = {
      status: jest.fn().mockReturnThis(),
      json: jest.fn().mockReturnThis()
    };
  });

  afterEach(() => {
    jest.restoreAllMocks();
  });

  describe('getWishlist', () => {
    it('should return 401 if userId is missing', async () => {
      await getWishlist(req, res);

      expect(res.status).toHaveBeenCalledWith(401);
      expect(res.json).toHaveBeenCalledWith({
        success: false,
        error: 'Authentication required'
      });
    });

    it('should return 200 and wishlist data using req.user.id', async () => {
      req.user = { id: 'user123' };
      const mockWishlist = {
        userId: 'user123',
        items: [{ productId: 'p1', title: 'Product 1' }]
      };
      jest.spyOn(WishlistModel, 'findByUserId').mockResolvedValue(mockWishlist);

      await getWishlist(req, res);

      expect(WishlistModel.findByUserId).toHaveBeenCalledWith('user123');
      expect(res.status).toHaveBeenCalledWith(200);
      expect(res.json).toHaveBeenCalledWith({
        success: true,
        data: {
          userId: 'user123',
          totalItems: 1,
          items: mockWishlist.items
        }
      });
    });

    it('should return 200 and wishlist data using req.query.userId when req.user is absent', async () => {
      req.query = { userId: 'queryUser' };
      jest.spyOn(WishlistModel, 'findByUserId').mockResolvedValue(null);

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

    it('should return 500 when an error is thrown', async () => {
      req.user = { id: 'user123' };
      jest.spyOn(WishlistModel, 'findByUserId').mockRejectedValue(new Error('Database error'));

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
    it('should return 401 if userId is missing', async () => {
      req.body = { productId: 'prod123' };

      await addToWishlist(req, res);

      expect(res.status).toHaveBeenCalledWith(401);
      expect(res.json).toHaveBeenCalledWith({
        success: false,
        error: 'Authentication required'
      });
    });

    it('should return 400 if productId is missing or not a string', async () => {
      req.user = { id: 'user123' };
      req.body = { productId: 123 };

      await addToWishlist(req, res);

      expect(res.status).toHaveBeenCalledWith(400);
      expect(res.json).toHaveBeenCalledWith({
        success: false,
        error: 'Valid productId is required'
      });
    });

    it('should return 404 if product is not found in catalog', async () => {
      req.user = { id: 'user123' };
      req.body = { productId: 'p1' };
      jest.spyOn(ProductCatalog, 'findById').mockResolvedValue(null);

      await addToWishlist(req, res);

      expect(ProductCatalog.findById).toHaveBeenCalledWith('p1');
      expect(res.status).toHaveBeenCalledWith(404);
      expect(res.json).toHaveBeenCalledWith({
        success: false,
        error: 'Product not found'
      });
    });

    it('should return 409 if product is already in wishlist', async () => {
      req.user = { id: 'user123' };
      req.body = { productId: 'p1' };
      jest.spyOn(ProductCatalog, 'findById').mockResolvedValue({ id: 'p1', title: 'Test Item', price: 10 });
      jest.spyOn(WishlistModel, 'hasItem').mockResolvedValue(true);

      await addToWishlist(req, res);

      expect(WishlistModel.hasItem).toHaveBeenCalledWith('user123', 'p1');
      expect(res.status).toHaveBeenCalledWith(409);
      expect(res.json).toHaveBeenCalledWith({
        success: false,
        error: 'Product is already present in your wishlist'
      });
    });

    it('should return 201 and add item with fallback to product.name and truncated note', async () => {
      req.body = {
        userId: 'bodyUser',
        productId: 'p1',
        note: 'a'.repeat(120)
      };
      const mockProduct = { id: 'p1', name: 'Product Name', price: 29.99 };
      jest.spyOn(ProductCatalog, 'findById').mockResolvedValue(mockProduct);
      jest.spyOn(WishlistModel, 'hasItem').mockResolvedValue(false);
      jest.spyOn(WishlistModel, 'addItem').mockImplementation(async (userId, item) => ({
        userId,
        items: [item]
      }));

      await addToWishlist(req, res);

      expect(res.status).toHaveBeenCalledWith(201);
      expect(WishlistModel.addItem).toHaveBeenCalledWith(
        'bodyUser',
        expect.objectContaining({
          productId: 'p1',
          title: 'Product Name',
          price: 29.99,
          note: 'a'.repeat(100),
          addedAt: expect.any(Date)
        })
      );
      expect(res.json).toHaveBeenCalledWith({
        success: true,
        message: 'Item added to wishlist',
        data: expect.objectContaining({ userId: 'bodyUser' })
      });
    });

    it('should set note to null if note is not provided', async () => {
      req.user = { id: 'user123' };
      req.body = { productId: 'p1' };
      const mockProduct = { id: 'p1', title: 'Product Title', price: 15 };
      jest.spyOn(ProductCatalog, 'findById').mockResolvedValue(mockProduct);
      jest.spyOn(WishlistModel, 'hasItem').mockResolvedValue(false);
      jest.spyOn(WishlistModel, 'addItem').mockImplementation(async (userId, item) => ({ userId, items: [item] }));

      await addToWishlist(req, res);

      expect(WishlistModel.addItem).toHaveBeenCalledWith(
        'user123',
        expect.objectContaining({
          note: null
        })
      );
    });

    it('should return 500 when an exception occurs', async () => {
      req.user = { id: 'user123' };
      req.body = { productId: 'p1' };
      jest.spyOn(ProductCatalog, 'findById').mockRejectedValue(new Error('Catastrophic failure'));

      await addToWishlist(req, res);

      expect(res.status).toHaveBeenCalledWith(500);
      expect(res.json).toHaveBeenCalledWith({
        success: false,
        error: 'Failed to add item to wishlist',
        details: 'Catastrophic failure'
      });
    });
  });

  describe('removeFromWishlist', () => {
    it('should return 401 if userId is missing', async () => {
      req.params = { productId: 'p1' };

      await removeFromWishlist(req, res);

      expect(res.status).toHaveBeenCalledWith(401);
      expect(res.json).toHaveBeenCalledWith({
        success: false,
        error: 'Authentication required'
      });
    });

    it('should return 400 if productId is missing from req.params', async () => {
      req.user = { id: 'user123' };
      req.params = {};

      await removeFromWishlist(req, res);

      expect(res.status).toHaveBeenCalledWith(400);
      expect(res.json).toHaveBeenCalledWith({
        success: false,
        error: 'Product ID is required'
      });
    });

    it('should return 404 if item does not exist in wishlist', async () => {
      req.user = { id: 'user123' };
      req.params = { productId: 'p1' };
      jest.spyOn(WishlistModel, 'hasItem').mockResolvedValue(false);

      await removeFromWishlist(req, res);

      expect(WishlistModel.hasItem).toHaveBeenCalledWith('user123', 'p1');
      expect(res.status).toHaveBeenCalledWith(404);
      expect(res.json).toHaveBeenCalledWith({
        success: false,
        error: 'Product not found in your wishlist'
      });
    });

    it('should return 200 on successful removal', async () => {
      req.user = { id: 'user123' };
      req.params = { productId: 'p1' };
      jest.spyOn(WishlistModel, 'hasItem').mockResolvedValue(true);
      jest.spyOn(WishlistModel, 'removeItem').mockResolvedValue(true);

      await removeFromWishlist(req, res);

      expect(WishlistModel.removeItem).toHaveBeenCalledWith('user123', 'p1');
      expect(res.status).toHaveBeenCalledWith(200);
      expect(res.json).toHaveBeenCalledWith({
        success: true,
        message: 'Product removed from wishlist',
        data: { productId: 'p1' }
      });
    });

    it('should return 500 when an exception occurs', async () => {
      req.user = { id: 'user123' };
      req.params = { productId: 'p1' };
      jest.spyOn(WishlistModel, 'hasItem').mockRejectedValue(new Error('DB Error'));

      await removeFromWishlist(req, res);

      expect(res.status).toHaveBeenCalledWith(500);
      expect(res.json).toHaveBeenCalledWith({
        success: false,
        error: 'Failed to remove item from wishlist',
        details: 'DB Error'
      });
    });
  });
});