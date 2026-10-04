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

  beforeEach(() => {
    req = {
      user: null,
      query: {},
      body: {},
      params: {}
    };

    res = {
      status: jest.fn().mockReturnThis(),
      json: jest.fn().mockReturnThis()
    };

    jest.restoreAllMocks();
  });

  describe('getWishlist', () => {
    test('should return 401 if userId is not provided in req.user or req.query', async () => {
      await getWishlist(req, res);

      expect(res.status).toHaveBeenCalledWith(401);
      expect(res.json).toHaveBeenCalledWith({
        success: false,
        error: 'Authentication required'
      });
    });

    test('should return 200 with user wishlist when authenticated via req.user', async () => {
      req.user = { id: 'user_123' };
      const mockItems = [{ productId: 'p1', title: 'Product 1' }];
      jest.spyOn(WishlistModel, 'findByUserId').mockResolvedValue({
        userId: 'user_123',
        items: mockItems
      });

      await getWishlist(req, res);

      expect(WishlistModel.findByUserId).toHaveBeenCalledWith('user_123');
      expect(res.status).toHaveBeenCalledWith(200);
      expect(res.json).toHaveBeenCalledWith({
        success: true,
        data: {
          userId: 'user_123',
          totalItems: 1,
          items: mockItems
        }
      });
    });

    test('should retrieve userId from req.query if req.user is absent', async () => {
      req.query = { userId: 'user_query' };
      jest.spyOn(WishlistModel, 'findByUserId').mockResolvedValue({
        userId: 'user_query',
        items: []
      });

      await getWishlist(req, res);

      expect(WishlistModel.findByUserId).toHaveBeenCalledWith('user_query');
      expect(res.status).toHaveBeenCalledWith(200);
      expect(res.json).toHaveBeenCalledWith({
        success: true,
        data: {
          userId: 'user_query',
          totalItems: 0,
          items: []
        }
      });
    });

    test('should handle empty or null items gracefully from WishlistModel', async () => {
      req.user = { id: 'user_empty' };
      jest.spyOn(WishlistModel, 'findByUserId').mockResolvedValue(null);

      await getWishlist(req, res);

      expect(res.status).toHaveBeenCalledWith(200);
      expect(res.json).toHaveBeenCalledWith({
        success: true,
        data: {
          userId: 'user_empty',
          totalItems: 0,
          items: []
        }
      });
    });

    test('should return 500 when WishlistModel throws an error', async () => {
      req.user = { id: 'user_err' };
      jest.spyOn(WishlistModel, 'findByUserId').mockRejectedValue(new Error('DB connection failed'));

      await getWishlist(req, res);

      expect(res.status).toHaveBeenCalledWith(500);
      expect(res.json).toHaveBeenCalledWith({
        success: false,
        error: 'Failed to retrieve wishlist',
        details: 'DB connection failed'
      });
    });
  });

  describe('addToWishlist', () => {
    test('should return 401 if userId is missing', async () => {
      req.body = { productId: 'prod_1' };

      await addToWishlist(req, res);

      expect(res.status).toHaveBeenCalledWith(401);
      expect(res.json).toHaveBeenCalledWith({
        success: false,
        error: 'Authentication required'
      });
    });

    test('should return 400 if productId is missing or not a string', async () => {
      req.user = { id: 'user_123' };
      req.body = { productId: 12345 };

      await addToWishlist(req, res);

      expect(res.status).toHaveBeenCalledWith(400);
      expect(res.json).toHaveBeenCalledWith({
        success: false,
        error: 'Valid productId is required'
      });
    });

    test('should return 404 if product is not found in ProductCatalog', async () => {
      req.user = { id: 'user_123' };
      req.body = { productId: 'prod_999' };
      jest.spyOn(ProductCatalog, 'findById').mockResolvedValue(null);

      await addToWishlist(req, res);

      expect(ProductCatalog.findById).toHaveBeenCalledWith('prod_999');
      expect(res.status).toHaveBeenCalledWith(404);
      expect(res.json).toHaveBeenCalledWith({
        success: false,
        error: 'Product not found'
      });
    });

    test('should return 409 if item is already present in wishlist', async () => {
      req.user = { id: 'user_123' };
      req.body = { productId: 'prod_1' };

      jest.spyOn(ProductCatalog, 'findById').mockResolvedValue({ id: 'prod_1', title: 'Test Product' });
      jest.spyOn(WishlistModel, 'hasItem').mockResolvedValue(true);

      await addToWishlist(req, res);

      expect(WishlistModel.hasItem).toHaveBeenCalledWith('user_123', 'prod_1');
      expect(res.status).toHaveBeenCalledWith(409);
      expect(res.json).toHaveBeenCalledWith({
        success: false,
        error: 'Product is already present in your wishlist'
      });
    });

    test('should return 201 and add item with title, price, and note truncated to 100 chars', async () => {
      req.body = {
        userId: 'user_body',
        productId: 'prod_1',
        note: 'a'.repeat(150)
      };

      const mockProduct = { id: 'prod_1', title: 'Smart Watch', price: 199.99 };
      jest.spyOn(ProductCatalog, 'findById').mockResolvedValue(mockProduct);
      jest.spyOn(WishlistModel, 'hasItem').mockResolvedValue(false);
      jest.spyOn(WishlistModel, 'addItem').mockImplementation(async (userId, item) => ({
        userId,
        items: [item]
      }));

      await addToWishlist(req, res);

      expect(WishlistModel.addItem).toHaveBeenCalledWith(
        'user_body',
        expect.objectContaining({
          productId: 'prod_1',
          title: 'Smart Watch',
          price: 199.99,
          note: 'a'.repeat(100),
          addedAt: expect.any(Date)
        })
      );
      expect(res.status).toHaveBeenCalledWith(201);
      expect(res.json).toHaveBeenCalledWith({
        success: true,
        message: 'Item added to wishlist',
        data: {
          userId: 'user_body',
          items: [
            expect.objectContaining({
              productId: 'prod_1',
              title: 'Smart Watch',
              price: 199.99,
              note: 'a'.repeat(100)
            })
          ]
        }
      });
    });

    test('should fallback to product.name if title is absent and set note to null if not provided', async () => {
      req.user = { id: 'user_123' };
      req.body = { productId: 'prod_1' };

      const mockProduct = { id: 'prod_1', name: 'Product Name Alternative', price: 50 };
      jest.spyOn(ProductCatalog, 'findById').mockResolvedValue(mockProduct);
      jest.spyOn(WishlistModel, 'hasItem').mockResolvedValue(false);
      jest.spyOn(WishlistModel, 'addItem').mockResolvedValue({ userId: 'user_123', items: [] });

      await addToWishlist(req, res);

      expect(WishlistModel.addItem).toHaveBeenCalledWith(
        'user_123',
        expect.objectContaining({
          title: 'Product Name Alternative',
          note: null
        })
      );
      expect(res.status).toHaveBeenCalledWith(201);
    });

    test('should return 500 if an error occurs during addition', async () => {
      req.user = { id: 'user_123' };
      req.body = { productId: 'prod_1' };

      jest.spyOn(ProductCatalog, 'findById').mockRejectedValue(new Error('Product fetch error'));

      await addToWishlist(req, res);

      expect(res.status).toHaveBeenCalledWith(500);
      expect(res.json).toHaveBeenCalledWith({
        success: false,
        error: 'Failed to add item to wishlist',
        details: 'Product fetch error'
      });
    });
  });

  describe('removeFromWishlist', () => {
    test('should return 401 if userId is missing', async () => {
      req.params = { productId: 'prod_1' };

      await removeFromWishlist(req, res);

      expect(res.status).toHaveBeenCalledWith(401);
      expect(res.json).toHaveBeenCalledWith({
        success: false,
        error: 'Authentication required'
      });
    });

    test('should return 400 if productId parameter is missing', async () => {
      req.user = { id: 'user_123' };
      req.params = {};

      await removeFromWishlist(req, res);

      expect(res.status).toHaveBeenCalledWith(400);
      expect(res.json).toHaveBeenCalledWith({
        success: false,
        error: 'Product ID is required'
      });
    });

    test('should return 404 if product does not exist in user wishlist', async () => {
      req.user = { id: 'user_123' };
      req.params = { productId: 'prod_missing' };
      jest.spyOn(WishlistModel, 'hasItem').mockResolvedValue(false);

      await removeFromWishlist(req, res);

      expect(WishlistModel.hasItem).toHaveBeenCalledWith('user_123', 'prod_missing');
      expect(res.status).toHaveBeenCalledWith(404);
      expect(res.json).toHaveBeenCalledWith({
        success: false,
        error: 'Product not found in your wishlist'
      });
    });

    test('should return 200 and remove item successfully', async () => {
      req.body = { userId: 'user_body' };
      req.params = { productId: 'prod_1' };

      jest.spyOn(WishlistModel, 'hasItem').mockResolvedValue(true);
      jest.spyOn(WishlistModel, 'removeItem').mockResolvedValue(true);

      await removeFromWishlist(req, res);

      expect(WishlistModel.removeItem).toHaveBeenCalledWith('user_body', 'prod_1');
      expect(res.status).toHaveBeenCalledWith(200);
      expect(res.json).toHaveBeenCalledWith({
        success: true,
        message: 'Product removed from wishlist',
        data: { productId: 'prod_1' }
      });
    });

    test('should return 500 when removeItem operation throws an error', async () => {
      req.user = { id: 'user_123' };
      req.params = { productId: 'prod_1' };

      jest.spyOn(WishlistModel, 'hasItem').mockResolvedValue(true);
      jest.spyOn(WishlistModel, 'removeItem').mockRejectedValue(new Error('Remove failed'));

      await removeFromWishlist(req, res);

      expect(res.status).toHaveBeenCalledWith(500);
      expect(res.json).toHaveBeenCalledWith({
        success: false,
        error: 'Failed to remove item from wishlist',
        details: 'Remove failed'
      });
    });
  });
});