import { jest } from '@jest/globals';
import express from 'express';
import request from 'supertest';

const mockBookUpdateOne = jest.fn();
const mockBookFindById = jest.fn();

const mockSave = jest.fn();
const mockBookTransactionConstructor = jest.fn();

const mockSort = jest.fn();
const mockFind = jest.fn();
const mockFindByIdAndUpdate = jest.fn();
const mockFindByIdAndDelete = jest.fn();

jest.unstable_mockModule(
  '../dataset/external/iampranavdhar__Library-Management-System-MERN/backend/models/Book.js',
  () => ({
    default: {
      findById: mockBookFindById,
    },
  })
);

jest.unstable_mockModule(
  '../dataset/external/iampranavdhar__Library-Management-System-MERN/backend/models/BookTransaction.js',
  () => {
    class MockBookTransaction {
      constructor(data) {
        Object.assign(this, data);
        this._id = 'tx123';
        this.save = mockSave;
        mockBookTransactionConstructor(data);
      }
      static find = mockFind;
      static findByIdAndUpdate = mockFindByIdAndUpdate;
      static findByIdAndDelete = mockFindByIdAndDelete;
    }
    return { default: MockBookTransaction };
  }
);

const { default: router } = await import(
  '../dataset/external/iampranavdhar__Library-Management-System-MERN/backend/routes/transactions.js'
);

const app = express();
app.use(express.json());
app.use('/', router);

describe('Transactions Router', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  describe('POST /add-transaction', () => {
    it('should add a transaction when user is admin', async () => {
      const transactionData = {
        isAdmin: true,
        bookId: 'book123',
        borrowerId: 'user123',
        bookName: 'Test Book',
        borrowerName: 'Test User',
        transactionType: 'Issued',
        fromDate: '2023-01-01',
        toDate: '2023-01-15',
      };

      const savedTx = { _id: 'tx123', ...transactionData };
      mockSave.mockResolvedValue(savedTx);
      mockBookFindById.mockReturnValue({ updateOne: mockBookUpdateOne });
      mockBookUpdateOne.mockResolvedValue({});

      const response = await request(app)
        .post('/add-transaction')
        .send(transactionData);

      expect(response.status).toBe(200);
      expect(response.body).toEqual(savedTx);
      expect(mockBookFindById).toHaveBeenCalledWith('book123');
      expect(mockBookUpdateOne).toHaveBeenCalledWith({
        $push: { transactions: 'tx123' },
      });
    });

    it('should return 500 if user is not admin', async () => {
      const response = await request(app)
        .post('/add-transaction')
        .send({ isAdmin: false });

      expect(response.status).toBe(500);
      expect(response.body).toBe('You are not allowed to add a Transaction');
    });

    it('should return 504 on internal error', async () => {
      mockSave.mockRejectedValue(new Error('Save failed'));

      const response = await request(app)
        .post('/add-transaction')
        .send({ isAdmin: true, bookId: 'book123' });

      expect(response.status).toBe(504);
    });
  });

  describe('GET /all-transactions', () => {
    it('should return all transactions sorted', async () => {
      const mockTransactions = [{ _id: 'tx1' }, { _id: 'tx2' }];
      mockFind.mockReturnValue({ sort: mockSort });
      mockSort.mockResolvedValue(mockTransactions);

      const response = await request(app).get('/all-transactions');

      expect(response.status).toBe(200);
      expect(response.body).toEqual(mockTransactions);
      expect(mockFind).toHaveBeenCalledWith({});
      expect(mockSort).toHaveBeenCalledWith({ _id: -1 });
    });

    it('should return 504 if fetching transactions fails', async () => {
      mockFind.mockReturnValue({
        sort: jest.fn().mockRejectedValue(new Error('DB Error')),
      });

      const response = await request(app).get('/all-transactions');

      expect(response.status).toBe(504);
    });
  });

  describe('PUT /update-transaction/:id', () => {
    it('should update transaction if user is admin', async () => {
      mockFindByIdAndUpdate.mockResolvedValue({});

      const response = await request(app)
        .put('/update-transaction/tx123')
        .send({ isAdmin: true, transactionType: 'Returned' });

      expect(response.status).toBe(200);
      expect(response.body).toBe('Transaction details updated successfully');
      expect(mockFindByIdAndUpdate).toHaveBeenCalledWith('tx123', {
        $set: { isAdmin: true, transactionType: 'Returned' },
      });
    });

    it('should return 504 when update fails', async () => {
      mockFindByIdAndUpdate.mockRejectedValue(new Error('Update failed'));

      const response = await request(app)
        .put('/update-transaction/tx123')
        .send({ isAdmin: true });

      expect(response.status).toBe(504);
    });
  });

  describe('DELETE /remove-transaction/:id', () => {
    it('should remove transaction and update book if user is admin', async () => {
      mockFindByIdAndDelete.mockResolvedValue({
        _id: 'tx123',
        bookId: 'book123',
      });
      mockBookFindById.mockReturnValue({ updateOne: mockBookUpdateOne });
      mockBookUpdateOne.mockResolvedValue({});

      const response = await request(app)
        .delete('/remove-transaction/tx123')
        .send({ isAdmin: true });

      expect(response.status).toBe(200);
      expect(response.body).toBe('Transaction deleted successfully');
      expect(mockFindByIdAndDelete).toHaveBeenCalledWith('tx123');
      expect(mockBookFindById).toHaveBeenCalledWith('book123');
      expect(mockBookUpdateOne).toHaveBeenCalledWith({
        $pull: { transactions: 'tx123' },
      });
    });

    it('should return 403 if user is not admin', async () => {
      const response = await request(app)
        .delete('/remove-transaction/tx123')
        .send({ isAdmin: false });

      expect(response.status).toBe(403);
      expect(response.body).toBe('You dont have permission to delete a book!');
    });

    it('should return 504 on error during removal', async () => {
      mockFindByIdAndDelete.mockRejectedValue(new Error('Delete error'));

      const response = await request(app)
        .delete('/remove-transaction/tx123')
        .send({ isAdmin: true });

      expect(response.status).toBe(504);
    });
  });
});