import { jest } from '@jest/globals';
import express from 'express';
import request from 'supertest';

jest.unstable_mockModule('../controllers/user.controller.js', () => ({
  userRegister: jest.fn((req, res) => res.status(201).json({ status: 'success' })),
  userSignIn: jest.fn((req, res) => res.status(200).json({ token: 'mock-token' })),
}));

jest.unstable_mockModule('../middlewares/token.middleware.js', () => ({
  tokenAuth: jest.fn((req, res, next) => {
    if (req.headers.authorization === 'Bearer valid-token') {
      req.user = { username: 'validuser' };
      return next();
    }
    return res.status(401).json({ message: 'Unauthorized' });
  }),
}));

jest.unstable_mockModule('../utils/validator.js', () => ({
  validate: jest.fn((req, res, next) => next()),
}));

const { default: router } = await import(
  '../dataset/external/trananhtuat__react-openai-chat/server/routes/user.route.js'
);
const { userRegister, userSignIn } = await import('../controllers/user.controller.js');
const { tokenAuth } = await import('../middlewares/token.middleware.js');

describe('User Router', () => {
  let app;

  beforeEach(() => {
    app = express();
    app.use(express.json());
    app.use('/', router);
    jest.clearAllMocks();
  });

  describe('POST /signup', () => {
    it('should invoke userRegister controller when request is submitted', async () => {
      const response = await request(app)
        .post('/signup')
        .send({ username: 'validuser', password: 'validpassword' });

      expect(response.status).toBe(201);
      expect(response.body).toEqual({ status: 'success' });
      expect(userRegister).toHaveBeenCalled();
    });
  });

  describe('POST /signin', () => {
    it('should invoke userSignIn controller when request is submitted', async () => {
      const response = await request(app)
        .post('/signin')
        .send({ username: 'validuser', password: 'validpassword' });

      expect(response.status).toBe(200);
      expect(response.body).toEqual({ token: 'mock-token' });
      expect(userSignIn).toHaveBeenCalled();
    });
  });

  describe('GET /check-token', () => {
    it('should return 200 and the username when authenticated via tokenAuth', async () => {
      const response = await request(app)
        .get('/check-token')
        .set('Authorization', 'Bearer valid-token');

      expect(response.status).toBe(200);
      expect(response.body).toEqual({ username: 'validuser' });
      expect(tokenAuth).toHaveBeenCalled();
    });

    it('should return 401 when tokenAuth fails', async () => {
      const response = await request(app)
        .get('/check-token')
        .set('Authorization', 'Bearer invalid-token');

      expect(response.status).toBe(401);
      expect(response.body).toEqual({ message: 'Unauthorized' });
    });
  });
});