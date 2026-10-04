import { jest } from '@jest/globals';
import {
  getWishlist,
  addToWishlist,
  removeFromWishlist,
  WishlistModel,
  ProductCatalog
} from '../dataset/18_wishlist_controller.js';

describe('Wishlist Controller', () => {
  const mockRes = () => {
    const res = {};
    res.status = jest.fn().mockReturnValue(res);
    res.json = jest.fn().mockReturnValue(res);
    return res;
  };

  afterEach(() => {
    jest.restoreAllMocks();
  });

  describe('getWishlist', () => {
    it('should return 200 with wishlist data when authenticated', async () => {
      const userId = 'user-1';
      const mockWishlist = { userId, items: [{ productId: 'p1' }, { productId: 'p2' }] };
      jest.spyOn(WishlistModel, 'findByUserId').mockResolvedValue(mockWishlist);

      const req = { user: { id: userId } };
      const res = mockRes();

      await getWishlist(req, res);

      expect(WishlistModel.findByUserId).toHaveBeenCalledWith(userId);
      expect(res.status).toHaveBeenCalledWith(200);
      expect(res.json).toHaveBeenCalledWith({
        success: true,
        data: {
          userId,
          totalItems: 2,
          items: mockWishlist.items
        }
      });
    });

    it('should return 401 when no authentication provided', async () => {
      const req = {};
      const res = mockRes();

      await getWishlist(req, res);

      expect(res.status).toHaveBeenCalledWith(401);
      expect(res.json).toHaveBeenCalledWith({
        success: false,
        error: 'Authentication required'
      });
    });
  });

  describe('addToWishlist', () => {
    const baseReq = {
      user: { id: 'user-1' },
      body: { productId: 'prod-123', note: 'Nice product' }
    };

    it('should add item and return 201 on success', async () => {
      const product = { title: 'Test Product', price: 99.99 };
      jest.spyOn(ProductCatalog, 'findById').mockResolvedValue(product);
      jest.spyOn(WishlistModel, 'hasItem').mockResolvedValue(false);
      const updated = { userId: 'user-1', items: [{ productId: 'prod-123' }] };
      jest.spyOn(WishlistModel, 'addItem').mockResolvedValue(updated);

      const req = { ...baseReq };
      const res = mockRes();

      await addToWishlist(req, res);

      expect(ProductCatalog.findById).toHaveBeenCalledWith('prod-123');
      expect(WishlistModel.hasItem).toHaveBeenCalledWith('user-1', 'prod-123');
      expect(WishlistModel.addItem).toHaveBeenCalled();
      expect(res.status).toHaveBeenCalledWith(201);
      expect(res.json).toHaveBeenCalledWith({
        success: true,
        message: 'Item added to wishlist',
        data: updated
      });
    });

    it('should return 401 when authentication missing', async () => {
      const req = { body: { productId: 'prod-123' } };
      const res = mockRes();

      await addToWishlist(req, res);

      expect(res.status).toHaveBeenCalledWith(401);
      expect(res.json).toHaveBeenCalledWith({
        success: false,
        error: 'Authentication required'
      });
    });

    it('should return 400 when productId is invalid', async () => {
      const req = { user: { id: 'u' }, body: { productId: 123 } };
      const res = mockRes();

      await addToWishlist(req, res);

      expect(res.status).toHaveBeenCalledWith(400);
      expect(res.json).toHaveBeenCalledWith({
        success: false,
        error: 'Valid productId is required'
      });
    });

    it('should return 404 when product not found', async () => {
      jest.spyOn(ProductCatalog, 'findById').mockResolvedValue(null);
      const req = { ...baseReq };
      const res = mockRes();

      await addToWishlist(req, res);

      expect(res.status).toHaveBeenCalledWith(404);
      expect(res.json).toHaveBeenCalledWith({
        success: false,
        error: 'Product not found'
      });
    });

    it('should return 409 when product already in wishlist', async () => {
      const product = { title: 'Existing', price: 10 };
      jest.spyOn(ProductCatalog, 'findById').mockResolvedValue(product);
      jest.spyOn(WishlistModel, 'hasItem').mockResolvedValue(true);

      const req = { ...baseReq };
      const res = mockRes();

      await addToWishlist(req, res);

      expect(res.status).toHaveBeenCalledWith(409);
      expect(res.json).toHaveBeenCalledWith({
        success: false,
        error: 'Product is already present in your wishlist'
      });
    });
  });

  describe('removeFromWishlist', () => {
    const baseReq = {
      user: { id: 'user-1' },
      params: { productId: 'prod-123' }
    };

    it('should remove item and return 200 on success', async () => {
      jest.spyOn(WishlistModel, 'hasItem').mockResolvedValue(true);
      jest.spyOn(WishlistModel, 'removeItem').mockResolvedValue(true);

      const req = { ...baseReq };
      const res = mockRes();

      await removeFromWishlist(req, res);

      expect(WishlistModel.hasItem).toHaveBeenCalledWith('user-1', 'prod-123');
      expect(WishlistModel.removeItem).toHaveBeenCalledWith('user-1', 'prod-123');
      expect(res.status).toHaveBeenCalledWith(200);
      expect(res.json).toHaveBeenCalledWith({
        success: true,
        message: 'Product removed from wishlist',
        data: { productId: 'prod-123' }
      });
    });

    it('should return 401 when authentication missing', async () => {
      const req = { params: { productId: 'prod-123' } };
      const res = mockRes();

      await removeFromWishlist(req, res);

      expect(res.status).toHaveBeenCalledWith(401);
      expect(res.json).toHaveBeenCalledWith({
        success: false,
        error: 'Authentication required'
      });
    });

    it('should return 400 when productId missing', async () => {
      const req = { user: { id: 'u' }, params: {} };
      const res = mockRes();

      await removeFromWishlist(req, res);

      expect(res.status).toHaveBeenCalledWith(400);
      expect(res.json).toHaveBeenCalledWith({
        success: false,
        error: 'Product ID is required'
      });
    });

    it('should return 404 when product not in wishlist', async () => {
      jest.spyOn(WishlistModel, 'hasItem').mockResolvedValue(false);
      const req = { ...baseReq };
      const res = mockRes();

      await removeFromWishlist(req, res);

      expect(res.status).toHaveBeenCalledWith(404);
      expect(res.json).toHaveBeenCalledWith({
        success: false,
        error: 'Product not found in your wishlist'
      });
    });
  });
});