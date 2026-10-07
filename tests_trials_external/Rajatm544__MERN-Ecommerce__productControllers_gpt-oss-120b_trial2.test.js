import { jest } from '@jest/globals';
import {
  getAllProducts,
  getProductById,
  deleteProduct,
  createProduct,
  updateProduct,
  createProductReview,
  getTopProducts,
} from '../dataset/external/Rajatm544__MERN-Ecommerce/backend/controllers/productControllers.js';
import Product from '../dataset/external/Rajatm544__MERN-Ecommerce/backend/models/productModel.js';

jest.mock('../dataset/external/Rajatm544__MERN-Ecommerce/backend/models/productModel.js');

const mockJson = jest.fn();
const mockStatus = jest.fn(() => ({ json: mockJson }));
const createRes = () => ({
  json: mockJson,
  status: mockStatus,
});

const next = jest.fn();

beforeEach(() => {
  jest.clearAllMocks();
  // reset static mocks
  Product.find.mockReset();
  Product.findById.mockReset();
  Product.countDocuments.mockReset();
});

/* ---------- getAllProducts ---------- */
test('getAllProducts returns paginated products with correct page info', async () => {
  const fakeProducts = [{ _id: '1' }, { _id: '2' }];
  Product.countDocuments.mockResolvedValue(20);
  Product.find.mockReturnValue({
    limit: jest.fn().mockReturnThis(),
    skip: jest.fn().mockReturnValue(Promise.resolve(fakeProducts)),
  });

  const req = { query: { pageNumber: '2', pageSize: '5', keyword: 'phone' } };
  const res = createRes();

  await getAllProducts(req, res, next);

  expect(Product.countDocuments).toHaveBeenCalledWith({
    name: { $regex: 'phone', $options: 'si' },
  });
  expect(Product.find).toHaveBeenCalledWith({
    name: { $regex: 'phone', $options: 'si' },
  });
  expect(res.json).toHaveBeenCalledWith({
    products: fakeProducts,
    page: 2,
    pages: Math.ceil(20 / 5),
  });
  expect(next).not.toHaveBeenCalled();
});

/* ---------- getProductById ---------- */
test('getProductById returns product when found', async () => {
  const product = { _id: '123', name: 'Test' };
  Product.findById.mockResolvedValue(product);
  const req = { params: { id: '123' } };
  const res = createRes();

  await getProductById(req, res, next);

  expect(Product.findById).toHaveBeenCalledWith('123');
  expect(res.json).toHaveBeenCalledWith(product);
  expect(next).not.toHaveBeenCalled();
});

test('getProductById triggers 404 when not found', async () => {
  Product.findById.mockResolvedValue(null);
  const req = { params: { id: '999' } };
  const res = createRes();

  await getProductById(req, res, next);

  expect(res.status).toHaveBeenCalledWith(404);
  expect(next).toHaveBeenCalledWith(expect.any(Error));
});

/* ---------- deleteProduct ---------- */
test('deleteProduct removes existing product and responds', async () => {
  const removeMock = jest.fn().mockResolvedValue();
  const product = { remove: removeMock };
  Product.findById.mockResolvedValue(product);
  const req = { params: { id: 'del1' } };
  const res = createRes();

  await deleteProduct(req, res, next);

  expect(Product.findById).toHaveBeenCalledWith('del1');
  expect(removeMock).toHaveBeenCalled();
  expect(res.json).toHaveBeenCalledWith({ message: 'Product removed from DB' });
  expect(next).not.toHaveBeenCalled();
});

test('deleteProduct triggers 404 when product missing', async () => {
  Product.findById.mockResolvedValue(null);
  const req = { params: { id: 'missing' } };
  const res = createRes();

  await deleteProduct(req, res, next);

  expect(res.status).toHaveBeenCalledWith(404);
  expect(next).toHaveBeenCalledWith(expect.any(Error));
});

/* ---------- createProduct ---------- */
test('createProduct saves a new product and returns 201', async () => {
  const savedProduct = { _id: 'new', name: 'Sample' };
  const saveMock = jest.fn().mockResolvedValue(savedProduct);
  // mock constructor
  Product.mockImplementation((data) => ({
    ...data,
    save: saveMock,
  }));
  const req = { user: { _id: 'user123' } };
  const res = createRes();

  await createProduct(req, res, next);

  expect(Product).toHaveBeenCalledWith(
    expect.objectContaining({
      name: 'Sample',
      user: 'user123',
    })
  );
  expect(saveMock).toHaveBeenCalled();
  expect(res.status).toHaveBeenCalledWith(201);
  expect(res.json).toHaveBeenCalledWith(savedProduct);
  expect(next).not.toHaveBeenCalled();
});

/* ---------- updateProduct ---------- */
test('updateProduct updates fields and returns updated product', async () => {
  const saveMock = jest.fn().mockResolvedValue({ _id: 'upd', name: 'NewName' });
  const product = {
    _id: 'upd',
    name: 'Old',
    save: saveMock,
  };
  Product.findById.mockResolvedValue(product);
  const req = {
    params: { id: 'upd' },
    body: { name: 'NewName', price: 99 },
  };
  const res = createRes();

  await updateProduct(req, res, next);

  expect(product.name).toBe('NewName');
  expect(product.price).toBe(99);
  expect(saveMock).toHaveBeenCalled();
  expect(res.status).toHaveBeenCalledWith(201);
  expect(res.json).toHaveBeenCalledWith({ _id: 'upd', name: 'NewName' });
  expect(next).not.toHaveBeenCalled();
});

test('updateProduct 404 when product not found', async () => {
  Product.findById.mockResolvedValue(null);
  const req = { params: { id: 'nope' }, body: {} };
  const res = createRes();

  await updateProduct(req, res, next);

  expect(res.status).toHaveBeenCalledWith(404);
  expect(next).toHaveBeenCalledWith(expect.any(Error));
});

/* ---------- createProductReview ---------- */
test('createProductReview adds new review and updates rating', async () => {
  const saveMock = jest.fn().mockResolvedValue({});
  const product = {
    _id: 'p1',
    reviews: [],
    numReviews: 0,
    rating: 0,
    save: saveMock,
  };
  Product.findById.mockResolvedValue(product);
  const req = {
    params: { id: 'p1' },
    body: { rating: 4, review: 'Great' },
    user: { _id: 'u1', name: 'User', avatar: 'av.png' },
  };
  const res = createRes();

  await createProductReview(req, res, next);

  expect(product.reviews).toHaveLength(1);
  expect(product.numReviews).toBe(1);
  expect(product.rating).toBe(4);
  expect(saveMock).toHaveBeenCalled();
  expect(res.status).toHaveBeenCalledWith(201);
  expect(res.json).toHaveBeenCalledWith({ message: 'Review Added' });
  expect(next).not.toHaveBeenCalled();
});

test('createProductReview rejects duplicate review', async () => {
  const product = {
    _id: 'p2',
    reviews: [{ user: 'u1' }],
    save: jest.fn(),
  };
  Product.findById.mockResolvedValue(product);
  const req = {
    params: { id: 'p2' },
    body: { rating: 5, review: 'Again' },
    user: { _id: 'u1', name: 'User', avatar: 'av.png' },
  };
  const res = createRes();

  await createProductReview(req, res, next);

  expect(res.status).toHaveBeenCalledWith(400);
  expect(next).toHaveBeenCalledWith(expect.any(Error));
});

/* ---------- getTopProducts ---------- */
test('getTopProducts returns top 4 products sorted by rating', async () => {
  const topProducts = [{ name: 'A' }, { name: 'B' }];
  Product.find.mockReturnValue({
    sort: jest.fn().mockReturnThis(),
    limit: jest.fn().mockResolvedValue(topProducts),
  });

  const req = {};
  const res = createRes();

  await getTopProducts(req, res, next);

  expect(Product.find).toHaveBeenCalledWith({});
  expect(res.json).toHaveBeenCalledWith(topProducts);
  expect(next).not.toHaveBeenCalled();
});