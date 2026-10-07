import { jest } from '@jest/globals';
import request from 'supertest';
import express from 'express';
import router from '../dataset/external/iampranavdhar__Library-Management-System-MERN/backend/routes/books.js';

/* ---------- Mock Models ---------- */
jest.mock('../dataset/external/iampranavdhar__Library-Management-System-MERN/backend/models/Book.js', () => {
  const saveMock = jest.fn().mockResolvedValue({
    _id: 'bookId',
    categories: ['catId'],
    bookName: 'Test Book',
  });

  const MockBook = jest.fn().mockImplementation((data) => ({
    ...data,
    save: saveMock,
  }));

  MockBook.find = jest.fn().mockImplementation(() => ({
    populate: () => ({
      sort: () => Promise.resolve([{ _id: 'bookId', bookName: 'Book A' }]),
    }),
  }));

  MockBook.findById = jest.fn().mockImplementation(() => ({
    populate: () => Promise.resolve({ _id: 'bookId', bookName: 'Single Book' }),
  }));

  MockBook.findByIdAndUpdate = jest.fn().mockResolvedValue();

  MockBook.findOne = jest.fn();

  return { __esModule: true, default: MockBook };
});

jest.mock('../dataset/external/iampranavdhar__Library-Management-System-MERN/backend/models/BookCategory.js', () => {
  const findOneMock = jest.fn().mockResolvedValue({
    _id: 'catId',
    categoryName: 'Fiction',
    books: [{ _id: 'bookId', bookName: 'Book A' }],
  });

  const updateManyMock = jest.fn().mockResolvedValue();

  const MockCategory = jest.fn();
  MockCategory.findOne = findOneMock;
  MockCategory.updateMany = updateManyMock;

  return { __esModule: true, default: MockCategory };
});

/* ---------- Setup Express App ---------- */
const app = express();
app.use(express.json());
app.use(router);

describe('Books Router', () => {
  afterEach(() => {
    jest.clearAllMocks();
  });

  test('GET /allbooks - success', async () => {
    const res = await request(app).get('/allbooks');
    expect(res.status).toBe(200);
    expect(Array.isArray(res.body)).toBe(true);
    expect(res.body[0]).toHaveProperty('bookName', 'Book A');
    const { default: Book } = await import('../dataset/external/iampranavdhar__Library-Management-System-MERN/backend/models/Book.js');
    expect(Book.find).toHaveBeenCalledWith({});
  });

  test('GET /allbooks - error handling', async () => {
    const { default: Book } = await import('../dataset/external/iampranavdhar__Library-Management-System-MERN/backend/models/Book.js');
    Book.find.mockImplementationOnce(() => {
      throw new Error('DB error');
    });
    const res = await request(app).get('/allbooks');
    expect(res.status).toBe(504);
    expect(res.body).toHaveProperty('message', 'DB error');
  });

  test('GET /getbook/:id - success', async () => {
    const res = await request(app).get('/getbook/anyId');
    expect(res.status).toBe(200);
    expect(res.body).toHaveProperty('bookName', 'Single Book');
  });

  test('GET /getbook/:id - error handling', async () => {
    const { default: Book } = await import('../dataset/external/iampranavdhar__Library-Management-System-MERN/backend/models/Book.js');
    Book.findById.mockImplementationOnce(() => {
      throw new Error('find error');
    });
    const res = await request(app).get('/getbook/anyId');
    expect(res.status).toBe(500);
  });

  test('GET / with category query - success', async () => {
    const res = await request(app).get('/').query({ category: 'Fiction' });
    expect(res.status).toBe(200);
    expect(res.body).toHaveProperty('categoryName', 'Fiction');
    const { default: BookCategory } = await import('../dataset/external/iampranavdhar__Library-Management-System-MERN/backend/models/BookCategory.js');
    expect(BookCategory.findOne).toHaveBeenCalledWith({ categoryName: 'Fiction' });
  });

  test('GET / with category query - error handling', async () => {
    const { default: BookCategory } = await import('../dataset/external/iampranavdhar__Library-Management-System-MERN/backend/models/BookCategory.js');
    BookCategory.findOne.mockImplementationOnce(() => {
      throw new Error('cat error');
    });
    const res = await request(app).get('/').query({ category: 'Fiction' });
    expect(res.status).toBe(504);
    expect(res.body).toHaveProperty('message', 'cat error');
  });

  test('POST /addbook - admin success', async () => {
    const payload = {
      isAdmin: true,
      bookName: 'New Book',
      alternateTitle: 'Alt',
      author: 'Author',
      bookCountAvailable: 5,
      language: 'EN',
      publisher: 'Pub',
      bookSatus: 'Available',
      categories: ['catId'],
    };
    const res = await request(app).post('/addbook').send(payload);
    expect(res.status).toBe(200);
    expect(res.body).toHaveProperty('bookName', 'Test Book');
    const { default: BookCategory } = await import('../dataset/external/iampranavdhar__Library-Management-System-MERN/backend/models/BookCategory.js');
    expect(BookCategory.updateMany).toHaveBeenCalledWith(
      { _id: ['catId'] },
      { $push: { books: 'bookId' } }
    );
  });

  test('POST /addbook - non‑admin forbidden', async () => {
    const res = await request(app).post('/addbook').send({ isAdmin: false });
    expect(res.status).toBe(403);
    expect(res.body).toBe('You dont have permission to delete a book!');
  });

  test('PUT /updatebook/:id - admin success', async () => {
    const res = await request(app)
      .put('/updatebook/anyId')
      .send({ isAdmin: true, bookName: 'Updated' });
    expect(res.status).toBe(200);
    expect(res.body).toBe('Book details updated successfully');
    const { default: Book } = await import('../dataset/external/iampranavdhar__Library-Management-System-MERN/backend/models/Book.js');
    expect(Book.findByIdAndUpdate).toHaveBeenCalledWith('anyId', {
      $set: { isAdmin: true, bookName: 'Updated' },
    });
  });

  test('PUT /updatebook/:id - non‑admin forbidden', async () => {
    const res = await request(app)
      .put('/updatebook/anyId')
      .send({ isAdmin: false });
    expect(res.status).toBe(403);
    expect(res.body).toBe('You dont have permission to delete a book!');
  });

  test('DELETE /removebook/:id - admin success', async () => {
    const { default: Book } = await import('../dataset/external/iampranavdhar__Library-Management-System-MERN/backend/models/Book.js');
    const removeMock = jest.fn().mockResolvedValue();
    Book.findOne.mockResolvedValue({ _id: 'bookId', categories: ['catId'], remove: removeMock });
    const res = await request(app).delete('/removebook/bookId').send({ isAdmin: true });
    expect(res.status).toBe(200);
    expect(res.body).toBe('Book has been deleted');
    expect(removeMock).toHaveBeenCalled();
    const { default: BookCategory } = await import('../dataset/external/iampranavdhar__Library-Management-System-MERN/backend/models/BookCategory.js');
    expect(BookCategory.updateMany).toHaveBeenCalledWith(
      { _id: ['catId'] },
      { $pull: { books: 'bookId' } }
    );
  });

  test('DELETE /removebook/:id - non‑admin forbidden', async () => {
    const res = await request(app).delete('/removebook/bookId').send({ isAdmin: false });
    expect(res.status).toBe(403);
    expect(res.body).toBe('You dont have permission to delete a book!');
  });
});