// 18_wishlist_controller.js - User Saved Items Management

// Mock Database Models
export const ProductCatalog = {
  findById: async (id) => null
};

export const WishlistModel = {
  findByUserId: async (userId) => ({ userId, items: [] }),
  addItem: async (userId, item) => ({ userId, items: [item] }),
  removeItem: async (userId, productId) => true,
  hasItem: async (userId, productId) => false
};

export const getWishlist = async (req, res) => {
  try {
    const userId = req.user?.id || req.query?.userId;

    if (!userId) {
      return res.status(401).json({
        success: false,
        error: 'Authentication required'
      });
    }

    const wishlist = await WishlistModel.findByUserId(userId);
    const items = wishlist?.items || [];

    return res.status(200).json({
      success: true,
      data: {
        userId,
        totalItems: items.length,
        items
      }
    });
  } catch (error) {
    return res.status(500).json({
      success: false,
      error: 'Failed to retrieve wishlist',
      details: error.message
    });
  }
};

export const addToWishlist = async (req, res) => {
  try {
    const userId = req.user?.id || req.body?.userId;
    const { productId, note } = req.body || {};

    if (!userId) {
      return res.status(401).json({ success: false, error: 'Authentication required' });
    }

    if (!productId || typeof productId !== 'string') {
      return res.status(400).json({ success: false, error: 'Valid productId is required' });
    }

    const product = await ProductCatalog.findById(productId);
    if (!product) {
      return res.status(404).json({ success: false, error: 'Product not found' });
    }

    const alreadyInWishlist = await WishlistModel.hasItem(userId, productId);
    if (alreadyInWishlist) {
      return res.status(409).json({
        success: false,
        error: 'Product is already present in your wishlist'
      });
    }

    const item = {
      productId,
      title: product.title || product.name,
      price: product.price,
      note: note ? String(note).slice(0, 100) : null,
      addedAt: new Date()
    };

    const updated = await WishlistModel.addItem(userId, item);

    return res.status(201).json({
      success: true,
      message: 'Item added to wishlist',
      data: updated
    });
  } catch (error) {
    return res.status(500).json({
      success: false,
      error: 'Failed to add item to wishlist',
      details: error.message
    });
  }
};

export const removeFromWishlist = async (req, res) => {
  try {
    const userId = req.user?.id || req.body?.userId;
    const { productId } = req.params || {};

    if (!userId) {
      return res.status(401).json({ success: false, error: 'Authentication required' });
    }

    if (!productId) {
      return res.status(400).json({ success: false, error: 'Product ID is required' });
    }

    const exists = await WishlistModel.hasItem(userId, productId);
    if (!exists) {
      return res.status(404).json({
        success: false,
        error: 'Product not found in your wishlist'
      });
    }

    await WishlistModel.removeItem(userId, productId);

    return res.status(200).json({
      success: true,
      message: 'Product removed from wishlist',
      data: { productId }
    });
  } catch (error) {
    return res.status(500).json({
      success: false,
      error: 'Failed to remove item from wishlist',
      details: error.message
    });
  }
};
