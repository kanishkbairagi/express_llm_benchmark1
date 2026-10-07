import { jest } from '@jest/globals';
import Product from '../models/productModel.js';
import {
	getProductById,
	getAllProducts,
	deleteProduct,
	createProduct,
	updateProduct,
	createProductReview,
	getTopProducts,
} from '../dataset/external/Rajatm544__MERN-Ecommerce/backend/controllers/productControllers.js';

jest.mock('../models/productModel.js');

describe('Product Controllers', () => {
	let req;
	let res;
	let next;

	beforeEach(() => {
		req = {
			query: {},
			params: {},
			body: {},
			user: { _id: 'user123', name: 'Test User', avatar: 'avatar.jpg' },
		};
		res = {
			status: jest.fn().mockReturnThis(),
			json: jest.fn().mockReturnThis(),
		};
		next = jest.fn();
		jest.clearAllMocks();
	});

	describe('getAllProducts', () => {
		it('should return products with default pagination and no keyword filter', async () => {
			const mockProducts = [{ name: 'Product 1' }, { name: 'Product 2' }];
			Product.countDocuments.mockResolvedValue(2);

			const limitMock = jest.fn();
			const skipMock = jest.fn().mockResolvedValue(mockProducts);
			limitMock.mockReturnValue({ skip: skipMock });
			Product.find.mockReturnValue({ limit: limitMock });

			await getAllProducts(req, res, next);

			expect(Product.countDocuments).toHaveBeenCalledWith({});
			expect(Product.find).toHaveBeenCalledWith({});
			expect(limitMock).toHaveBeenCalledWith(10);
			expect(skipMock).toHaveBeenCalledWith(0);
			expect(res.json).toHaveBeenCalledWith({
				products: mockProducts,
				page: 1,
				pages: 1,
			});
		});

		it('should handle custom pageNumber, pageSize, and keyword', async () => {
			req.query = { pageNumber: '2', pageSize: '5', keyword: 'phone' };
			const mockProducts = [{ name: 'Phone 1' }];
			Product.countDocuments.mockResolvedValue(12);

			const limitMock = jest.fn();
			const skipMock = jest.fn().mockResolvedValue(mockProducts);
			limitMock.mockReturnValue({ skip: skipMock });
			Product.find.mockReturnValue({ limit: limitMock });

			await getAllProducts(req, res, next);

			const expectedKeyword = {
				name: {
					$regex: 'phone',
					$options: 'si',
				},
			};
			expect(Product.countDocuments).toHaveBeenCalledWith(expectedKeyword);
			expect(Product.find).toHaveBeenCalledWith(expectedKeyword);
			expect(limitMock).toHaveBeenCalledWith(5);
			expect(skipMock).toHaveBeenCalledWith(5);
			expect(res.json).toHaveBeenCalledWith({
				products: mockProducts,
				page: 2,
				pages: 3,
			});
		});
	});

	describe('getProductById', () => {
		it('should return product if found', async () => {
			req.params.id = 'prod123';
			const mockProduct = { _id: 'prod123', name: 'Test Product' };
			Product.findById.mockResolvedValue(mockProduct);

			await getProductById(req, res, next);

			expect(Product.findById).toHaveBeenCalledWith('prod123');
			expect(res.json).toHaveBeenCalledWith(mockProduct);
		});

		it('should set 404 status and pass error to next if product not found', async () => {
			req.params.id = 'invalidId';
			Product.findById.mockResolvedValue(null);

			await getProductById(req, res, next);

			expect(res.status).toHaveBeenCalledWith(404);
			expect(next).toHaveBeenCalledWith(expect.any(Error));
			expect(next.mock.calls[0][0].message).toBe('Product not found');
		});
	});

	describe('deleteProduct', () => {
		it('should delete product if found', async () => {
			req.params.id = 'prod123';
			const mockProduct = {
				_id: 'prod123',
				remove: jest.fn().mockResolvedValue(true),
			};
			Product.findById.mockResolvedValue(mockProduct);

			await deleteProduct(req, res, next);

			expect(Product.findById).toHaveBeenCalledWith('prod123');
			expect(mockProduct.remove).toHaveBeenCalled();
			expect(res.json).toHaveBeenCalledWith({ message: 'Product removed from DB' });
		});

		it('should set 404 status and pass error to next if product not found', async () => {
			req.params.id = 'invalidId';
			Product.findById.mockResolvedValue(null);

			await deleteProduct(req, res, next);

			expect(res.status).toHaveBeenCalledWith(404);
			expect(next).toHaveBeenCalledWith(expect.any(Error));
			expect(next.mock.calls[0][0].message).toBe('Product not found');
		});
	});

	describe('createProduct', () => {
		it('should create a sample product and return 201', async () => {
			const mockCreatedProduct = {
				_id: 'newProd123',
				name: 'Sample',
				brand: 'Sample Brand',
			};
			Product.prototype.save = jest.fn().mockResolvedValue(mockCreatedProduct);

			await createProduct(req, res, next);

			expect(Product.prototype.save).toHaveBeenCalled();
			expect(res.status).toHaveBeenCalledWith(201);
			expect(res.json).toHaveBeenCalledWith(mockCreatedProduct);
		});
	});

	describe('updateProduct', () => {
		it('should update and save product if found', async () => {
			req.params.id = 'prod123';
			req.body = {
				name: 'Updated Name',
				price: 99.99,
				brand: 'Updated Brand',
				category: 'Updated Category',
				numReviews: 5,
				countInStock: 10,
				description: 'Updated Desc',
				image: '/images/new.jpg',
			};

			const mockProduct = {
				_id: 'prod123',
				name: 'Old Name',
				save: jest.fn(),
			};
			const updatedProduct = { ...mockProduct, ...req.body };
			mockProduct.save.mockResolvedValue(updatedProduct);
			Product.findById.mockResolvedValue(mockProduct);

			await updateProduct(req, res, next);

			expect(Product.findById).toHaveBeenCalledWith('prod123');
			expect(mockProduct.name).toBe('Updated Name');
			expect(mockProduct.price).toBe(99.99);
			expect(mockProduct.save).toHaveBeenCalled();
			expect(res.status).toHaveBeenCalledWith(201);
			expect(res.json).toHaveBeenCalledWith(updatedProduct);
		});

		it('should set 404 and pass error to next if product not found', async () => {
			req.params.id = 'invalidId';
			Product.findById.mockResolvedValue(null);

			await updateProduct(req, res, next);

			expect(res.status).toHaveBeenCalledWith(404);
			expect(next).toHaveBeenCalledWith(expect.any(Error));
			expect(next.mock.calls[0][0].message).toBe('Product not available');
		});
	});

	describe('createProductReview', () => {
		it('should add review and update product rating if not reviewed already', async () => {
			req.params.id = 'prod123';
			req.body = { rating: '5', review: 'Great product!' };

			const mockProduct = {
				_id: 'prod123',
				reviews: [{ user: 'user999', rating: 4 }],
				numReviews: 1,
				rating: 4,
				save: jest.fn().mockResolvedValue(true),
			};
			Product.findById.mockResolvedValue(mockProduct);

			await createProductReview(req, res, next);

			expect(Product.findById).toHaveBeenCalledWith('prod123');
			expect(mockProduct.reviews).toHaveLength(2);
			expect(mockProduct.numReviews).toBe(2);
			expect(mockProduct.rating).toBe(4.5);
			expect(mockProduct.save).toHaveBeenCalled();
			expect(res.status).toHaveBeenCalledWith(201);
			expect(res.json).toHaveBeenCalledWith({ message: 'Review Added' });
		});

		it('should return 400 error if user already reviewed product', async () => {
			req.params.id = 'prod123';
			req.body = { rating: 5, review: 'Great product!' };

			const mockProduct = {
				_id: 'prod123',
				reviews: [{ user: 'user123', rating: 4 }],
			};
			Product.findById.mockResolvedValue(mockProduct);

			await createProductReview(req, res, next);

			expect(res.status).toHaveBeenCalledWith(400);
			expect(next).toHaveBeenCalledWith(expect.any(Error));
			expect(next.mock.calls[0][0].message).toBe('Product Already Reviewed');
		});

		it('should return 404 error if product not found', async () => {
			req.params.id = 'invalidId';
			Product.findById.mockResolvedValue(null);

			await createProductReview(req, res, next);

			expect(res.status).toHaveBeenCalledWith(404);
			expect(next).toHaveBeenCalledWith(expect.any(Error));
			expect(next.mock.calls[0][0].message).toBe('Product not available');
		});
	});

	describe('getTopProducts', () => {
		it('should return top 4 rated products', async () => {
			const mockTopProducts = [{ name: 'Top 1' }, { name: 'Top 2' }];
			const limitMock = jest.fn().mockResolvedValue(mockTopProducts);
			const sortMock = jest.fn().mockReturnValue({ limit: limitMock });
			Product.find.mockReturnValue({ sort: sortMock });

			await getTopProducts(req, res, next);

			expect(Product.find).toHaveBeenCalledWith({});
			expect(sortMock).toHaveBeenCalledWith({ rating: -1 });
			expect(limitMock).toHaveBeenCalledWith(4);
			expect(res.json).toHaveBeenCalledWith(mockTopProducts);
		});
	});
});