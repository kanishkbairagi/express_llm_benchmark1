import { jest } from '@jest/globals';
import express from 'express';
import request from 'supertest';

jest.unstable_mockModule('../models/Book.js', () => {
  const BookMock = jest.fn().mockImplementation((data) => {
    return {
      ...data,
      _id: 'mockBookId',
      categories: data?.categories || ['cat1'],
      save: jest.fn().mockResolvedValue({
        _id: 'mockBookId',
        ...data,
      }),
    };
  });
  BookMock.find = jest.fn();
  BookMock.findById = jest.fn();
  BookMock.findOne = jest.fn();
  BookMock.findByIdAndUpdate = jest.fn();
  return {
    default: BookMock,
  };
});

jest.unstable_mockModule('../models/BookCategory.js', () => {
  return {
    default: {
      findOne: jest.fn(),
      updateMany: jest.fn(),
    },
  };
});

const Book = (await import('../models/Book.js')).default;
const BookCategory = (await import('../models/BookCategory.js')).default;
const booksRouter = (await import('../dataset/external/iampranavdhar__Library-Management-System-MERN/backend/routes/books.js')).default;

const app = express();
app.use(express.json());
app.use('/books', booksRouter);

describe('Books Router Unit Tests', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  describe('GET /books/allbooks', () => {
    test('should fetch all books successfully', async () => {
      const mockBooks = [{ _id: '1', bookName: 'Book One' }];
      Book.find.mockReturnValue({
        populate: jest.fn().mockReturnValue({
          sort: jest.fn().mockResolvedValue(mockBooks),
        }),
      });

      const res = await request(app).get('/books/allbooks');

      expect(res.status).toBe(200);
      expect(res.body).toEqual(mockBooks);
      expect(Book.find).toHaveBeenCalledWith({});
    });

    test('should return 504 if fetching all books fails', async () => {
      Book.find.mockReturnValue({
        populate: jest.fn().mockReturnValue({
          sort: jest.fn().mockRejectedValue(new Error('Database error')),
        }),
      });

      const res = await request(app).get('/books/allbooks');

      expect(res.status).toBe(504);
    });
  });

  describe('GET /books/getbook/:id', () => {
    test('should fetch book by ID successfully', async () => {
      const mockBook = { _id: '123', bookName: 'Specific Book' };
      Book.findById.mockReturnValue({
        populate: jest.fn().mockResolvedValue(mockBook),
      });

      const res = await request(app).get('/books/getbook/123');

      expect(res.status).toBe(200);
      expect(res.body).toEqual(mockBook);
      expect(Book.findById).toHaveBeenCalledWith('123');
    });

    test('should return 500 when fetching book by ID encounters error', async () => {
      Book.findById.mockReturnValue({
        populate: jest.fn().mockRejectedValue(new Error('Fetch error')),
      });

      const res = await request(app).get('/books/getbook/123');

      expect(res.status).toBe(500);
    });
  });

  describe('GET /books/', () => {
    test('should fetch books by category name successfully', async () => {
      const mockCategory = { _id: 'cat1', categoryName: 'Sci-Fi', books: [] };
      BookCategory.findOne.mockReturnValue({
        populate: jest.fn().mockResolvedValue(mockCategory),
      });

      const res = await request(app).get('/books/?category=Sci-Fi');

      expect(res.status).toBe(200);
      expect(res.body).toEqual(mockCategory);
      expect(BookCategory.findOne).toHaveBeenCalledWith({ categoryName: 'Sci-Fi' });
    });

    test('should return 504 when fetching by category fails', async () => {
      BookCategory.findOne.mockReturnValue({
        populate: jest.fn().mockRejectedValue(new Error('Category search failed')),
      });

      const res = await request(app).get('/books/?category=Sci-Fi');

      expect(res.status).toBe(504);
    });
  });

  describe('POST /books/addbook', () => {
    test('should return 403 if user is not admin', async () => {
      const res = await request(app).post('/books/addbook').send({
        isAdmin: false,
        bookName: 'New Book',
      });

      expect(res.status).toBe(403);
      expect(res.body).toBe('You dont have permission to delete a book!');
    });

    test('should add book successfully when user is admin', async () => {
      BookCategory.updateMany.mockResolvedValue({});

      const bookData = {
        isAdmin: true,
        bookName: 'Test Book',
        alternateTitle: 'Alt Title',
        author: 'Author',
        bookCountAvailable: 5,
        language: 'English',
        publisher: 'Publisher',
        bookSatus: 'Available',
        categories: ['cat1'],
      };

      const res = await request(app).post('/books/addbook').send(bookData);

      expect(res.status).toBe(200);
      expect(res.body.bookName).toBe('Test Book');
      expect(BookCategory.updateMany).toHaveBeenCalledWith(
        { _id: 'cat1' },
        { $push: { books: 'mockBookId' } }
      );
    });

    test('should return 504 if saving book fails', async () => {
      Book.mockImplementationOnce(() => ({
        save: jest.fn().mockRejectedValue(new Error('Save error')),
      }));

      const res = await request(app).post('/books/addbook').send({
        isAdmin: true,
        bookName: 'Failing Book',
      });

      expect(res.status).toBe(504);
    });
  });

  describe('PUT /books/updatebook/:id', () => {
    test('should return 403 if user is not admin', async () => {
      const res = await request(app).put('/books/updatebook/123').send({
        isAdmin: false,
      });

      expect(res.status).toBe(403);
      expect(res.body).toBe('You dont have permission to delete a book!');
    });

    test('should update book successfully when user is admin', async () => {
      Book.findByIdAndUpdate.mockResolvedValue({});

      const res = await request(app).put('/books/updatebook/123').send({
        isAdmin: true,
        bookName: 'Updated Name',
      });

      expect(res.status).toBe(200);
      expect(res.body).toBe('Book details updated successfully');
      expect(Book.findByIdAndUpdate).toHaveBeenCalledWith('123', {
        $set: { isAdmin: true, bookName: 'Updated Name' },
      });
    });

    test('should return 504 if update fails', async () => {
      Book.findByIdAndUpdate.mockRejectedValue(new Error('Update error'));

      const res = await request(app).put('/books/updatebook/123').send({
        isAdmin: true,
      });

      expect(res.status).toBe(504);
    });
  });

  describe('DELETE /books/removebook/:id', () => {
    test('should return 403 if user is not admin', async () => {
      const res = await request(app).delete('/books/removebook/123').send({
        isAdmin: false,
      });

      expect(res.status).toBe(403);
      expect(res.body).toBe('You dont have permission to delete a book!');
    });

    test('should remove book successfully when user is admin', async () => {
      const mockRemove = jest.fn().mockResolvedValue({});
      Book.findOne.mockResolvedValue({
        _id: '123',
        categories: ['cat1'],
        remove: mockRemove,
      });
      BookCategory.updateMany.mockResolvedValue({});

      const res = await request(app).delete('/books/removebook/123').send({
        isAdmin: true,
      });

      expect(res.status).toBe(200);
      expect(res.body).toBe('Book has been deleted');
      expect(Book.findOne).toHaveBeenCalledWith({ _id: '123' });
      expect(mockRemove).toHaveBeenCalled();
      expect(BookCategory.updateMany).toHaveBeenCalledWith(
        { _id: ['cat1'] },
        { $pull: { books: '123' } }
      );
    });

    test('should return 504 if delete process fails', async () => {
      Book.findOne.mockRejectedValue(new Error('Delete error'));

      const res = await request(app).delete('/books/removebook/123').send({
        isAdmin: true,
      });

      expect(res.status).toBe(504);
    });
  });
});