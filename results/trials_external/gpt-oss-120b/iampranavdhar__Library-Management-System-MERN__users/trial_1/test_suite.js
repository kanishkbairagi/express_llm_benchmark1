import { jest } from '@jest/globals';
import request from 'supertest';
import express from 'express';
import router from '../dataset/external/iampranavdhar__Library-Management-System-MERN/backend/routes/users.js';
import bcrypt from 'bcrypt';

// Mock the User model
jest.mock('../dataset/external/iampranavdhar__Library-Management-System-MERN/backend/models/User.js', () => {
  const mockUserDoc = {
    _doc: {
      _id: 'user123',
      username: 'john',
      email: 'john@example.com',
      password: 'hashedpwd',
      updatedAt: '2024-01-01T00:00:00.000Z',
      activeTransactions: [],
      prevTransactions: []
    }
  };
  const chainable = (doc) => ({
    populate: jest.fn().mockReturnThis(),
    exec: jest.fn().mockResolvedValue(doc),
    then: (cb) => Promise.resolve(doc).then(cb)
  });
  return {
    __esModule: true,
    default: {
      findById: jest.fn().mockImplementation(() => chainable(mockUserDoc)),
      find: jest.fn().mockImplementation(() => ({
        populate: jest.fn().mockReturnThis(),
        sort: jest.fn().mockResolvedValue([mockUserDoc])
      })),
      findByIdAndUpdate: jest.fn().mockResolvedValue({}),
      findByIdAndDelete: jest.fn().mockResolvedValue({}),
    }
  };
});

// Mock bcrypt for password hashing
jest.mock('bcrypt', () => ({
  __esModule: true,
  genSalt: jest.fn().mockResolvedValue('salt'),
  hash: jest.fn().mockResolvedValue('hashedpwd')
}));

const app = express();
app.use(express.json());
app.use(router);

describe('User routes', () => {
  test('GET /getuser/:id returns user without password and updatedAt', async () => {
    const res = await request(app).get('/getuser/user123');
    expect(res.status).toBe(200);
    expect(res.body).toEqual({
      _id: 'user123',
      username: 'john',
      email: 'john@example.com',
      activeTransactions: [],
      prevTransactions: []
    });
    const { default: User } = await import('../dataset/external/iampranavdhar__Library-Management-System-MERN/backend/models/User.js');
    expect(User.findById).toHaveBeenCalledWith('user123');
  });

  test('GET /allmembers returns array of users', async () => {
    const res = await request(app).get('/allmembers');
    expect(res.status).toBe(200);
    expect(Array.isArray(res.body)).toBe(true);
    expect(res.body[0]).toMatchObject({
      _id: 'user123',
      username: 'john',
      email: 'john@example.com'
    });
    const { default: User } = await import('../dataset/external/iampranavdhar__Library-Management-System-MERN/backend/models/User.js');
    expect(User.find).toHaveBeenCalledWith({});
  });

  test('PUT /updateuser/:id updates when authorized', async () => {
    const payload = {
      userId: 'user123',
      isAdmin: false,
      username: 'johnny',
      password: 'newpass'
    };
    const res = await request(app)
      .put('/updateuser/user123')
      .send(payload);
    expect(res.status).toBe(200);
    expect(res.body).toBe('Account has been updated');
    const { default: User } = await import('../dataset/external/iampranavdhar__Library-Management-System-MERN/backend/models/User.js');
    expect(User.findByIdAndUpdate).toHaveBeenCalledWith('user123', { $set: payload });
    expect(bcrypt.genSalt).toHaveBeenCalledWith(10);
    expect(bcrypt.hash).toHaveBeenCalledWith('newpass', 'salt');
  });

  test('PUT /:id/move-to-activetransactions adds transaction when admin', async () => {
    const payload = { isAdmin: true, userId: 'user123' };
    const res = await request(app)
      .put('/someTransactionId/move-to-activetransactions')
      .send(payload);
    expect(res.status).toBe(200);
    expect(res.body).toBe('Added to Active Transaction');
    const { default: User } = await import('../dataset/external/iampranavdhar__Library-Management-System-MERN/backend/models/User.js');
    const mockUserInstance = await User.findById(payload.userId);
    expect(mockUserInstance.updateOne).toHaveBeenCalledWith({ $push: { activeTransactions: 'someTransactionId' } });
  });

  test('PUT /:id/move-to-prevtransactions moves transaction when admin', async () => {
    const payload = { isAdmin: true, userId: 'user123' };
    const res = await request(app)
      .put('/someTransactionId/move-to-prevtransactions')
      .send(payload);
    expect(res.status).toBe(200);
    expect(res.body).toBe('Added to Prev transaction Transaction');
    const { default: User } = await import('../dataset/external/iampranavdhar__Library-Management-System-MERN/backend/models/User.js');
    const mockUserInstance = await User.findById(payload.userId);
    expect(mockUserInstance.updateOne).toHaveBeenNthCalledWith(1, { $pull: { activeTransactions: 'someTransactionId' } });
    expect(mockUserInstance.updateOne).toHaveBeenNthCalledWith(2, { $push: { prevTransactions: 'someTransactionId' } });
  });

  test('DELETE /deleteuser/:id deletes when authorized', async () => {
    const payload = { userId: 'user123', isAdmin: false };
    const res = await request(app)
      .delete('/deleteuser/user123')
      .send(payload);
    expect(res.status).toBe(200);
    expect(res.body).toBe('Account has been deleted');
    const { default: User } = await import('../dataset/external/iampranavdhar__Library-Management-System-MERN/backend/models/User.js');
    expect(User.findByIdAndDelete).toHaveBeenCalledWith('user123');
  });
});