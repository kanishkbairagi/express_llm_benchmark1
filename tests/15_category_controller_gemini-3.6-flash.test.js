import { jest } from '@jest/globals';
import {
  getCategoryTree,
  createCategory,
  getCategoryPath,
  CategoryModel
} from '../dataset/15_category_controller.js';

describe('15_category_controller', () => {
  let req;
  let res;

  beforeEach(() => {
    req = {};
    res = {
      status: jest.fn().mockReturnThis(),
      json: jest.fn().mockReturnThis()
    };
    jest.clearAllMocks();
  });

  describe('CategoryModel Default Implementation', () => {
    it('should execute default CategoryModel methods correctly', async () => {
      expect(await CategoryModel.findAll()).toEqual([]);
      expect(await CategoryModel.findById('123')).toBeNull();
      expect(await CategoryModel.findBySlug('test')).toBeNull();

      const created = await CategoryModel.create({ name: 'Test' });
      expect(created.name).toBe('Test');
      expect(created.id).toMatch(/^cat_/);
      expect(created.createdAt).toBeInstanceOf(Date);
    });
  });

  describe('getCategoryTree', () => {
    it('should return empty tree when no categories exist', async () => {
      jest.spyOn(CategoryModel, 'findAll').mockResolvedValueOnce([]);

      await getCategoryTree(req, res);

      expect(res.status).toHaveBeenCalledWith(200);
      expect(res.json).toHaveBeenCalledWith({
        success: true,
        data: []
      });
    });

    it('should build a nested category tree structure', async () => {
      const flatCategories = [
        { id: '1', name: 'Electronics', parentId: null },
        { id: '2', name: 'Laptops', parentId: '1' },
        { id: '3', name: 'Gaming Laptops', parentId: '2' },
        { id: '4', name: 'Books', parentId: null }
      ];

      jest.spyOn(CategoryModel, 'findAll').mockResolvedValueOnce(flatCategories);

      await getCategoryTree(req, res);

      expect(res.status).toHaveBeenCalledWith(200);
      const jsonCall = res.json.mock.calls[0][0];
      expect(jsonCall.success).toBe(true);
      expect(jsonCall.data).toHaveLength(2);

      const electronics = jsonCall.data.find((c) => c.id === '1');
      expect(electronics.children).toHaveLength(1);
      expect(electronics.children[0].id).toBe('2');
      expect(electronics.children[0].children[0].id).toBe('3');
    });

    it('should treat orphan categories (missing parent in map) as root categories', async () => {
      const flatCategories = [
        { id: '2', name: 'Orphan Laptops', parentId: 'non_existent_id' }
      ];

      jest.spyOn(CategoryModel, 'findAll').mockResolvedValueOnce(flatCategories);

      await getCategoryTree(req, res);

      expect(res.status).toHaveBeenCalledWith(200);
      expect(res.json).toHaveBeenCalledWith({
        success: true,
        data: [{ id: '2', name: 'Orphan Laptops', parentId: 'non_existent_id', children: [] }]
      });
    });

    it('should handle errors and return 500 status', async () => {
      jest.spyOn(CategoryModel, 'findAll').mockRejectedValueOnce(new Error('Database error'));

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
    it('should return 400 if category name is missing or invalid', async () => {
      req.body = { name: '   ', slug: 'valid-slug' };

      await createCategory(req, res);

      expect(res.status).toHaveBeenCalledWith(400);
      expect(res.json).toHaveBeenCalledWith({
        success: false,
        error: 'Category name is required'
      });
    });

    it('should return 400 if slug is missing or does not match slug format', async () => {
      req.body = { name: 'Category', slug: 'Invalid Slug!' };

      await createCategory(req, res);

      expect(res.status).toHaveBeenCalledWith(400);
      expect(res.json).toHaveBeenCalledWith({
        success: false,
        error: 'Valid URL-friendly slug (lowercase letters, numbers, hyphens) is required'
      });
    });

    it('should return 409 if category slug already exists', async () => {
      req.body = { name: 'Category', slug: 'existing-slug' };
      jest.spyOn(CategoryModel, 'findBySlug').mockResolvedValueOnce({ id: 'cat_1', slug: 'existing-slug' });

      await createCategory(req, res);

      expect(res.status).toHaveBeenCalledWith(409);
      expect(res.json).toHaveBeenCalledWith({
        success: false,
        error: 'Category with slug "existing-slug" already exists'
      });
    });

    it('should return 404 if parentId is provided but parent category does not exist', async () => {
      req.body = { name: 'Category', slug: 'new-slug', parentId: 'parent_999' };
      jest.spyOn(CategoryModel, 'findBySlug').mockResolvedValueOnce(null);
      jest.spyOn(CategoryModel, 'findById').mockResolvedValueOnce(null);

      await createCategory(req, res);

      expect(res.status).toHaveBeenCalledWith(404);
      expect(res.json).toHaveBeenCalledWith({
        success: false,
        error: 'Parent category with ID parent_999 does not exist'
      });
    });

    it('should create a category successfully without parentId and description', async () => {
      req.body = { name: '  Electronics  ', slug: 'electronics' };
      jest.spyOn(CategoryModel, 'findBySlug').mockResolvedValueOnce(null);
      jest.spyOn(CategoryModel, 'create').mockImplementationOnce(async (data) => ({
        id: 'cat_123',
        ...data
      }));

      await createCategory(req, res);

      expect(CategoryModel.create).toHaveBeenCalledWith({
        name: 'Electronics',
        slug: 'electronics',
        parentId: null,
        description: null
      });

      expect(res.status).toHaveBeenCalledWith(201);
      expect(res.json).toHaveBeenCalledWith({
        success: true,
        message: 'Category created successfully',
        data: {
          id: 'cat_123',
          name: 'Electronics',
          slug: 'electronics',
          parentId: null,
          description: null
        }
      });
    });

    it('should create a category successfully with parentId and description', async () => {
      req.body = {
        name: 'Laptops',
        slug: 'laptops',
        parentId: 'cat_1',
        description: '  Gaming and office laptops  '
      };
      jest.spyOn(CategoryModel, 'findBySlug').mockResolvedValueOnce(null);
      jest.spyOn(CategoryModel, 'findById').mockResolvedValueOnce({ id: 'cat_1', name: 'Electronics' });
      jest.spyOn(CategoryModel, 'create').mockImplementationOnce(async (data) => ({
        id: 'cat_2',
        ...data
      }));

      await createCategory(req, res);

      expect(CategoryModel.create).toHaveBeenCalledWith({
        name: 'Laptops',
        slug: 'laptops',
        parentId: 'cat_1',
        description: 'Gaming and office laptops'
      });

      expect(res.status).toHaveBeenCalledWith(201);
    });

    it('should handle internal errors during creation and return 500', async () => {
      req.body = { name: 'Laptops', slug: 'laptops' };
      jest.spyOn(CategoryModel, 'findBySlug').mockRejectedValueOnce(new Error('Connection failure'));

      await createCategory(req, res);

      expect(res.status).toHaveBeenCalledWith(500);
      expect(res.json).toHaveBeenCalledWith({
        success: false,
        error: 'Failed to create category',
        details: 'Connection failure'
      });
    });
  });

  describe('getCategoryPath', () => {
    it('should return 400 if categoryId parameter is missing', async () => {
      req.params = {};

      await getCategoryPath(req, res);

      expect(res.status).toHaveBeenCalledWith(400);
      expect(res.json).toHaveBeenCalledWith({
        success: false,
        error: 'Category ID is required'
      });
    });

    it('should return 404 if starting category is not found', async () => {
      req.params = { categoryId: 'non_existent' };
      jest.spyOn(CategoryModel, 'findById').mockResolvedValueOnce(null);

      await getCategoryPath(req, res);

      expect(res.status).toHaveBeenCalledWith(404);
      expect(res.json).toHaveBeenCalledWith({
        success: false,
        error: 'Category with ID non_existent not found'
      });
    });

    it('should return full hierarchy breadcrumbs for valid nested category', async () => {
      req.params = { categoryId: 'cat_3' };

      const cat3 = { id: 'cat_3', name: 'Gaming Laptops', slug: 'gaming-laptops', parentId: 'cat_2' };
      const cat2 = { id: 'cat_2', name: 'Laptops', slug: 'laptops', parentId: 'cat_1' };
      const cat1 = { id: 'cat_1', name: 'Electronics', slug: 'electronics', parentId: null };

      jest.spyOn(CategoryModel, 'findById')
        .mockResolvedValueOnce(cat3)
        .mockResolvedValueOnce(cat2)
        .mockResolvedValueOnce(cat1);

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

    it('should break cycle if malformed data contains circular parent references', async () => {
      req.params = { categoryId: 'cat_A' };

      const catA = { id: 'cat_A', name: 'A', slug: 'a', parentId: 'cat_B' };
      const catB = { id: 'cat_B', name: 'B', slug: 'b', parentId: 'cat_A' };

      jest.spyOn(CategoryModel, 'findById')
        .mockResolvedValueOnce(catA)
        .mockResolvedValueOnce(catB)
        .mockResolvedValueOnce(catA);

      await getCategoryPath(req, res);

      expect(res.status).toHaveBeenCalledWith(200);
      expect(res.json).toHaveBeenCalledWith({
        success: true,
        data: [
          { id: 'cat_B', name: 'B', slug: 'b' },
          { id: 'cat_A', name: 'A', slug: 'a' }
        ]
      });
    });

    it('should handle internal errors and return 500 status', async () => {
      req.params = { categoryId: 'cat_1' };
      jest.spyOn(CategoryModel, 'findById').mockRejectedValueOnce(new Error('DB read error'));

      await getCategoryPath(req, res);

      expect(res.status).toHaveBeenCalledWith(500);
      expect(res.json).toHaveBeenCalledWith({
        success: false,
        error: 'Failed to retrieve category hierarchy path',
        details: 'DB read error'
      });
    });
  });
});