import router from '../dataset/external/trananhtuat__react-openai-chat/server/routes/user.route.js';
import express from 'express';
import { jest } from '@jest/globals';

// Mock dependencies used by the router
jest.mock('../dataset/external/trananhtuat__react-openai-chat/server/controllers/user.controller.js', () => ({
  userRegister: jest.fn(),
  userSignIn: jest.fn(),
}));
jest.mock('../dataset/external/trananhtuat__react-openai-chat/server/middlewares/token.middleware.js', () => ({
  tokenAuth: jest.fn((req, res, next) => next()),
}));
jest.mock('../dataset/external/trananhtuat__react-openai-chat/server/utils/validator.js', () => ({
  validate: jest.fn((req, res, next) => next()),
}));

describe('user.route router configuration', () => {
  const getRoutes = () =>
    router.stack
      .filter((layer) => layer.route) // only actual routes
      .map((layer) => ({
        path: layer.route.path,
        methods: Object.keys(layer.route.methods).filter((m) => layer.route.methods[m]),
        middlewares: layer.route.stack.map((s) => s.name || 'anonymous'),
      }));

  test('should define three routes', () => {
    const routes = getRoutes();
    const paths = routes.map((r) => r.path).sort();
    expect(paths).toEqual(['/check-token', '/signin', '/signup']);
  });

  test('POST /signup should have correct middlewares sequence', () => {
    const route = getRoutes().find((r) => r.path === '/signup' && r.methods.includes('post'));
    // Expected: body validator for username, body validator for password, validate, userRegister
    expect(route.middlewares).toHaveLength(4);
    // The last middleware must be the mocked controller
    expect(route.middlewares[3]).toBe('userRegister');
  });

  test('POST /signin should have correct middlewares sequence', () => {
    const route = getRoutes().find((r) => r.path === '/signin' && r.methods.includes('post'));
    // Expected: body validator for username, body validator for password, validate, userSignIn
    expect(route.middlewares).toHaveLength(4);
    expect(route.middlewares[3]).toBe('userSignIn');
  });

  test('GET /check-token should have tokenAuth and inline handler', () => {
    const route = getRoutes().find((r) => r.path === '/check-token' && r.methods.includes('get'));
    // tokenAuth mock name is 'tokenAuth', handler is anonymous (no name)
    expect(route.middlewares).toHaveLength(2);
    expect(route.middlewares[0]).toBe('tokenAuth');
    // The second middleware is the route handler defined inline, it will be anonymous
    expect(route.middlewares[1]).toBe('anonymous');
  });
});