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

  const mockRes = () => {
    const res = {};
    res.status = jest.fn().mockReturnValue(res);
    res.json = jest.fn().mockReturnValue(res);
    return res;
  };

  beforeEach(() => {
    req = {};
    res = mockRes();

    // reset all mocks
    jest.clearAllMocks();

    // default successful mocks
    WishlistModel.findByUserId = jest.fn().mockResolvedValue({ userId: 'u1', items: [] });
    WishlistModel.addItem = jest.fn().mockImplementation(async (uid, item) => ({
      userId: uid,
      items: [item]
    }));
    WishlistModel.removeItem = jest.fn().mockResolvedValue(true);
    WishlistModel.hasItem = jest.fn().mockResolvedValue(false);
    ProductCatalog.findById = jest.fn().mockResolvedValue({
      id: 'p1',
      title: 'Test Product',
      price: 99.99
    });
  });

  /*** getWishlist ***/
  test('getWishlist – unauthenticated returns 401', async () => {
    await getWishlist(req, res);
    expect(res.status).toHaveBeenCalledWith(401);
    expect(res.json).toHaveBeenCalledWith({
      success: false,
      error: 'Authentication required'
    });
  });

  test('getWishlist – success returns 200 with items', async () => {
    req.user = { id: 'u123' };
    WishlistModel.findByUserId.mockResolvedValue({
      userId: 'u123',
      items: [{ productId: 'p1' }, { productId: 'p2' }]
    });

    await getWishlist(req, res);
    expect(WishlistModel.findByUserId).toHaveBeenCalledWith('u123');
    expect(res.status).toHaveBeenCalledWith(200);
    expect(res.json).toHaveBeenCalledWith({
      success: true,
      data: {
        userId: 'u123',
        totalItems: 2,
        items: [{ productId: 'p1' }, { productId: 'p2' }]
      }
    });
  });

  test('getWishlist – internal error returns 500', async () => {
    req.user = { id: 'u123' };
    WishlistModel.findByUserId.mockRejectedValue(new Error('DB failure'));

    await getWishlist(req, res);
    expect(res.status).toHaveBeenCalledWith(500);
    expect(res.json).toHaveBeenCalledWith(
      expect.objectContaining({
        success: false,
        error: 'Failed to retrieve wishlist',
        details: 'DB failure'
      })
    );
  });

  /*** addToWishlist ***/
  test('addToWishlist – unauthenticated returns 401', async () => {
    req.body = { productId: 'p1' };
    await addToWishlist(req, res);
    expect(res.status).toHaveBeenCalledWith(401);
    expect(res.json).toHaveBeenCalledWith({
      success: false,
      error: 'Authentication required'
    });
  });

  test('addToWishlist – missing productId returns 400', async () => {
    req.user = { id: 'u1' };
    req.body = {};
    await addToWishlist(req, res);
    expect(res.status).toHaveBeenCalledWith(400);
    expect(res.json).toHaveBeenCalledWith({
      success: false,
      error: 'Valid productId is required'
    });
  });

  test('addToWishlist – product not found returns 404', async () => {
    req.user = { id: 'u1' };
    req.body = { productId: 'missing' };
    ProductCatalog.findById.mockResolvedValue(null);

    await addToWishlist(req, res);
    expect(ProductCatalog.findById).toHaveBeenCalledWith('missing');
    expect(res.status).toHaveBeenCalledWith(404);
    expect(res.json).toHaveBeenCalledWith({
      success: false,
      error: 'Product not found'
    });
  });

  test('addToWishlist – already in wishlist returns 409', async () => {
    req.user = { id: 'u1' };
    req.body = { productId: 'p1' };
    WishlistModel.hasItem.mockResolvedValue(true);

    await addToWishlist(req, res);
    expect(WishlistModel.hasItem).toHaveBeenCalledWith('u1', 'p1');
    expect(res.status).toHaveBeenCalledWith(409);
    expect(res.json).toHaveBeenCalledWith({
      success: false,
      error: 'Product is already present in your wishlist'
    });
  });

  test('addToWishlist – success returns 201 with added item', async () => {
    req.user = { id: 'u1' };
    req.body = { productId: 'p1', note: 'My note' };
    ProductCatalog.findById.mockResolvedValue({
      id: 'p1',
      title: 'Cool Gadget',
      price: 49.99
    });
    WishlistModel.hasItem.mockResolvedValue(false);
    WishlistModel.addItem.mockImplementation(async (uid, item) => ({
      userId: uid,
      items: [item]
    }));

    await addToWishlist(req, res);
    expect(ProductCatalog.findById).toHaveBeenCalledWith('p1');
    expect(WishlistModel.addItem).toHaveBeenCalledWith('u1', expect.objectContaining({
      productId: 'p1',
      title: 'Cool Gadget',
      price: 49.99,
      note: 'My note'
    }));
    expect(res.status).toHaveBeenCalledWith(201);
    expect(res.json).toHaveBeenCalledWith({
      success: true,
      message: 'Item added to wishlist',
      data: expect.objectContaining({
        userId: 'u1',
        items: expect.arrayContaining([
          expect.objectContaining({ productId: 'p1', title: 'Cool Gadget' })
        ])
      })
    });
  });

  test('addToWishlist – internal error returns 500', async () => {
    req.user = { id: 'u1' };
    req.body = { productId: 'p1' };
    ProductCatalog.findById.mockRejectedValue(new Error('catalog down'));

    await addToWishlist(req, res);
    expect(res.status).toHaveBeenCalledWith(500);
    expect(res.json).toHaveBeenCalledWith(
      expect.objectContaining({
        success: false,
        error: 'Failed to add item to wishlist',
        details: 'catalog down'
      })
    );
  });

  /*** removeFromWishlist ***/
  test('removeFromWishlist – unauthenticated returns 401', async () => {
    req.params = { productId: 'p1' };
    await removeFromWishlist(req, res);
    expect(res.status).toHaveBeenCalledWith(401);
    expect(res.json).toHaveBeenCalledWith({
      success: false,
      error: 'Authentication required'
    });
  });

  test('removeFromWishlist – missing productId returns 400', async () => {
    req.user = { id: 'u1' };
    req.params = {};
    await removeFromWishlist(req, res);
    expect(res.status).toHaveBeenCalledWith(400);
    expect(res.json).toHaveBeenCalledWith({
      success: false,
      error: 'Product ID is required'
    });
  });

  test('removeFromWishlist – item not in wishlist returns 404', async () => {
    req.user = { id: 'u1' };
    req.params = { productId: 'p9' };
    WishlistModel.hasItem.mockResolvedValue(false);

    await removeFromWishlist(req, res);
    expect(WishlistModel.hasItem).toHaveBeenCalledWith('u1', 'p9');
    expect(res.status).toHaveBeenCalledWith(404);
    expect(res.json).toHaveBeenCalledWith({
      success: false,
      error: 'Product not found in your wishlist'
    });
  });

  test('removeFromWishlist – success returns 200', async () => {
    req.user = { id: 'u1' };
    req.params = { productId: 'p1' };
    WishlistModel.hasItem.mockResolvedValue(true);
    WishlistModel.removeItem.mockResolvedValue(true);

    await removeFromWishlist(req, res);
    expect(WishlistModel.removeItem).toHaveBeenCalledWith('u1', 'p1');
    expect(res.status).toHaveBeenCalledWith(200);
    expect(res.json).toHaveBeenCalledWith({
      success: true,
      message: 'Product removed from wishlist',
      data: { productId: 'p1' }
    });
  });

  test('removeFromWishlist – internal error returns 500', async () => {
    req.user = { id: 'u1' };
    req.params = { productId: 'p1' };
    WishlistModel.hasItem.mockResolvedValue(true);
    WishlistModel.removeItem.mockRejectedValue(new Error('DB error'));

    await removeFromWishlist(req, res);
    expect(res.status).toHaveBeenCalledWith(500);
    expect(res.json).toHaveBeenCalledWith(
      expect.objectContaining({
        success: false,
        error: 'Failed to remove item from wishlist',
        details: 'DB error'
      })
    );
  });
});