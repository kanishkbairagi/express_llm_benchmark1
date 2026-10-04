import { jest } from '@jest/globals';
import {
  getWishlist,
  addToWishlist,
  removeFromWishlist,
  ProductCatalog,
  WishlistModel
} from '../dataset/18_wishlist_controller.js';

describe('Wishlist Controller', () => {
  let req;
  let res;

  const createRes = () => {
    const resObj = {};
    resObj.status = jest.fn().mockReturnValue(resObj);
    resObj.json = jest.fn().mockReturnValue(resObj);
    return resObj;
  };

  beforeEach(() => {
    jest.clearAllMocks();
    req = {};
    res = createRes();
  });

  // ---------- getWishlist ----------
  describe('getWishlist', () => {
    it('should return wishlist for authenticated user', async () => {
      req.user = { id: 'user-1' };
      const mockItems = [{ productId: 'p1' }, { productId: 'p2' }];
      WishlistModel.findByUserId = jest.fn().mockResolvedValue({ userId: 'user-1', items: mockItems });

      await getWishlist(req, res);

      expect(WishlistModel.findByUserId).toHaveBeenCalledWith('user-1');
      expect(res.status).toHaveBeenCalledWith(200);
      expect(res.json).toHaveBeenCalledWith({
        success: true,
        data: {
          userId: 'user-1',
          totalItems: 2,
          items: mockItems
        }
      });
    });

    it('should respond 401 when userId is missing', async () => {
      req.query = {};

      await getWishlist(req, res);

      expect(res.status).toHaveBeenCalledWith(401);
      expect(res.json).toHaveBeenCalledWith({
        success: false,
        error: 'Authentication required'
      });
    });

    it('should respond 500 on internal error', async () => {
      req.user = { id: 'user-2' };
      WishlistModel.findByUserId = jest.fn().mockRejectedValue(new Error('DB failure'));

      await getWishlist(req, res);

      expect(res.status).toHaveBeenCalledWith(500);
      expect(res.json).toHaveBeenCalledWith(expect.objectContaining({
        success: false,
        error: 'Failed to retrieve wishlist',
        details: 'DB failure'
      }));
    });
  });

  // ---------- addToWishlist ----------
  describe('addToWishlist', () => {
    const product = { id: 'prod-1', title: 'Test Product', price: 99.99 };

    beforeEach(() => {
      ProductCatalog.findById = jest.fn().mockResolvedValue(product);
      WishlistModel.hasItem = jest.fn().mockResolvedValue(false);
      WishlistModel.addItem = jest.fn().mockImplementation(async (uid, item) => ({
        userId: uid,
        items: [item]
      }));
    });

    it('should add a new item and return 201', async () => {
      req.body = {
        userId: 'user-10',
        productId: 'prod-1',
        note: 'My note'
      };

      await addToWishlist(req, res);

      expect(ProductCatalog.findById).toHaveBeenCalledWith('prod-1');
      expect(WishlistModel.hasItem).toHaveBeenCalledWith('user-10', 'prod-1');
      expect(WishlistModel.addItem).toHaveBeenCalledWith('user-10', expect.objectContaining({
        productId: 'prod-1',
        title: 'Test Product',
        price: 99.99,
        note: 'My note'
      }));
      expect(res.status).toHaveBeenCalledWith(201);
      expect(res.json).toHaveBeenCalledWith(expect.objectContaining({
        success: true,
        message: 'Item added to wishlist',
        data: expect.objectContaining({
          userId: 'user-10',
          items: expect.any(Array)
        })
      }));
    });

    it('should use req.user when body userId missing', async () => {
      req.user = { id: 'user-20' };
      req.body = { productId: 'prod-1' };

      await addToWishlist(req, res);

      expect(WishlistModel.addItem).toHaveBeenCalledWith('user-20', expect.any(Object));
      expect(res.status).toHaveBeenCalledWith(201);
    });

    it('should return 401 when not authenticated', async () => {
      req.body = { productId: 'prod-1' };

      await addToWishlist(req, res);

      expect(res.status).toHaveBeenCalledWith(401);
      expect(res.json).toHaveBeenCalledWith({
        success: false,
        error: 'Authentication required'
      });
    });

    it('should return 400 for invalid productId', async () => {
      req.body = { userId: 'u1', productId: 123 };

      await addToWishlist(req, res);

      expect(res.status).toHaveBeenCalledWith(400);
      expect(res.json).toHaveBeenCalledWith({
        success: false,
        error: 'Valid productId is required'
      });
    });

    it('should return 404 when product not found', async () => {
      ProductCatalog.findById = jest.fn().mockResolvedValue(null);
      req.body = { userId: 'u1', productId: 'unknown' };

      await addToWishlist(req, res);

      expect(res.status).toHaveBeenCalledWith(404);
      expect(res.json).toHaveBeenCalledWith({
        success: false,
        error: 'Product not found'
      });
    });

    it('should return 409 when product already in wishlist', async () => {
      WishlistModel.hasItem = jest.fn().mockResolvedValue(true);
      req.body = { userId: 'u1', productId: 'prod-1' };

      await addToWishlist(req, res);

      expect(res.status).toHaveBeenCalledWith(409);
      expect(res.json).toHaveBeenCalledWith({
        success: false,
        error: 'Product is already present in your wishlist'
      });
    });

    it('should return 500 on unexpected error', async () => {
      WishlistModel.addItem = jest.fn().mockRejectedValue(new Error('boom'));
      req.body = { userId: 'u1', productId: 'prod-1' };

      await addToWishlist(req, res);

      expect(res.status).toHaveBeenCalledWith(500);
      expect(res.json).toHaveBeenCalledWith(expect.objectContaining({
        success: false,
        error: 'Failed to add item to wishlist',
        details: 'boom'
      }));
    });
  });

  // ---------- removeFromWishlist ----------
  describe('removeFromWishlist', () => {
    beforeEach(() => {
      WishlistModel.hasItem = jest.fn().mockResolvedValue(true);
      WishlistModel.removeItem = jest.fn().mockResolvedValue(true);
    });

    it('should remove existing item and return 200', async () => {
      req.user = { id: 'user-5' };
      req.params = { productId: 'prod-99' };

      await removeFromWishlist(req, res);

      expect(WishlistModel.hasItem).toHaveBeenCalledWith('user-5', 'prod-99');
      expect(WishlistModel.removeItem).toHaveBeenCalledWith('user-5', 'prod-99');
      expect(res.status).toHaveBeenCalledWith(200);
      expect(res.json).toHaveBeenCalledWith({
        success: true,
        message: 'Product removed from wishlist',
        data: { productId: 'prod-99' }
      });
    });

    it('should return 401 when not authenticated', async () => {
      req.body = { userId: null };
      req.params = { productId: 'prod-1' };

      await removeFromWishlist(req, res);

      expect(res.status).toHaveBeenCalledWith(401);
      expect(res.json).toHaveBeenCalledWith({
        success: false,
        error: 'Authentication required'
      });
    });

    it('should return 400 when productId missing', async () => {
      req.user = { id: 'u2' };
      req.params = {};

      await removeFromWishlist(req, res);

      expect(res.status).toHaveBeenCalledWith(400);
      expect(res.json).toHaveBeenCalledWith({
        success: false,
        error: 'Product ID is required'
      });
    });

    it('should return 404 when item not in wishlist', async () => {
      WishlistModel.hasItem = jest.fn().mockResolvedValue(false);
      req.user = { id: 'u3' };
      req.params = { productId: 'prod-xyz' };

      await removeFromWishlist(req, res);

      expect(res.status).toHaveBeenCalledWith(404);
      expect(res.json).toHaveBeenCalledWith({
        success: false,
        error: 'Product not found in your wishlist'
      });
    });

    it('should return 500 on unexpected error', async () => {
      WishlistModel.hasItem = jest.fn().mockRejectedValue(new Error('oops'));
      req.user = { id: 'u4' };
      req.params = { productId: 'p1' };

      await removeFromWishlist(req, res);

      expect(res.status).toHaveBeenCalledWith(500);
      expect(res.json).toHaveBeenCalledWith(expect.objectContaining({
        success: false,
        error: 'Failed to remove item from wishlist',
        details: 'oops'
      }));
    });
  });
});