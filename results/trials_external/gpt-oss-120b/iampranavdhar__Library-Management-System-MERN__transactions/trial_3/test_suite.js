import { jest } from '@jest/globals';
import router from '../dataset/external/iampranavdhar__Library-Management-System-MERN/backend/routes/transactions.js';
import Book from '../dataset/external/iampranavdhar__Library-Management-System-MERN/backend/models/Book.js';
import BookTransaction from '../dataset/external/iampranavdhar__Library-Management-System-MERN/backend/models/BookTransaction.js';

jest.mock('../dataset/external/iampranavdhar__Library-Management-System-MERN/backend/models/Book.js');
jest.mock('../dataset/external/iampranavdhar__Library-Management-System-MERN/backend/models/BookTransaction.js');

describe('Transaction Routes', () => {
  const getHandler = (path, method) => {
    const layer = router.stack.find(
      (l) => l.route && l.route.path === path && l.route.methods[method]
    );
    return layer && layer.route.stack[0].handle;
  };

  const mockResponse = () => {
    const res = {};
    res.status = jest.fn().mockReturnValue(res);
    res.json = jest.fn().mockReturnValue(res);
    return res;
  };

  beforeEach(() => {
    jest.clearAllMocks();
  });

  describe('POST /add-transaction', () => {
    const handler = getHandler('/add-transaction', 'post');

    it('should add transaction when isAdmin true', async () => {
      const savedTransaction = { _id: 'txn123', bookId: 'book1' };
      const mockSave = jest.fn().mockResolvedValue(savedTransaction);
      const mockUpdateOne = jest.fn().mockResolvedValue();

      // Mock BookTransaction constructor
      BookTransaction.mockImplementation((data) => ({
        ...data,
        save: mockSave,
      }));
      // Mock Book.findById returning a book with updateOne
      Book.findById.mockReturnValue({
        updateOne: mockUpdateOne,
      });

      const req = {
        body: {
          isAdmin: true,
          bookId: 'book1',
          borrowerId: 'user1',
          bookName: 'Test Book',
          borrowerName: 'John Doe',
          transactionType: 'borrow',
          fromDate: '2023-01-01',
          toDate: '2023-01-10',
        },
      };
      const res = mockResponse();

      await handler(req, res);

      expect(BookTransaction).toHaveBeenCalledWith({
        bookId: 'book1',
        borrowerId: 'user1',
        bookName: 'Test Book',
        borrowerName: 'John Doe',
        transactionType: 'borrow',
        fromDate: '2023-01-01',
        toDate: '2023-01-10',
      });
      expect(mockSave).toHaveBeenCalled();
      expect(Book.findById).toHaveBeenCalledWith('book1');
      expect(mockUpdateOne).toHaveBeenCalledWith({ $push: { transactions: savedTransaction._id } });
      expect(res.status).toHaveBeenCalledWith(200);
      expect(res.json).toHaveBeenCalledWith(savedTransaction);
    });

    it('should reject when isAdmin false', async () => {
      const req = { body: { isAdmin: false } };
      const res = mockResponse();

      await handler(req, res);

      expect(res.status).toHaveBeenCalledWith(500);
      expect(res.json).toHaveBeenCalledWith('You are not allowed to add a Transaction');
    });

    it('should handle unexpected errors', async () => {
      const err = new Error('DB failure');
      BookTransaction.mockImplementation(() => ({
        save: jest.fn().mockRejectedValue(err),
      }));

      const req = { body: { isAdmin: true, bookId: 'b1' } };
      const res = mockResponse();

      await handler(req, res);

      expect(res.status).toHaveBeenCalledWith(504);
      expect(res.json).toHaveBeenCalledWith(err);
    });
  });

  describe('GET /all-transactions', () => {
    const handler = getHandler('/all-transactions', 'get');

    it('should return all transactions sorted descending', async () => {
      const mockTransactions = [{ _id: '1' }, { _id: '2' }];
      const mockSort = jest.fn().mockResolvedValue(mockTransactions);
      BookTransaction.find.mockReturnValue({ sort: mockSort });

      const req = {};
      const res = mockResponse();

      await handler(req, res);

      expect(BookTransaction.find).toHaveBeenCalledWith({});
      expect(mockSort).toHaveBeenCalledWith({ _id: -1 });
      expect(res.status).toHaveBeenCalledWith(200);
      expect(res.json).toHaveBeenCalledWith(mockTransactions);
    });

    it('should handle errors', async () => {
      const err = new Error('Find error');
      BookTransaction.find.mockImplementation(() => {
        throw err;
      });

      const req = {};
      const res = mockResponse();

      await handler(req, res);

      expect(res.status).toHaveBeenCalledWith(504);
      expect(res.json).toHaveBeenCalledWith(err);
    });
  });

  describe('PUT /update-transaction/:id', () => {
    const handler = getHandler('/update-transaction/:id', 'put');

    it('should update transaction when admin', async () => {
      const mockUpdate = jest.fn().mockResolvedValue();
      BookTransaction.findByIdAndUpdate.mockReturnValue(mockUpdate);

      const req = {
        params: { id: 'txn123' },
        body: { isAdmin: true, transactionType: 'return' },
      };
      const res = mockResponse();

      await handler(req, res);

      expect(BookTransaction.findByIdAndUpdate).toHaveBeenCalledWith('txn123', {
        $set: req.body,
      });
      expect(res.status).toHaveBeenCalledWith(200);
      expect(res.json).toHaveBeenCalledWith('Transaction details updated successfully');
    });

    it('should forward error to 504', async () => {
      const err = new Error('Update fail');
      BookTransaction.findByIdAndUpdate.mockRejectedValue(err);

      const req = {
        params: { id: 'txn123' },
        body: { isAdmin: true },
      };
      const res = mockResponse();

      await handler(req, res);

      expect(res.status).toHaveBeenCalledWith(504);
      expect(res.json).toHaveBeenCalledWith(err);
    });
  });

  describe('DELETE /remove-transaction/:id', () => {
    const handler = getHandler('/remove-transaction/:id', 'delete');

    it('should delete transaction and update book when admin', async () => {
      const deletedData = { bookId: 'book42' };
      const mockDelete = jest.fn().mockResolvedValue(deletedData);
      BookTransaction.findByIdAndDelete.mockReturnValue(mockDelete);

      const mockBookUpdate = jest.fn().mockResolvedValue();
      Book.findById.mockReturnValue({ updateOne: mockBookUpdate });

      const req = { params: { id: 'txn999' }, body: { isAdmin: true } };
      const res = mockResponse();

      await handler(req, res);

      expect(BookTransaction.findByIdAndDelete).toHaveBeenCalledWith('txn999');
      expect(Book.findById).toHaveBeenCalledWith('book42');
      expect(mockBookUpdate).toHaveBeenCalledWith({ $pull: { transactions: 'txn999' } });
      expect(res.status).toHaveBeenCalledWith(200);
      expect(res.json).toHaveBeenCalledWith('Transaction deleted successfully');
    });

    it('should forbid deletion when not admin', async () => {
      const req = { params: { id: 'any' }, body: { isAdmin: false } };
      const res = mockResponse();

      await handler(req, res);

      expect(res.status).toHaveBeenCalledWith(403);
      expect(res.json).toHaveBeenCalledWith('You dont have permission to delete a book!');
    });

    it('should handle errors during deletion', async () => {
      const err = new Error('Delete error');
      BookTransaction.findByIdAndDelete.mockRejectedValue(err);

      const req = { params: { id: 'txn' }, body: { isAdmin: true } };
      const res = mockResponse();

      await handler(req, res);

      expect(res.status).toHaveBeenCalledWith(504);
      expect(res.json).toHaveBeenCalledWith(err);
    });
  });
});