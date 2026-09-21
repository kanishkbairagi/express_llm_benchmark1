import { jest } from '@jest/globals';
import {
  getWishlist,
  addToWishlist,
  removeFromWishlist,
  ProductCatalog,
  WishlistModel
} from '../dataset/18_wishlist_controller.js';

const mockRes = () => {
  const res = {};
  res.status = jest.fn().mockReturnValue(res);
  res.json = jest.fn().mockReturnValue(res);
  return res;
};

describe('Wishlist Controller', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    // default successful mocks
    WishlistModel.findByUserId = jest.fn().mockResolvedValue({ userId: 'u1', items: [] });
    WishlistModel.hasItem = jest.fn().mockResolvedValue(false);
    WishlistModel.addItem = jest.fn().mockImplementation(async (uid, item) => ({
      userId: uid,
      items: [item]
    }));
    WishlistModel.removeItem = jest.fn().mockResolvedValue(true);
    ProductCatalog.findById = jest.fn().mockResolvedValue({
      id: 'p1',
      title: 'Test Product',
      price: 99.99
    });
  });

  describe('getWishlist', () => {
    test('returns 401 when no user identifier is provided', async () => {
      const req = { user: null, query: {} };
      const res = mockRes();

      await getWishlist(req, res);

      expect(res.status).toHaveBeenCalledWith(401);
      expect(res.json).toHaveBeenCalledWith({
        success: false,
        error: 'Authentication required'
      });
    });

    test('returns wishlist data for authenticated user', async () => {
      const req = { user: { id: 'u1' } };
      const res = mockRes();

      await getWishlist(req, res);

      expect(WishlistModel.findByUserId).toHaveBeenCalledWith('u1');
      expect(res.status).toHaveBeenCalledWith(200);
      expect(res.json).toHaveBeenCalledWith({
        success: true,
        data: {
          userId: 'u1',
          totalItems: 0,
          items: []
        }
      });
    });

    test('handles unexpected errors with 500', async () => {
      const req = { user: { id: 'u1' } };
      const res = mockRes();
      WishlistModel.findByUserId.mockRejectedValue(new Error('DB fail'));

      await getWishlist(req, res);

      expect(res.status).toHaveBeenCalledWith(500);
      expect(res.json).toHaveBeenCalledWith(expect.objectContaining({
        success: false,
        error: 'Failed to retrieve wishlist',
        details: 'DB fail'
      }));
    });
  });

  describe('addToWishlist', () => {
    test('returns 401 when user is not authenticated', async () => {
      const req = { body: {} };
      const res = mockRes();

      await addToWishlist(req, res);

      expect(res.status).toHaveBeenCalledWith(401);
      expect(res.json).toHaveBeenCalledWith({
        success: false,
        error: 'Authentication required'
      });
    });

    test('returns 400 when productId is missing or invalid', async () => {
      const req = { user: { id: 'u1' }, body: { productId: 123 } };
      const res = mockRes();

      await addToWishlist(req, res);

      expect(res.status).toHaveBeenCalledWith(400);
      expect(res.json).toHaveBeenCalledWith({
        success: false,
        error: 'Valid productId is required'
      });
    });

    test('returns 404 when product does not exist', async () => {
      const req = { user: { id: 'u1' }, body: { productId: 'p999' } };
      const res = mockRes();
      ProductCatalog.findById.mockResolvedValue(null);

      await addToWishlist(req, res);

      expect(ProductCatalog.findById).toHaveBeenCalledWith('p999');
      expect(res.status).toHaveBeenCalledWith(404);
      expect(res.json).toHaveBeenCalledWith({
        success: false,
        error: 'Product not found'
      });
    });

    test('returns 409 when product already in wishlist', async () => {
      const req = { user: { id: 'u1' }, body: { productId: 'p1' } };
      const res = mockRes();
      WishlistModel.hasItem.mockResolvedValue(true);

      await addToWishlist(req, res);

      expect(WishlistModel.hasItem).toHaveBeenCalledWith('u1', 'p1');
      expect(res.status).toHaveBeenCalledWith(409);
      expect(res.json).toHaveBeenCalledWith({
        success: false,
        error: 'Product is already present in your wishlist'
      });
    });

    test('successfully adds a new item to the wishlist', async () => {
      const req = {
        user: { id: 'u1' },
        body: { productId: 'p1', note: 'Great gift' }
      };
      const res = mockRes();

      await addToWishlist(req, res);

      expect(ProductCatalog.findById).toHaveBeenCalledWith('p1');
      expect(WishlistModel.hasItem).toHaveBeenCalledWith('u1', 'p1');
      expect(WishlistModel.addItem).toHaveBeenCalledWith('u1', expect.objectContaining({
        productId: 'p1',
        title: 'Test Product',
        price: 99.99,
        note: 'Great gift'
      }));
      expect(res.status).toHaveBeenCalledWith(201);
      expect(res.json).toHaveBeenCalledWith(expect.objectContaining({
        success: true,
        message: 'Item added to wishlist',
        data: expect.objectContaining({
          userId: 'u1',
          items: expect.any(Array)
        })
      }));
    });

    test('handles internal errors with 500', async () => {
      const req = { user: { id: 'u1' }, body: { productId: 'p1' } };
      const res = mockRes();
      ProductCatalog.findById.mockRejectedValue(new Error('Catalog fail'));

      await addToWishlist(req, res);

      expect(res.status).toHaveBeenCalledWith(500);
      expect(res.json).toHaveBeenCalledWith(expect.objectContaining({
        success: false,
        error: 'Failed to add item to wishlist',
        details: 'Catalog fail'
      }));
    });
  });

  describe('removeFromWishlist', () => {
    test('returns 401 when user is not authenticated', async () => {
      const req = { body: {}, params: {} };
      const res = mockRes();

      await removeFromWishlist(req, res);

      expect(res.status).toHaveBeenCalledWith(401);
      expect(res.json).toHaveBeenCalledWith({
        success: false,
        error: 'Authentication required'
      });
    });

    test('returns 400 when productId param is missing', async () => {
      const req = { user: { id: 'u1' }, params: {} };
      const res = mockRes();

      await removeFromWishlist(req, res);

      expect(res.status).toHaveBeenCalledWith(400);
      expect(res.json).toHaveBeenCalledWith({
        success: false,
        error: 'Product ID is required'
      });
    });

    test('returns 404 when product not found in wishlist', async () => {
      const req = { user: { id: 'u1' }, params: { productId: 'p2' } };
      const res = mockRes();
      WishlistModel.hasItem.mockResolvedValue(false);

      await removeFromWishlist(req, res);

      expect(WishlistModel.hasItem).toHaveBeenCalledWith('u1', 'p2');
      expect(res.status).toHaveBeenCalledWith(404);
      expect(res.json).toHaveBeenCalledWith({
        success: false,
        error: 'Product not found in your wishlist'
      });
    });

    test('successfully removes an existing item', async () => {
      const req = { user: { id: 'u1' }, params: { productId: 'p1' } };
      const res = mockRes();
      WishlistModel.hasItem.mockResolvedValue(true);

      await removeFromWishlist(req, res);

      expect(WishlistModel.hasItem).toHaveBeenCalledWith('u1', 'p1');
      expect(WishlistModel.removeItem).toHaveBeenCalledWith('u1', 'p1');
      expect(res.status).toHaveBeenCalledWith(200);
      expect(res.json).toHaveBeenCalledWith({
        success: true,
        message: 'Product removed from wishlist',
        data: { productId: 'p1' }
      });
    });

    test('handles internal errors with 500', async () => {
      const req = { user: { id: 'u1' }, params: { productId: 'p1' } };
      const res = mockRes();
      WishlistModel.hasItem.mockRejectedValue(new Error('DB error'));

      await removeFromWishlist(req, res);

      expect(res.status).toHaveBeenCalledWith(500);
      expect(res.json).toHaveBeenCalledWith(expect.objectContaining({
        success: false,
        error: 'Failed to remove item from wishlist',
        details: 'DB error'
      }));
    });
  });
});