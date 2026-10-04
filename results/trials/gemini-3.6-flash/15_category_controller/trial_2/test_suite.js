import { jest } from '@jest/globals';
import {
  CategoryModel,
  getCategoryTree,
  createCategory,
  getCategoryPath
} from '../dataset/15_category_controller.js';

describe('15_category_controller unit tests', () => {
  let req;
  let res;

  beforeEach(() => {
    req = {
      body: {},
      params: {}
    };
    res = {
      status: jest.fn().mockReturnThis(),
      json: jest.fn().mockReturnThis()
    };
    jest.restoreAllMocks();
  });

  describe('getCategoryTree', () => {
    test('should return an empty tree when no categories exist', async () => {
      jest.spyOn(CategoryModel, 'findAll').mockResolvedValue([]);

      await getCategoryTree(req, res);

      expect(CategoryModel.findAll).toHaveBeenCalled();
      expect(res.status).toHaveBeenCalledWith(200);
      expect(res.json).toHaveBeenCalledWith({
        success: true,
        data: []
      });
    });

    test('should build a nested tree structure from flat category list', async () => {
      const flatCategories = [
        { id: 'cat_1', name: 'Electronics', parentId: null },
        { id: 'cat_2', name: 'Laptops', parentId: 'cat_1' },
        { id: 'cat_3', name: 'Gaming Laptops', parentId: 'cat_2' },
        { id: 'cat_4', name: 'Books', parentId: null }
      ];

      jest.spyOn(CategoryModel, 'findAll').mockResolvedValue(flatCategories);

      await getCategoryTree(req, res);

      expect(res.status).toHaveBeenCalledWith(200);
      const response = res.json.mock.calls[0][0];
      expect(response.success).toBe(true);
      expect(response.data).toHaveLength(2); // Electronics and Books

      const electronics = response.data.find((c) => c.id === 'cat_1');
      expect(electronics.children).toHaveLength(1);
      expect(electronics.children[0].id).toBe('cat_2');
      expect(electronics.children[0].children[0].id).toBe('cat_3');
    });

    test('should treat categories with non-existent parentId as root categories', async () => {
      const flatCategories = [
        { id: 'cat_2', name: 'Orphan Category', parentId: 'non_existent_id' }
      ];

      jest.spyOn(CategoryModel, 'findAll').mockResolvedValue(flatCategories);

      await getCategoryTree(req, res);

      expect(res.status).toHaveBeenCalledWith(200);
      const response = res.json.mock.calls[0][0];
      expect(response.data).toHaveLength(1);
      expect(response.data[0].id).toBe('cat_2');
    });

    test('should handle database errors and return 500', async () => {
      jest.spyOn(CategoryModel, 'findAll').mockRejectedValue(new Error('Database error'));

      await getCategoryTree(req, res);

      expect(res.status).toHaveBeenCalledWith(500);
      expect(res.json).toHaveBeenCalledWith({
        success: false,
        error: 'Failed to construct category tree',
        details: 'Database error'
      });
    });
  });

  describe('createCategory', () => {
    test('should return 400 if name is missing or invalid', async () => {
      req.body = { name: '   ', slug: 'valid-slug' };

      await createCategory(req, res);

      expect(res.status).toHaveBeenCalledWith(400);
      expect(res.json).toHaveBeenCalledWith({
        success: false,
        error: 'Category name is required'
      });
    });

    test('should return 400 if name is not a string', async () => {
      req.body = { name: 12345, slug: 'valid-slug' };

      await createCategory(req, res);

      expect(res.status).toHaveBeenCalledWith(400);
      expect(res.json).toHaveBeenCalledWith({
        success: false,
        error: 'Category name is required'
      });
    });

    test('should return 400 if slug is invalid or missing', async () => {
      req.body = { name: 'Electronics', slug: 'Invalid Slug!' };

      await createCategory(req, res);

      expect(res.status).toHaveBeenCalledWith(400);
      expect(res.json).toHaveBeenCalledWith({
        success: false,
        error: 'Valid URL-friendly slug (lowercase letters, numbers, hyphens) is required'
      });
    });

    test('should return 409 if category slug already exists', async () => {
      req.body = { name: 'Electronics', slug: 'electronics' };
      jest.spyOn(CategoryModel, 'findBySlug').mockResolvedValue({ id: 'cat_1', slug: 'electronics' });

      await createCategory(req, res);

      expect(CategoryModel.findBySlug).toHaveBeenCalledWith('electronics');
      expect(res.status).toHaveBeenCalledWith(409);
      expect(res.json).toHaveBeenCalledWith({
        success: false,
        error: 'Category with slug "electronics" already exists'
      });
    });

    test('should return 404 if parentId is provided but parent does not exist', async () => {
      req.body = { name: 'Laptops', slug: 'laptops', parentId: 'parent_999' };
      jest.spyOn(CategoryModel, 'findBySlug').mockResolvedValue(null);
      jest.spyOn(CategoryModel, 'findById').mockResolvedValue(null);

      await createCategory(req, res);

      expect(CategoryModel.findById).toHaveBeenCalledWith('parent_999');
      expect(res.status).toHaveBeenCalledWith(404);
      expect(res.json).toHaveBeenCalledWith({
        success: false,
        error: 'Parent category with ID parent_999 does not exist'
      });
    });

    test('should successfully create a new root category', async () => {
      req.body = { name: ' Electronics ', slug: 'electronics', description: ' Gadgets ' };
      jest.spyOn(CategoryModel, 'findBySlug').mockResolvedValue(null);
      jest.spyOn(CategoryModel, 'create').mockImplementation(async (data) => ({
        id: 'cat_100',
        ...data,
        createdAt: new Date()
      }));

      await createCategory(req, res);

      expect(CategoryModel.create).toHaveBeenCalledWith({
        name: 'Electronics',
        slug: 'electronics',
        parentId: null,
        description: 'Gadgets'
      });
      expect(res.status).toHaveBeenCalledWith(201);
      expect(res.json).toHaveBeenCalledWith({
        success: true,
        message: 'Category created successfully',
        data: expect.objectContaining({
          id: 'cat_100',
          name: 'Electronics',
          slug: 'electronics',
          parentId: null,
          description: 'Gadgets'
        })
      });
    });

    test('should successfully create a category with a valid parentId and null description', async () => {
      req.body = { name: 'Laptops', slug: 'laptops', parentId: 'cat_1' };
      jest.spyOn(CategoryModel, 'findBySlug').mockResolvedValue(null);
      jest.spyOn(CategoryModel, 'findById').mockResolvedValue({ id: 'cat_1', name: 'Electronics' });
      jest.spyOn(CategoryModel, 'create').mockImplementation(async (data) => ({
        id: 'cat_101',
        ...data
      }));

      await createCategory(req, res);

      expect(CategoryModel.create).toHaveBeenCalledWith({
        name: 'Laptops',
        slug: 'laptops',
        parentId: 'cat_1',
        description: null
      });
      expect(res.status).toHaveBeenCalledWith(201);
    });

    test('should handle exceptions during category creation and return 500', async () => {
      req.body = { name: 'Electronics', slug: 'electronics' };
      jest.spyOn(CategoryModel, 'findBySlug').mockRejectedValue(new Error('DB failure'));

      await createCategory(req, res);

      expect(res.status).toHaveBeenCalledWith(500);
      expect(res.json).toHaveBeenCalledWith({
        success: false,
        error: 'Failed to create category',
        details: 'DB failure'
      });
    });
  });

  describe('getCategoryPath', () => {
    test('should return 400 if categoryId parameter is missing', async () => {
      req.params = {};

      await getCategoryPath(req, res);

      expect(res.status).toHaveBeenCalledWith(400);
      expect(res.json).toHaveBeenCalledWith({
        success: false,
        error: 'Category ID is required'
      });
    });

    test('should return 404 if starting category is not found', async () => {
      req.params = { categoryId: 'cat_999' };
      jest.spyOn(CategoryModel, 'findById').mockResolvedValue(null);

      await getCategoryPath(req, res);

      expect(CategoryModel.findById).toHaveBeenCalledWith('cat_999');
      expect(res.status).toHaveBeenCalledWith(404);
      expect(res.json).toHaveBeenCalledWith({
        success: false,
        error: 'Category with ID cat_999 not found'
      });
    });

    test('should return breadcrumb path from root to current category', async () => {
      req.params = { categoryId: 'cat_3' };

      const cat3 = { id: 'cat_3', name: 'Gaming Laptops', slug: 'gaming-laptops', parentId: 'cat_2' };
      const cat2 = { id: 'cat_2', name: 'Laptops', slug: 'laptops', parentId: 'cat_1' };
      const cat1 = { id: 'cat_1', name: 'Electronics', slug: 'electronics', parentId: null };

      jest.spyOn(CategoryModel, 'findById').mockImplementation(async (id) => {
        if (id === 'cat_3') return cat3;
        if (id === 'cat_2') return cat2;
        if (id === 'cat_1') return cat1;
        return null;
      });

      await getCategoryPath(req, res);

      expect(res.status).toHaveBeenCalledWith(200);
      expect(res.json).toHaveBeenCalledWith({
        success: true,
        data: [
          { id: 'cat_1', name: 'Electronics', slug: 'electronics' },
          { id: 'cat_2', name: 'Laptops', slug: 'laptops' },
          { id: 'cat_3', name: 'Gaming Laptops', slug: 'gaming-laptops' }
        ]
      });
    });

    test('should handle circular parent references without infinite loop', async () => {
      req.params = { categoryId: 'cat_1' };

      const cat1 = { id: 'cat_1', name: 'Cat 1', slug: 'cat-1', parentId: 'cat_2' };
      const cat2 = { id: 'cat_2', name: 'Cat 2', slug: 'cat-2', parentId: 'cat_1' };

      jest.spyOn(CategoryModel, 'findById').mockImplementation(async (id) => {
        if (id === 'cat_1') return cat1;
        if (id === 'cat_2') return cat2;
        return null;
      });

      await getCategoryPath(req, res);

      expect(res.status).toHaveBeenCalledWith(200);
      expect(res.json).toHaveBeenCalledWith({
        success: true,
        data: [
          { id: 'cat_2', name: 'Cat 2', slug: 'cat-2' },
          { id: 'cat_1', name: 'Cat 1', slug: 'cat-1' }
        ]
      });
    });

    test('should return 500 when an exception is thrown', async () => {
      req.params = { categoryId: 'cat_1' };
      jest.spyOn(CategoryModel, 'findById').mockRejectedValue(new Error('Read failure'));

      await getCategoryPath(req, res);

      expect(res.status).toHaveBeenCalledWith(500);
      expect(res.json).toHaveBeenCalledWith({
        success: false,
        error: 'Failed to retrieve category hierarchy path',
        details: 'Read failure'
      });
    });
  });
});