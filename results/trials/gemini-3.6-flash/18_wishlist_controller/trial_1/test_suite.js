import { jest } from '@jest/globals';
import {
  ProductCatalog,
  WishlistModel,
  getWishlist,
  addToWishlist,
  removeFromWishlist
} from '../dataset/18_wishlist_controller.js';

describe('Wishlist Controller Unit Tests', () => {
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

    jest.clearAllMocks();
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
      req.user = { id: 'user-123' };
      const mockItems = [{ productId: 'p1', title: 'Product 1' }];
      jest.spyOn(WishlistModel, 'findByUserId').mockResolvedValueOnce({
        userId: 'user-123',
        items: mockItems
      });

      await getWishlist(req, res);

      expect(WishlistModel.findByUserId).toHaveBeenCalledWith('user-123');
      expect(res.status).toHaveBeenCalledWith(200);
      expect(res.json).toHaveBeenCalledWith({
        success: true,
        data: {
          userId: 'user-123',
          totalItems: 1,
          items: mockItems
        }
      });
    });

    it('should return 200 using req.query.userId when req.user is absent', async () => {
      req.query = { userId: 'user-456' };
      jest.spyOn(WishlistModel, 'findByUserId').mockResolvedValueOnce({
        userId: 'user-456',
        items: []
      });

      await getWishlist(req, res);

      expect(WishlistModel.findByUserId).toHaveBeenCalledWith('user-456');
      expect(res.status).toHaveBeenCalledWith(200);
      expect(res.json).toHaveBeenCalledWith({
        success: true,
        data: {
          userId: 'user-456',
          totalItems: 0,
          items: []
        }
      });
    });

    it('should handle missing wishlist or items gracefully', async () => {
      req.user = { id: 'user-789' };
      jest.spyOn(WishlistModel, 'findByUserId').mockResolvedValueOnce(null);

      await getWishlist(req, res);

      expect(res.status).toHaveBeenCalledWith(200);
      expect(res.json).toHaveBeenCalledWith({
        success: true,
        data: {
          userId: 'user-789',
          totalItems: 0,
          items: []
        }
      });
    });

    it('should return 500 when WishlistModel throws an error', async () => {
      req.user = { id: 'user-123' };
      jest.spyOn(WishlistModel, 'findByUserId').mockRejectedValueOnce(new Error('DB Error'));

      await getWishlist(req, res);

      expect(res.status).toHaveBeenCalledWith(500);
      expect(res.json).toHaveBeenCalledWith({
        success: false,
        error: 'Failed to retrieve wishlist',
        details: 'DB Error'
      });
    });
  });

  describe('addToWishlist', () => {
    it('should return 401 if userId is missing', async () => {
      await addToWishlist(req, res);

      expect(res.status).toHaveBeenCalledWith(401);
      expect(res.json).toHaveBeenCalledWith({
        success: false,
        error: 'Authentication required'
      });
    });

    it('should return 400 if productId is missing or not a string', async () => {
      req.user = { id: 'user-123' };
      req.body = { productId: 12345 };

      await addToWishlist(req, res);

      expect(res.status).toHaveBeenCalledWith(400);
      expect(res.json).toHaveBeenCalledWith({
        success: false,
        error: 'Valid productId is required'
      });
    });

    it('should return 404 if product is not found in catalog', async () => {
      req.user = { id: 'user-123' };
      req.body = { productId: 'p1' };
      jest.spyOn(ProductCatalog, 'findById').mockResolvedValueOnce(null);

      await addToWishlist(req, res);

      expect(ProductCatalog.findById).toHaveBeenCalledWith('p1');
      expect(res.status).toHaveBeenCalledWith(404);
      expect(res.json).toHaveBeenCalledWith({
        success: false,
        error: 'Product not found'
      });
    });

    it('should return 409 if item is already in wishlist', async () => {
      req.user = { id: 'user-123' };
      req.body = { productId: 'p1' };
      jest.spyOn(ProductCatalog, 'findById').mockResolvedValueOnce({ id: 'p1', title: 'Product 1' });
      jest.spyOn(WishlistModel, 'hasItem').mockResolvedValueOnce(true);

      await addToWishlist(req, res);

      expect(WishlistModel.hasItem).toHaveBeenCalledWith('user-123', 'p1');
      expect(res.status).toHaveBeenCalledWith(409);
      expect(res.json).toHaveBeenCalledWith({
        success: false,
        error: 'Product is already present in your wishlist'
      });
    });

    it('should add item successfully and truncate note to 100 characters', async () => {
      req.body = {
        userId: 'user-123',
        productId: 'p1',
        note: 'a'.repeat(120)
      };
      const mockProduct = { id: 'p1', title: 'Product 1', price: 99.99 };
      jest.spyOn(ProductCatalog, 'findById').mockResolvedValueOnce(mockProduct);
      jest.spyOn(WishlistModel, 'hasItem').mockResolvedValueOnce(false);
      jest.spyOn(WishlistModel, 'addItem').mockImplementationOnce(async (uId, item) => ({ userId: uId, items: [item] }));

      await addToWishlist(req, res);

      expect(res.status).toHaveBeenCalledWith(201);
      expect(WishlistModel.addItem).toHaveBeenCalledWith('user-123', expect.objectContaining({
        productId: 'p1',
        title: 'Product 1',
        price: 99.99,
        note: 'a'.repeat(100),
        addedAt: expect.any(Date)
      }));
      expect(res.json).toHaveBeenCalledWith({
        success: true,
        message: 'Item added to wishlist',
        data: {
          userId: 'user-123',
          items: [
            expect.objectContaining({
              productId: 'p1',
              title: 'Product 1',
              price: 99.99,
              note: 'a'.repeat(100)
            })
          ]
        }
      });
    });

    it('should fallback to product.name if title is absent and set note to null if empty', async () => {
      req.user = { id: 'user-123' };
      req.body = { productId: 'p2' };
      const mockProduct = { id: 'p2', name: 'Product Name', price: 49.99 };
      jest.spyOn(ProductCatalog, 'findById').mockResolvedValueOnce(mockProduct);
      jest.spyOn(WishlistModel, 'hasItem').mockResolvedValueOnce(false);
      jest.spyOn(WishlistModel, 'addItem').mockResolvedValueOnce({ userId: 'user-123', items: [] });

      await addToWishlist(req, res);

      expect(WishlistModel.addItem).toHaveBeenCalledWith('user-123', expect.objectContaining({
        title: 'Product Name',
        note: null
      }));
      expect(res.status).toHaveBeenCalledWith(201);
    });

    it('should return 500 when an error occurs during add', async () => {
      req.user = { id: 'user-123' };
      req.body = { productId: 'p1' };
      jest.spyOn(ProductCatalog, 'findById').mockRejectedValueOnce(new Error('Server Error'));

      await addToWishlist(req, res);

      expect(res.status).toHaveBeenCalledWith(500);
      expect(res.json).toHaveBeenCalledWith({
        success: false,
        error: 'Failed to add item to wishlist',
        details: 'Server Error'
      });
    });
  });

  describe('removeFromWishlist', () => {
    it('should return 401 if userId is missing', async () => {
      await removeFromWishlist(req, res);

      expect(res.status).toHaveBeenCalledWith(401);
      expect(res.json).toHaveBeenCalledWith({
        success: false,
        error: 'Authentication required'
      });
    });

    it('should return 400 if productId is missing in req.params', async () => {
      req.user = { id: 'user-123' };
      req.params = {};

      await removeFromWishlist(req, res);

      expect(res.status).toHaveBeenCalledWith(400);
      expect(res.json).toHaveBeenCalledWith({
        success: false,
        error: 'Product ID is required'
      });
    });

    it('should return 404 if item does not exist in wishlist', async () => {
      req.user = { id: 'user-123' };
      req.params = { productId: 'p1' };
      jest.spyOn(WishlistModel, 'hasItem').mockResolvedValueOnce(false);

      await removeFromWishlist(req, res);

      expect(WishlistModel.hasItem).toHaveBeenCalledWith('user-123', 'p1');
      expect(res.status).toHaveBeenCalledWith(404);
      expect(res.json).toHaveBeenCalledWith({
        success: false,
        error: 'Product not found in your wishlist'
      });
    });

    it('should remove item successfully and return 200', async () => {
      req.user = { id: 'user-123' };
      req.params = { productId: 'p1' };
      jest.spyOn(WishlistModel, 'hasItem').mockResolvedValueOnce(true);
      jest.spyOn(WishlistModel, 'removeItem').mockResolvedValueOnce(true);

      await removeFromWishlist(req, res);

      expect(WishlistModel.removeItem).toHaveBeenCalledWith('user-123', 'p1');
      expect(res.status).toHaveBeenCalledWith(200);
      expect(res.json).toHaveBeenCalledWith({
        success: true,
        message: 'Product removed from wishlist',
        data: { productId: 'p1' }
      });
    });

    it('should return 500 when removal throws an error', async () => {
      req.user = { id: 'user-123' };
      req.params = { productId: 'p1' };
      jest.spyOn(WishlistModel, 'hasItem').mockRejectedValueOnce(new Error('Delete error'));

      await removeFromWishlist(req, res);

      expect(res.status).toHaveBeenCalledWith(500);
      expect(res.json).toHaveBeenCalledWith({
        success: false,
        error: 'Failed to remove item from wishlist',
        details: 'Delete error'
      });
    });
  });
});