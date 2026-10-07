import request from 'supertest';
import express from 'express';
import { jest } from '@jest/globals';

// Mock Book model
jest.mock('../dataset/external/iampranavdhar__Library-Management-System-MERN/backend/models/Book.js', () => {
  return jest.fn().mockImplementation(() => ({
    updateOne: jest.fn().mockResolvedValue(undefined),
  }));
});
import Book from '../dataset/external/iampranavdhar__Library-Management-System-MERN/backend/models/Book.js';

// Mock BookTransaction model
jest.mock('../dataset/external/iampranavdhar__Library-Management-System-MERN/backend/models/BookTransaction.js', () => {
  const saveMock = jest.fn().mockResolvedValue({ _id: 'txn123', bookId: 'book123' });
  const findMock = jest.fn().mockResolvedValue({
    sort: jest.fn().mockResolvedValue([{ _id: 'txn1' }, { _id: 'txn2' }]),
  });
  const findByIdAndUpdateMock = jest.fn().mockResolvedValue(undefined);
  const findByIdAndDeleteMock = jest.fn().mockResolvedValue({ bookId: 'book123' });

  const MockedClass = jest.fn().mockImplementation(() => ({
    save: saveMock,
  }));

  MockedClass.find = findMock;
  MockedClass.findByIdAndUpdate = findByIdAndUpdateMock;
  MockedClass.findByIdAndDelete = findByIdAndDeleteMock;

  return MockedClass;
});
import BookTransaction from '../dataset/external/iampranavdhar__Library-Management-System-MERN/backend/models/BookTransaction.js';

// Import the router AFTER mocking the models
import router from '../dataset/external/iampranavdhar__Library-Management-System-MERN/backend/routes/transactions.js';

// Setup Express app for testing
const app = express();
app.use(express.json());
app.use('/', router);

describe('Transactions Router', () => {
  afterEach(() => {
    jest.clearAllMocks();
  });

  describe('POST /add-transaction', () => {
    test('should add transaction when isAdmin is true', async () => {
      const res = await request(app)
        .post('/add-transaction')
        .send({
          isAdmin: true,
          bookId: 'book123',
          borrowerId: 'user456',
          bookName: 'Test Book',
          borrowerName: 'John Doe',
          transactionType: 'borrow',
          fromDate: '2023-01-01',
          toDate: '2023-01-10',
        });

      expect(res.status).toBe(200);
      expect(res.body).toHaveProperty('_id', 'txn123');

      // verify that BookTransaction was instantiated and saved
      expect(BookTransaction).toHaveBeenCalledWith({
        bookId: 'book123',
        borrowerId: 'user456',
        bookName: 'Test Book',
        borrowerName: 'John Doe',
        transactionType: 'borrow',
        fromDate: '2023-01-01',
        toDate: '2023-01-10',
      });
      const instance = BookTransaction.mock.results[0].value;
      expect(instance.save).toHaveBeenCalled();

      // verify book update
      expect(Book.findById).toHaveBeenCalledWith('book123');
      const bookInstance = Book.mock.results[0].value;
      expect(bookInstance.updateOne).toHaveBeenCalledWith({
        $push: { transactions: 'txn123' },
      });
    });

    test('should reject when isAdmin is false', async () => {
      const res = await request(app)
        .post('/add-transaction')
        .send({ isAdmin: false });

      expect(res.status).toBe(500);
      expect(res.body).toBe('You are not allowed to add a Transaction');
    });

    test('should handle internal errors with status 504', async () => {
      // Force save to reject
      const saveMock = jest.fn().mockRejectedValue(new Error('DB error'));
      BookTransaction.mockImplementation(() => ({ save: saveMock }));

      const res = await request(app)
        .post('/add-transaction')
        .send({ isAdmin: true, bookId: 'book123' });

      expect(res.status).toBe(504);
      expect(res.body).toMatchObject({ message: 'DB error' });
    });
  });

  describe('GET /all-transactions', () => {
    test('should return all transactions sorted descending', async () => {
      const res = await request(app).get('/all-transactions');

      expect(res.status).toBe(200);
      expect(Array.isArray(res.body)).toBe(true);
      expect(res.body).toEqual([{ _id: 'txn1' }, { _id: 'txn2' }]);

      expect(BookTransaction.find).toHaveBeenCalledWith({});
      const findResult = await BookTransaction.find.mock.results[0].value;
      expect(findResult.sort).toHaveBeenCalledWith({ _id: -1 });
    });

    test('should return 504 on error', async () => {
      const findMock = jest.fn().mockRejectedValue(new Error('find error'));
      BookTransaction.find = findMock;

      const res = await request(app).get('/all-transactions');

      expect(res.status).toBe(504);
      expect(res.body).toMatchObject({ message: 'find error' });
    });
  });

  describe('PUT /update-transaction/:id', () => {
    test('should update transaction when isAdmin true', async () => {
      const res = await request(app)
        .put('/update-transaction/txn123')
        .send({ isAdmin: true, transactionType: 'return' });

      expect(res.status).toBe(200);
      expect(res.body).toBe('Transaction details updated successfully');
      expect(BookTransaction.findByIdAndUpdate).toHaveBeenCalledWith('txn123', {
        $set: { isAdmin: true, transactionType: 'return' },
      });
    });

    test('should return 504 on update error', async () => {
      const updateMock = jest.fn().mockRejectedValue(new Error('update fail'));
      BookTransaction.findByIdAndUpdate = updateMock;

      const res = await request(app)
        .put('/update-transaction/txn123')
        .send({ isAdmin: true });

      expect(res.status).toBe(504);
      expect(res.body).toMatchObject({ message: 'update fail' });
    });
  });

  describe('DELETE /remove-transaction/:id', () => {
    test('should delete transaction when isAdmin true', async () => {
      const res = await request(app)
        .delete('/remove-transaction/txn123')
        .send({ isAdmin: true });

      expect(res.status).toBe(200);
      expect(res.body).toBe('Transaction deleted successfully');

      expect(BookTransaction.findByIdAndDelete).toHaveBeenCalledWith('txn123');
      expect(Book.findById).toHaveBeenCalledWith('book123');
      const bookInst = Book.mock.results[0].value;
      expect(bookInst.updateOne).toHaveBeenCalledWith({
        $pull: { transactions: 'txn123' },
      });
    });

    test('should reject when isAdmin false', async () => {
      const res = await request(app)
        .delete('/remove-transaction/txn123')
        .send({ isAdmin: false });

      expect(res.status).toBe(403);
      expect(res.body).toBe('You dont have permission to delete a book!');
    });

    test('should return 504 on delete error', async () => {
      const deleteMock = jest.fn().mockRejectedValue(new Error('delete err'));
      BookTransaction.findByIdAndDelete = deleteMock;

      const res = await request(app)
        .delete('/remove-transaction/txn123')
        .send({ isAdmin: true });

      expect(res.status).toBe(504);
      expect(res.body).toMatchObject({ message: 'delete err' });
    });
  });
});