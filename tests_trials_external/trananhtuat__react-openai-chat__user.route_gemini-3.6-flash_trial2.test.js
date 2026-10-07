import { jest } from '@jest/globals';
import express from 'express';
import request from 'supertest';

jest.mock('../controllers/user.controller.js', () => ({
  userRegister: jest.fn((req, res) => res.status(201).json({ status: 'registered' })),
  userSignIn: jest.fn((req, res) => res.status(200).json({ status: 'signed_in' }))
}));

jest.mock('../middlewares/token.middleware.js', () => ({
  tokenAuth: jest.fn((req, res, next) => {
    if (req.headers.authorization === 'Bearer valid-token') {
      req.user = { username: 'testuser' };
      return next();
    }
    return res.status(401).json({ message: 'Unauthorized' });
  })
}));

jest.mock('../utils/validator.js', () => ({
  validate: jest.fn((req, res, next) => next())
}));

import router from '../dataset/external/trananhtuat__react-openai-chat/server/routes/user.route.js';

describe('User Router Unit Tests', () => {
  let app;

  beforeEach(() => {
    app = express();
    app.use(express.json());
    app.use('/', router);
  });

  describe('POST /signup', () => {
    it('should process user registration successfully', async () => {
      const res = await request(app)
        .post('/signup')
        .send({ username: 'validuser', password: 'password123' });

      expect(res.status).toBe(201);
      expect(res.body).toEqual({ status: 'registered' });
    });
  });

  describe('POST /signin', () => {
    it('should process user signin successfully', async () => {
      const res = await request(app)
        .post('/signin')
        .send({ username: 'validuser', password: 'password123' });

      expect(res.status).toBe(200);
      expect(res.body).toEqual({ status: 'signed_in' });
    });
  });

  describe('GET /check-token', () => {
    it('should return 200 and username when token is valid', async () => {
      const res = await request(app)
        .get('/check-token')
        .set('Authorization', 'Bearer valid-token');

      expect(res.status).toBe(200);
      expect(res.body).toEqual({ username: 'testuser' });
    });

    it('should return 401 when token auth fails', async () => {
      const res = await request(app)
        .get('/check-token')
        .set('Authorization', 'Bearer invalid-token');

      expect(res.status).toBe(401);
      expect(res.body).toEqual({ message: 'Unauthorized' });
    });
  });

  describe('Route Definitions', () => {
    it('should configure all expected endpoints and HTTP methods', () => {
      const registeredRoutes = router.stack.map((layer) => ({
        path: layer.route.path,
        methods: Object.keys(layer.route.methods)
      }));

      expect(registeredRoutes).toEqual(
        expect.arrayContaining([
          { path: '/signup', methods: ['post'] },
          { path: '/signin', methods: ['post'] },
          { path: '/check-token', methods: ['get'] }
        ])
      );
    });
  });
});