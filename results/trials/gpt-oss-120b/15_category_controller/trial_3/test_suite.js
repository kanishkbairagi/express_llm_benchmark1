import { jest } from '@jest/globals';
import {
  getCategoryTree,
  createCategory,
  getCategoryPath,
  CategoryModel
} from '../dataset/15_category_controller.js';

describe('Category Controller', () => {
  const mockRes = () => {
    const res = {};
    res.status = jest.fn().mockReturnValue(res);
    res.json = jest.fn().mockReturnValue(res);
    return res;
  };

  afterEach(() => {
    jest.clearAllMocks();
  });

  describe('getCategoryTree', () => {
    it('should build hierarchical tree from flat list', async () => {
      const flat = [
        { id: '1', name: 'Root', parentId: null },
        { id: '2', name: 'Child A', parentId: '1' },
        { id: '3', name: 'Child B', parentId: '1' },
        { id: '4', name: 'Grandchild', parentId: '2' }
      ];
      jest.spyOn(CategoryModel, 'findAll').mockResolvedValue(flat);

      const req = {};
      const res = mockRes();

      await getCategoryTree(req, res);

      expect(res.status).toHaveBeenCalledWith(200);
      const payload = res.json.mock.calls[0][0];
      expect(payload.success).toBe(true);
      expect(payload.data).toEqual([
        {
          id: '1',
          name: 'Root',
          parentId: null,
          children: [
            {
              id: '2',
              name: 'Child A',
              parentId: '1',
              children: [
                {
                  id: '4',
                  name: 'Grandchild',
                  parentId: '2',
                  children: []
                }
              ]
            },
            {
              id: '3',
              name: 'Child B',
              parentId: '1',
              children: []
            }
          ]
        }
      ]);
    });

    it('should respond with 500 on unexpected error', async () => {
      jest.spyOn(CategoryModel, 'findAll').mockRejectedValue(new Error('DB fail'));

      const req = {};
      const res = mockRes();

      await getCategoryTree(req, res);

      expect(res.status).toHaveBeenCalledWith(500);
      const payload = res.json.mock.calls[0][0];
      expect(payload.success).toBe(false);
      expect(payload.error).toBe('Failed to construct category tree');
    });
  });

  describe('createCategory', () => {
    const baseReq = (body) => ({ body });

    it('returns 400 when name is missing or empty', async () => {
      const req = baseReq({ slug: 'valid-slug' });
      const res = mockRes();

      await createCategory(req, res);

      expect(res.status).toHaveBeenCalledWith(400);
      expect(res.json.mock.calls[0][0].error).toBe('Category name is required');
    });

    it('returns 400 when slug is invalid', async () => {
      const req = baseReq({ name: 'Test', slug: 'Invalid Slug!' });
      const res = mockRes();

      await createCategory(req, res);

      expect(res.status).toHaveBeenCalledWith(400);
      expect(res.json.mock.calls[0][0].error).toContain('Valid URL-friendly slug');
    });

    it('returns 409 when slug already exists', async () => {
      jest.spyOn(CategoryModel, 'findBySlug').mockResolvedValue({ id: 'existing' });
      const req = baseReq({ name: 'Test', slug: 'duplicate' });
      const res = mockRes();

      await createCategory(req, res);

      expect(res.status).toHaveBeenCalledWith(409);
      expect(res.json.mock.calls[0][0].error).toMatch(/already exists/);
    });

    it('returns 404 when provided parentId does not exist', async () => {
      jest.spyOn(CategoryModel, 'findBySlug').mockResolvedValue(null);
      jest.spyOn(CategoryModel, 'findById').mockResolvedValue(null); // parent not found
      const req = baseReq({ name: 'Child', slug: 'child', parentId: 'nonexistent' });
      const res = mockRes();

      await createCategory(req, res);

      expect(res.status).toHaveBeenCalledWith(404);
      expect(res.json.mock.calls[0][0].error).toMatch(/Parent category.*does not exist/);
    });

    it('creates category successfully with valid data', async () => {
      const created = {
        id: 'cat_123',
        name: 'New Category',
        slug: 'new-category',
        parentId: null,
        description: 'Desc',
        createdAt: new Date()
      };
      jest.spyOn(CategoryModel, 'findBySlug').mockResolvedValue(null);
      jest.spyOn(CategoryModel, 'findById').mockResolvedValue(null); // no parent
      jest.spyOn(CategoryModel, 'create').mockImplementation(async (data) => ({
        ...created,
        ...data,
        createdAt: created.createdAt
      }));

      const req = baseReq({
        name: '  New Category  ',
        slug: 'new-category',
        description: '  Desc  '
      });
      const res = mockRes();

      await createCategory(req, res);

      expect(res.status).toHaveBeenCalledWith(201);
      const payload = res.json.mock.calls[0][0];
      expect(payload.success).toBe(true);
      expect(payload.data.name).toBe('New Category');
      expect(payload.data.slug).toBe('new-category');
      expect(payload.data.description).toBe('Desc');
    });

    it('returns 500 on unexpected error', async () => {
      jest.spyOn(CategoryModel, 'findBySlug').mockRejectedValue(new Error('boom'));
      const req = baseReq({ name: 'Test', slug: 'test' });
      const res = mockRes();

      await createCategory(req, res);

      expect(res.status).toHaveBeenCalledWith(500);
      expect(res.json.mock.calls[0][0].error).toBe('Failed to create category');
    });
  });

  describe('getCategoryPath', () => {
    const baseReq = (params) => ({ params });

    it('returns 400 when categoryId param missing', async () => {
      const req = baseReq({});
      const res = mockRes();

      await getCategoryPath(req, res);

      expect(res.status).toHaveBeenCalledWith(400);
      expect(res.json.mock.calls[0][0].error).toBe('Category ID is required');
    });

    it('returns 404 when category not found', async () => {
      jest.spyOn(CategoryModel, 'findById').mockResolvedValue(null);
      const req = baseReq({ categoryId: 'unknown' });
      const res = mockRes();

      await getCategoryPath(req, res);

      expect(res.status).toHaveBeenCalledWith(404);
      expect(res.json.mock.calls[0][0].error).toMatch(/not found/);
    });

    it('returns full breadcrumb path from leaf to root', async () => {
      const chain = [
        { id: '1', name: 'Root', slug: 'root', parentId: null },
        { id: '2', name: 'Mid', slug: 'mid', parentId: '1' },
        { id: '3', name: 'Leaf', slug: 'leaf', parentId: '2' }
      ];
      const findByIdMock = jest.spyOn(CategoryModel, 'findById')
        .mockImplementation(async (id) => chain.find((c) => c.id === id));

      const req = baseReq({ categoryId: '3' });
      const res = mockRes();

      await getCategoryPath(req, res);

      expect(res.status).toHaveBeenCalledWith(200);
      const payload = res.json.mock.calls[0][0];
      expect(payload.success).toBe(true);
      expect(payload.data).toEqual([
        { id: '1', name: 'Root', slug: 'root' },
        { id: '2', name: 'Mid', slug: 'mid' },
        { id: '3', name: 'Leaf', slug: 'leaf' }
      ]);
      expect(findByIdMock).toHaveBeenCalledTimes(3);
    });

    it('breaks on cyclic parent references', async () => {
      const cyclic = [
        { id: 'a', name: 'A', slug: 'a', parentId: 'b' },
        { id: 'b', name: 'B', slug: 'b', parentId: 'a' }
      ];
      const map = new Map(cyclic.map(c => [c.id, c]));
      jest.spyOn(CategoryModel, 'findById')
        .mockImplementation(async (id) => map.get(id));

      const req = baseReq({ categoryId: 'a' });
      const res = mockRes();

      await getCategoryPath(req, res);

      expect(res.status).toHaveBeenCalledWith(200);
      const payload = res.json.mock.calls[0][0];
      // Should contain at most the visited nodes without infinite loop
      expect(payload.data.length).toBeLessThanOrEqual(2);
    });

    it('returns 500 on unexpected error', async () => {
      jest.spyOn(CategoryModel, 'findById').mockRejectedValue(new Error('db fail'));
      const req = baseReq({ categoryId: 'any' });
      const res = mockRes();

      await getCategoryPath(req, res);

      expect(res.status).toHaveBeenCalledWith(500);
      expect(res.json.mock.calls[0][0].error).toBe('Failed to retrieve category hierarchy path');
    });
  });
});