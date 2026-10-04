import { jest } from '@jest/globals';
import {
  CategoryModel,
  getCategoryTree,
  createCategory,
  getCategoryPath
} from '../dataset/15_category_controller.js';

describe('15_category_controller Unit Tests', () => {
  let mockRes;

  beforeEach(() => {
    mockRes = {
      status: jest.fn().mockReturnThis(),
      json: jest.fn().mockReturnThis()
    };
    jest.restoreAllMocks();
  });

  describe('CategoryModel Default Methods', () => {
    test('findAll should return an empty array by default', async () => {
      const result = await CategoryModel.findAll();
      expect(result).toEqual([]);
    });

    test('findById should return null by default', async () => {
      const result = await CategoryModel.findById('cat_1');
      expect(result).toBeNull();
    });

    test('findBySlug should return null by default', async () => {
      const result = await CategoryModel.findBySlug('electronics');
      expect(result).toBeNull();
    });

    test('create should return created object with generated id and createdAt', async () => {
      const payload = { name: 'Books', slug: 'books' };
      const result = await CategoryModel.create(payload);

      expect(result).toHaveProperty('id');
      expect(result.id).toMatch(/^cat_/);
      expect(result.name).toBe('Books');
      expect(result.slug).toBe('books');
      expect(result).toHaveProperty('createdAt');
      expect(result.createdAt).toBeInstanceOf(Date);
    });
  });

  describe('getCategoryTree', () => {
    test('should construct a category tree with nested children', async () => {
      const mockCategories = [
        { id: '1', name: 'Electronics', parentId: null },
        { id: '2', name: 'Laptops', parentId: '1' },
        { id: '3', name: 'Gaming Laptops', parentId: '2' },
        { id: '4', name: 'Clothing', parentId: null }
      ];

      jest.spyOn(CategoryModel, 'findAll').mockResolvedValue(mockCategories);

      const req = {};
      await getCategoryTree(req, mockRes);

      expect(mockRes.status).toHaveBeenCalledWith(200);
      expect(mockRes.json).toHaveBeenCalledWith({
        success: true,
        data: [
          {
            id: '1',
            name: 'Electronics',
            parentId: null,
            children: [
              {
                id: '2',
                name: 'Laptops',
                parentId: '1',
                children: [
                  {
                    id: '3',
                    name: 'Gaming Laptops',
                    parentId: '2',
                    children: []
                  }
                ]
              }
            ]
          },
          {
            id: '4',
            name: 'Clothing',
            parentId: null,
            children: []
          }
        ]
      });
    });

    test('should treat category as root if its parentId does not exist in category map', async () => {
      const mockCategories = [
        { id: '1', name: 'Orphan Laptop', parentId: 'non_existent_id' }
      ];

      jest.spyOn(CategoryModel, 'findAll').mockResolvedValue(mockCategories);

      const req = {};
      await getCategoryTree(req, mockRes);

      expect(mockRes.status).toHaveBeenCalledWith(200);
      expect(mockRes.json).toHaveBeenCalledWith({
        success: true,
        data: [
          {
            id: '1',
            name: 'Orphan Laptop',
            parentId: 'non_existent_id',
            children: []
          }
        ]
      });
    });

    test('should return status 500 when database operation fails', async () => {
      jest.spyOn(CategoryModel, 'findAll').mockRejectedValue(new Error('Database error'));

      const req = {};
      await getCategoryTree(req, mockRes);

      expect(mockRes.status).toHaveBeenCalledWith(500);
      expect(mockRes.json).toHaveBeenCalledWith({
        success: false,
        error: 'Failed to construct category tree',
        details: 'Database error'
      });
    });
  });

  describe('createCategory', () => {
    test('should return 400 if body is missing or name is invalid', async () => {
      const invalidBodies = [
        {},
        { name: '' },
        { name: '   ' },
        { name: 123 }
      ];

      for (const body of invalidBodies) {
        const req = { body };
        await createCategory(req, mockRes);
        expect(mockRes.status).toHaveBeenCalledWith(400);
        expect(mockRes.json).toHaveBeenCalledWith({
          success: false,
          error: 'Category name is required'
        });
        jest.clearAllMocks();
      }
    });

    test('should return 400 if slug is missing or invalid', async () => {
      const invalidSlugs = [
        { name: 'Electronics' },
        { name: 'Electronics', slug: '' },
        { name: 'Electronics', slug: 'Invalid Slug!' },
        { name: 'Electronics', slug: 'ELECTRONICS' },
        { name: 'Electronics', slug: 123 }
      ];

      for (const body of invalidSlugs) {
        const req = { body };
        await createCategory(req, mockRes);
        expect(mockRes.status).toHaveBeenCalledWith(400);
        expect(mockRes.json).toHaveBeenCalledWith({
          success: false,
          error: 'Valid URL-friendly slug (lowercase letters, numbers, hyphens) is required'
        });
        jest.clearAllMocks();
      }
    });

    test('should return 409 if category slug already exists', async () => {
      jest.spyOn(CategoryModel, 'findBySlug').mockResolvedValue({ id: 'cat_1', slug: 'laptops' });

      const req = {
        body: {
          name: 'Laptops',
          slug: 'laptops'
        }
      };

      await createCategory(req, mockRes);

      expect(CategoryModel.findBySlug).toHaveBeenCalledWith('laptops');
      expect(mockRes.status).toHaveBeenCalledWith(409);
      expect(mockRes.json).toHaveBeenCalledWith({
        success: false,
        error: 'Category with slug "laptops" already exists'
      });
    });

    test('should return 404 if specified parentId does not exist', async () => {
      jest.spyOn(CategoryModel, 'findBySlug').mockResolvedValue(null);
      jest.spyOn(CategoryModel, 'findById').mockResolvedValue(null);

      const req = {
        body: {
          name: 'Gaming Laptops',
          slug: 'gaming-laptops',
          parentId: 'parent_999'
        }
      };

      await createCategory(req, mockRes);

      expect(CategoryModel.findById).toHaveBeenCalledWith('parent_999');
      expect(mockRes.status).toHaveBeenCalledWith(404);
      expect(mockRes.json).toHaveBeenCalledWith({
        success: false,
        error: 'Parent category with ID parent_999 does not exist'
      });
    });

    test('should successfully create a root category', async () => {
      jest.spyOn(CategoryModel, 'findBySlug').mockResolvedValue(null);
      const createdCategory = {
        id: 'cat_100',
        name: 'Electronics',
        slug: 'electronics',
        parentId: null,
        description: null,
        createdAt: new Date()
      };
      jest.spyOn(CategoryModel, 'create').mockResolvedValue(createdCategory);

      const req = {
        body: {
          name: ' Electronics ',
          slug: 'electronics'
        }
      };

      await createCategory(req, mockRes);

      expect(CategoryModel.create).toHaveBeenCalledWith({
        name: 'Electronics',
        slug: 'electronics',
        parentId: null,
        description: null
      });
      expect(mockRes.status).toHaveBeenCalledWith(201);
      expect(mockRes.json).toHaveBeenCalledWith({
        success: true,
        message: 'Category created successfully',
        data: createdCategory
      });
    });

    test('should successfully create a child category with description', async () => {
      jest.spyOn(CategoryModel, 'findBySlug').mockResolvedValue(null);
      jest.spyOn(CategoryModel, 'findById').mockResolvedValue({ id: 'cat_parent' });
      const createdCategory = {
        id: 'cat_101',
        name: 'Laptops',
        slug: 'laptops',
        parentId: 'cat_parent',
        description: 'Laptop computers',
        createdAt: new Date()
      };
      jest.spyOn(CategoryModel, 'create').mockResolvedValue(createdCategory);

      const req = {
        body: {
          name: 'Laptops',
          slug: 'laptops',
          parentId: 'cat_parent',
          description: ' Laptop computers '
        }
      };

      await createCategory(req, mockRes);

      expect(CategoryModel.create).toHaveBeenCalledWith({
        name: 'Laptops',
        slug: 'laptops',
        parentId: 'cat_parent',
        description: 'Laptop computers'
      });
      expect(mockRes.status).toHaveBeenCalledWith(201);
      expect(mockRes.json).toHaveBeenCalledWith({
        success: true,
        message: 'Category created successfully',
        data: createdCategory
      });
    });

    test('should return 500 if create operation throws an exception', async () => {
      jest.spyOn(CategoryModel, 'findBySlug').mockRejectedValue(new Error('Write error'));

      const req = {
        body: {
          name: 'Electronics',
          slug: 'electronics'
        }
      };

      await createCategory(req, mockRes);

      expect(mockRes.status).toHaveBeenCalledWith(500);
      expect(mockRes.json).toHaveBeenCalledWith({
        success: false,
        error: 'Failed to create category',
        details: 'Write error'
      });
    });
  });

  describe('getCategoryPath', () => {
    test('should return 400 if categoryId parameter is missing', async () => {
      const req = { params: {} };

      await getCategoryPath(req, mockRes);

      expect(mockRes.status).toHaveBeenCalledWith(400);
      expect(mockRes.json).toHaveBeenCalledWith({
        success: false,
        error: 'Category ID is required'
      });
    });

    test('should return 404 if target category is not found', async () => {
      jest.spyOn(CategoryModel, 'findById').mockResolvedValue(null);

      const req = { params: { categoryId: 'non_existent' } };

      await getCategoryPath(req, mockRes);

      expect(CategoryModel.findById).toHaveBeenCalledWith('non_existent');
      expect(mockRes.status).toHaveBeenCalledWith(404);
      expect(mockRes.json).toHaveBeenCalledWith({
        success: false,
        error: 'Category with ID non_existent not found'
      });
    });

    test('should return correct breadcrumb path from root to leaf', async () => {
      const cat3 = { id: '3', name: 'Gaming Laptops', slug: 'gaming-laptops', parentId: '2' };
      const cat2 = { id: '2', name: 'Laptops', slug: 'laptops', parentId: '1' };
      const cat1 = { id: '1', name: 'Electronics', slug: 'electronics', parentId: null };

      jest.spyOn(CategoryModel, 'findById').mockImplementation(async (id) => {
        if (id === '3') return cat3;
        if (id === '2') return cat2;
        if (id === '1') return cat1;
        return null;
      });

      const req = { params: { categoryId: '3' } };

      await getCategoryPath(req, mockRes);

      expect(mockRes.status).toHaveBeenCalledWith(200);
      expect(mockRes.json).toHaveBeenCalledWith({
        success: true,
        data: [
          { id: '1', name: 'Electronics', slug: 'electronics' },
          { id: '2', name: 'Laptops', slug: 'laptops' },
          { id: '3', name: 'Gaming Laptops', slug: 'gaming-laptops' }
        ]
      });
    });

    test('should safely handle cyclic parent references without infinite looping', async () => {
      const catA = { id: 'A', name: 'Category A', slug: 'cat-a', parentId: 'B' };
      const catB = { id: 'B', name: 'Category B', slug: 'cat-b', parentId: 'A' };

      jest.spyOn(CategoryModel, 'findById').mockImplementation(async (id) => {
        if (id === 'A') return catA;
        if (id === 'B') return catB;
        return null;
      });

      const req = { params: { categoryId: 'A' } };

      await getCategoryPath(req, mockRes);

      expect(mockRes.status).toHaveBeenCalledWith(200);
      expect(mockRes.json).toHaveBeenCalledWith({
        success: true,
        data: [
          { id: 'B', name: 'Category B', slug: 'cat-b' },
          { id: 'A', name: 'Category A', slug: 'cat-a' }
        ]
      });
    });

    test('should return 500 when database error occurs during path retrieval', async () => {
      jest.spyOn(CategoryModel, 'findById').mockRejectedValue(new Error('Connection failure'));

      const req = { params: { categoryId: '1' } };

      await getCategoryPath(req, mockRes);

      expect(mockRes.status).toHaveBeenCalledWith(500);
      expect(mockRes.json).toHaveBeenCalledWith({
        success: false,
        error: 'Failed to retrieve category hierarchy path',
        details: 'Connection failure'
      });
    });
  });
});