import { jest } from '@jest/globals';
import request from 'supertest';
import express from 'express';

jest.mock('../models/Book.js', () => {
  const mockBook = jest.fn().mockImplementation(function (data) {
    Object.assign(this, data);
    this._id = 'mockBookId';
    this.categories = data?.categories || ['cat1'];
    this.save = jest.fn().mockResolvedValue(this);
  });
  mockBook.find = jest.fn();
  mockBook.findById = jest.fn();
  mockBook.findOne = jest.fn();
  mockBook.findByIdAndUpdate = jest.fn();
  return { __esModule: true, default: mockBook };
});

jest.mock('../models/BookCategory.js', () => ({
  __esModule: true,
  default: {
    findOne: jest.fn(),
    updateMany: jest.fn(),
  },
}));

import Book from '../models/Book.js';
import BookCategory from '../models/BookCategory.js';
import router from '../dataset/external/iampranavdhar__Library-Management-System-MERN/backend/routes/books.js';

const app = express();
app.use(express.json());
app.use('/', router);

describe('Books Router Unit Tests', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  describe('GET /allbooks', () => {
    it('should fetch all books successfully with 200 status', async () => {
      const mockBooks = [{ _id: '1', bookName: 'Book 1' }, { _id: '2', bookName: 'Book 2' }];
      const mockSort = jest.fn().mockResolvedValue(mockBooks);
      const mockPopulate = jest.fn().mockReturnValue({ sort: mockSort });
      Book.find.mockReturnValue({ populate: mockPopulate });

      const response = await request(app).get('/allbooks');

      expect(response.status).toBe(200);
      expect(response.body).toEqual(mockBooks);
      expect(Book.find).toHaveBeenCalledWith({});
      expect(mockPopulate).toHaveBeenCalledWith('transactions');
      expect(mockSort).toHaveBeenCalledWith({ _id: -1 });
    });

    it('should return status 504 on database error', async () => {
      const mockPopulate = jest.fn().mockReturnValue({
        sort: jest.fn().mockRejectedValue(new Error('Database error')),
      });
      Book.find.mockReturnValue({ populate: mockPopulate });

      const response = await request(app).get('/allbooks');

      expect(response.status).toBe(504);
    });
  });

  describe('GET /getbook/:id', () => {
    it('should fetch book by ID with 200 status', async () => {
      const mockBook = { _id: '123', bookName: 'Single Book' };
      Book.findById.mockReturnValue({
        populate: jest.fn().mockResolvedValue(mockBook),
      });

      const response = await request(app).get('/getbook/123');

      expect(response.status).toBe(200);
      expect(response.body).toEqual(mockBook);
      expect(Book.findById).toHaveBeenCalledWith('123');
    });

    it('should return status 500 when fetch fails', async () => {
      Book.findById.mockReturnValue({
        populate: jest.fn().mockRejectedValue(new Error('Error finding book')),
      });

      const response = await request(app).get('/getbook/invalid-id');

      expect(response.status).toBe(500);
    });
  });

  describe('GET / (by category)', () => {
    it('should fetch books by category name with 200 status', async () => {
      const mockCategoryData = { categoryName: 'Fiction', books: [{ bookName: 'Fiction Book' }] };
      BookCategory.findOne.mockReturnValue({
        populate: jest.fn().mockResolvedValue(mockCategoryData),
      });

      const response = await request(app).get('/?category=Fiction');

      expect(response.status).toBe(200);
      expect(response.body).toEqual(mockCategoryData);
      expect(BookCategory.findOne).toHaveBeenCalledWith({ categoryName: 'Fiction' });
    });

    it('should return status 504 on category fetch error', async () => {
      BookCategory.findOne.mockReturnValue({
        populate: jest.fn().mockRejectedValue(new Error('Error finding category')),
      });

      const response = await request(app).get('/?category=Fiction');

      expect(response.status).toBe(504);
    });
  });

  describe('POST /addbook', () => {
    it('should add a book successfully if user is admin', async () => {
      BookCategory.updateMany.mockResolvedValue({});

      const response = await request(app).post('/addbook').send({
        isAdmin: true,
        bookName: 'New Book',
        alternateTitle: 'Alt',
        author: 'Author Name',
        bookCountAvailable: 5,
        language: 'English',
        publisher: 'Publisher',
        bookSatus: 'Available',
        categories: ['cat1'],
      });

      expect(response.status).toBe(200);
      expect(response.body).toHaveProperty('_id', 'mockBookId');
      expect(response.body.bookName).toBe('New Book');
      expect(BookCategory.updateMany).toHaveBeenCalledWith(
        { _id: ['cat1'] },
        { $push: { books: 'mockBookId' } }
      );
    });

    it('should return 403 if user is not admin', async () => {
      const response = await request(app).post('/addbook').send({
        isAdmin: false,
        bookName: 'Unauthorized Book',
      });

      expect(response.status).toBe(403);
      expect(response.body).toBe('You dont have permission to delete a book!');
    });

    it('should return status 504 when adding book fails', async () => {
      BookCategory.updateMany.mockRejectedValue(new Error('Update failed'));

      const response = await request(app).post('/addbook').send({
        isAdmin: true,
        bookName: 'Fail Book',
        categories: ['cat1'],
      });

      expect(response.status).toBe(504);
    });
  });

  describe('PUT /updatebook/:id', () => {
    it('should update book details successfully if user is admin', async () => {
      Book.findByIdAndUpdate.mockResolvedValue({});

      const response = await request(app).put('/updatebook/123').send({
        isAdmin: true,
        bookName: 'Updated Name',
      });

      expect(response.status).toBe(200);
      expect(response.body).toBe('Book details updated successfully');
      expect(Book.findByIdAndUpdate).toHaveBeenCalledWith('123', {
        $set: { isAdmin: true, bookName: 'Updated Name' },
      });
    });

    it('should return 403 if user is not admin', async () => {
      const response = await request(app).put('/updatebook/123').send({
        isAdmin: false,
      });

      expect(response.status).toBe(403);
      expect(response.body).toBe('You dont have permission to delete a book!');
    });

    it('should return 504 on update error', async () => {
      Book.findByIdAndUpdate.mockRejectedValue(new Error('Update error'));

      const response = await request(app).put('/updatebook/123').send({
        isAdmin: true,
      });

      expect(response.status).toBe(504);
    });
  });

  describe('DELETE /removebook/:id', () => {
    it('should remove book successfully if user is admin', async () => {
      const mockBookInstance = {
        _id: '123',
        categories: ['cat1'],
        remove: jest.fn().mockResolvedValue(true),
      };
      Book.findOne.mockResolvedValue(mockBookInstance);
      BookCategory.updateMany.mockResolvedValue({});

      const response = await request(app).delete('/removebook/123').send({
        isAdmin: true,
      });

      expect(response.status).toBe(200);
      expect(response.body).toBe('Book has been deleted');
      expect(Book.findOne).toHaveBeenCalledWith({ _id: '123' });
      expect(mockBookInstance.remove).toHaveBeenCalled();
      expect(BookCategory.updateMany).toHaveBeenCalledWith(
        { _id: ['cat1'] },
        { $pull: { books: '123' } }
      );
    });

    it('should return 403 if user is not admin', async () => {
      const response = await request(app).delete('/removebook/123').send({
        isAdmin: false,
      });

      expect(response.status).toBe(403);
      expect(response.body).toBe('You dont have permission to delete a book!');
    });

    it('should return 504 if deletion process fails', async () => {
      Book.findOne.mockRejectedValue(new Error('Find error'));

      const response = await request(app).delete('/removebook/123').send({
        isAdmin: true,
      });

      expect(response.status).toBe(504);
    });
  });
});