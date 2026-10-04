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
    req = {};
    res = {
      status: jest.fn().mockReturnThis(),
      json: jest.fn().mockReturnThis()
    };
  });

  afterEach(() => {
    jest.restoreAllMocks();
  });

  describe('getWishlist', () => {
    test('should return 401 if userId is missing from req.user and req.query', async () => {
      req = { user: null, query: {} };

      await getWishlist(req, res);

      expect(res.status).toHaveBeenCalledWith(401);
      expect(res.json).toHaveBeenCalledWith({
        success: false,
        error: 'Authentication required'
      });
    });

    test('should return 200 and wishlist data using req.user.id', async () => {
      req = { user: { id: 'user123' } };
      const mockItems = [{ productId: 'prod1', title: 'Product 1' }];
      jest.spyOn(WishlistModel, 'findByUserId').mockResolvedValue({ userId: 'user123', items: mockItems });

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

    test('should return 200 using req.query.userId if req.user is absent', async () => {
      req = { query: { userId: 'queryUser' } };
      jest.spyOn(WishlistModel, 'findByUserId').mockResolvedValue({ userId: 'queryUser', items: [] });

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

    test('should return 200 with empty items array if wishlist or wishlist.items is undefined', async () => {
      req = { user: { id: 'user123' } };
      jest.spyOn(WishlistModel, 'findByUserId').mockResolvedValue(null);

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

    test('should return 500 when database throws an error', async () => {
      req = { user: { id: 'user123' } };
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
    test('should return 401 if userId is not provided', async () => {
      req = { body: { productId: 'p123' } };

      await addToWishlist(req, res);

      expect(res.status).toHaveBeenCalledWith(401);
      expect(res.json).toHaveBeenCalledWith({ success: false, error: 'Authentication required' });
    });

    test('should return 400 if productId is missing or not a string', async () => {
      req = { user: { id: 'user1' }, body: { productId: 12345 } };

      await addToWishlist(req, res);

      expect(res.status).toHaveBeenCalledWith(400);
      expect(res.json).toHaveBeenCalledWith({ success: false, error: 'Valid productId is required' });
    });

    test('should return 404 if product does not exist in ProductCatalog', async () => {
      req = { user: { id: 'user1' }, body: { productId: 'p123' } };
      jest.spyOn(ProductCatalog, 'findById').mockResolvedValue(null);

      await addToWishlist(req, res);

      expect(ProductCatalog.findById).toHaveBeenCalledWith('p123');
      expect(res.status).toHaveBeenCalledWith(404);
      expect(res.json).toHaveBeenCalledWith({ success: false, error: 'Product not found' });
    });

    test('should return 409 if item is already in wishlist', async () => {
      req = { user: { id: 'user1' }, body: { productId: 'p123' } };
      jest.spyOn(ProductCatalog, 'findById').mockResolvedValue({ id: 'p123', title: 'Test Product', price: 10 });
      jest.spyOn(WishlistModel, 'hasItem').mockResolvedValue(true);

      await addToWishlist(req, res);

      expect(WishlistModel.hasItem).toHaveBeenCalledWith('user1', 'p123');
      expect(res.status).toHaveBeenCalledWith(409);
      expect(res.json).toHaveBeenCalledWith({
        success: false,
        error: 'Product is already present in your wishlist'
      });
    });

    test('should return 201 and add item successfully using product title and truncated note', async () => {
      const longNote = 'a'.repeat(120);
      const expectedNote = 'a'.repeat(100);
      req = {
        user: { id: 'user1' },
        body: { productId: 'p123', note: longNote }
      };

      const product = { id: 'p123', title: 'Product Title', price: 99.99 };
      jest.spyOn(ProductCatalog, 'findById').mockResolvedValue(product);
      jest.spyOn(WishlistModel, 'hasItem').mockResolvedValue(false);
      
      const addedResponse = { userId: 'user1', items: [{ productId: 'p123' }] };
      jest.spyOn(WishlistModel, 'addItem').mockResolvedValue(addedResponse);

      await addToWishlist(req, res);

      expect(WishlistModel.addItem).toHaveBeenCalledWith('user1', expect.objectContaining({
        productId: 'p123',
        title: 'Product Title',
        price: 99.99,
        note: expectedNote,
        addedAt: expect.any(Date)
      }));

      expect(res.status).toHaveBeenCalledWith(201);
      expect(res.json).toHaveBeenCalledWith({
        success: true,
        message: 'Item added to wishlist',
        data: addedResponse
      });
    });

    test('should fallback to product.name if product.title is missing and set note to null if omitted', async () => {
      req = {
        body: { userId: 'userFromReqBody', productId: 'p456' }
      };

      const product = { id: 'p456', name: 'Product Name', price: 49.99 };
      jest.spyOn(ProductCatalog, 'findById').mockResolvedValue(product);
      jest.spyOn(WishlistModel, 'hasItem').mockResolvedValue(false);
      jest.spyOn(WishlistModel, 'addItem').mockResolvedValue({});

      await addToWishlist(req, res);

      expect(WishlistModel.addItem).toHaveBeenCalledWith('userFromReqBody', expect.objectContaining({
        productId: 'p456',
        title: 'Product Name',
        price: 49.99,
        note: null
      }));
      expect(res.status).toHaveBeenCalledWith(201);
    });

    test('should return 500 if an error occurs during execution', async () => {
      req = { user: { id: 'user1' }, body: { productId: 'p123' } };
      jest.spyOn(ProductCatalog, 'findById').mockRejectedValue(new Error('Catalog service failed'));

      await addToWishlist(req, res);

      expect(res.status).toHaveBeenCalledWith(500);
      expect(res.json).toHaveBeenCalledWith({
        success: false,
        error: 'Failed to add item to wishlist',
        details: 'Catalog service failed'
      });
    });
  });

  describe('removeFromWishlist', () => {
    test('should return 401 if userId is missing', async () => {
      req = { params: { productId: 'p123' } };

      await removeFromWishlist(req, res);

      expect(res.status).toHaveBeenCalledWith(401);
      expect(res.json).toHaveBeenCalledWith({ success: false, error: 'Authentication required' });
    });

    test('should return 400 if productId is missing in req.params', async () => {
      req = { user: { id: 'user1' }, params: {} };

      await removeFromWishlist(req, res);

      expect(res.status).toHaveBeenCalledWith(400);
      expect(res.json).toHaveBeenCalledWith({ success: false, error: 'Product ID is required' });
    });

    test('should return 404 if item is not found in user wishlist', async () => {
      req = { user: { id: 'user1' }, params: { productId: 'p123' } };
      jest.spyOn(WishlistModel, 'hasItem').mockResolvedValue(false);

      await removeFromWishlist(req, res);

      expect(WishlistModel.hasItem).toHaveBeenCalledWith('user1', 'p123');
      expect(res.status).toHaveBeenCalledWith(404);
      expect(res.json).toHaveBeenCalledWith({
        success: false,
        error: 'Product not found in your wishlist'
      });
    });

    test('should return 200 on successfully removing item from wishlist', async () => {
      req = { user: { id: 'user1' }, params: { productId: 'p123' } };
      jest.spyOn(WishlistModel, 'hasItem').mockResolvedValue(true);
      jest.spyOn(WishlistModel, 'removeItem').mockResolvedValue(true);

      await removeFromWishlist(req, res);

      expect(WishlistModel.removeItem).toHaveBeenCalledWith('user1', 'p123');
      expect(res.status).toHaveBeenCalledWith(200);
      expect(res.json).toHaveBeenCalledWith({
        success: true,
        message: 'Product removed from wishlist',
        data: { productId: 'p123' }
      });
    });

    test('should return 500 if an error is thrown', async () => {
      req = { user: { id: 'user1' }, params: { productId: 'p123' } };
      jest.spyOn(WishlistModel, 'hasItem').mockRejectedValue(new Error('DB Connection lost'));

      await removeFromWishlist(req, res);

      expect(res.status).toHaveBeenCalledWith(500);
      expect(res.json).toHaveBeenCalledWith({
        success: false,
        error: 'Failed to remove item from wishlist',
        details: 'DB Connection lost'
      });
    });
  });
});