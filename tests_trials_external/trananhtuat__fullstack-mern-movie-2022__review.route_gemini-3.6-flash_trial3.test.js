import { jest } from '@jest/globals';
import express from 'express';
import request from 'supertest';

jest.mock('../dataset/external/trananhtuat__fullstack-mern-movie-2022/server/src/controllers/review.controller.js', () => ({
  __esModule: true,
  default: {
    getReviewsOfUser: jest.fn((req, res) => res.status(200).json({ status: 'getReviews' })),
    create: jest.fn((req, res) => res.status(201).json({ status: 'created' })),
    remove: jest.fn((req, res) => res.status(200).json({ status: 'removed' }))
  }
}));

jest.mock('../dataset/external/trananhtuat__fullstack-mern-movie-2022/server/src/middlewares/token.middleware.js', () => ({
  __esModule: true,
  default: {
    auth: jest.fn((req, res, next) => next())
  }
}));

jest.mock('../dataset/external/trananhtuat__fullstack-mern-movie-2022/server/src/handlers/request.handler.js', () => {
  const { validationResult } = jest.requireActual('express-validator');
  return {
    __esModule: true,
    default: {
      validate: jest.fn((req, res, next) => {
        const errors = validationResult(req);
        if (!errors.isEmpty()) {
          return res.status(400).json({ errors: errors.array() });
        }
        next();
      })
    }
  };
});

import reviewController from '../dataset/external/trananhtuat__fullstack-mern-movie-2022/server/src/controllers/review.controller.js';
import tokenMiddleware from '../dataset/external/trananhtuat__fullstack-mern-movie-2022/server/src/middlewares/token.middleware.js';
import requestHandler from '../dataset/external/trananhtuat__fullstack-mern-movie-2022/server/src/handlers/request.handler.js';
import router from '../dataset/external/trananhtuat__fullstack-mern-movie-2022/server/src/routes/review.route.js';

const app = express();
app.use(express.json());
app.use('/', router);

describe('Review Route', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  describe('GET /', () => {
    it('should call tokenMiddleware.auth and reviewController.getReviewsOfUser', async () => {
      const response = await request(app).get('/');

      expect(response.status).toBe(200);
      expect(response.body).toEqual({ status: 'getReviews' });
      expect(tokenMiddleware.auth).toHaveBeenCalled();
      expect(reviewController.getReviewsOfUser).toHaveBeenCalled();
    });
  });

  describe('POST /', () => {
    const validBody = {
      mediaId: '12345',
      content: 'Great movie!',
      mediaType: 'movie',
      mediaTitle: 'Inception',
      mediaPoster: 'poster_path.jpg'
    };

    it('should create review successfully when valid data is provided', async () => {
      const response = await request(app)
        .post('/')
        .send(validBody);

      expect(response.status).toBe(201);
      expect(response.body).toEqual({ status: 'created' });
      expect(tokenMiddleware.auth).toHaveBeenCalled();
      expect(requestHandler.validate).toHaveBeenCalled();
      expect(reviewController.create).toHaveBeenCalled();
    });

    it('should accept "tv" as a valid mediaType', async () => {
      const response = await request(app)
        .post('/')
        .send({ ...validBody, mediaType: 'tv' });

      expect(response.status).toBe(201);
      expect(reviewController.create).toHaveBeenCalled();
    });

    it('should fail validation when body fields are missing', async () => {
      const response = await request(app)
        .post('/')
        .send({});

      expect(response.status).toBe(400);
      expect(response.body.errors).toBeDefined();
      expect(response.body.errors.length).toBeGreaterThan(0);
      expect(reviewController.create).not.toHaveBeenCalled();
    });

    it('should fail validation when mediaType is invalid', async () => {
      const response = await request(app)
        .post('/')
        .send({ ...validBody, mediaType: 'invalid_type' });

      expect(response.status).toBe(400);
      expect(response.body.errors).toEqual(
        expect.arrayContaining([
          expect.objectContaining({ msg: 'mediaType invalid' })
        ])
      );
      expect(reviewController.create).not.toHaveBeenCalled();
    });

    it('should fail validation when mediaId or content is empty', async () => {
      const response = await request(app)
        .post('/')
        .send({ ...validBody, mediaId: '', content: '' });

      expect(response.status).toBe(400);
      expect(response.body.errors).toEqual(
        expect.arrayContaining([
          expect.objectContaining({ msg: 'mediaId can not be empty' }),
          expect.objectContaining({ msg: 'content can not be empty' })
        ])
      );
      expect(reviewController.create).not.toHaveBeenCalled();
    });
  });

  describe('DELETE /:reviewId', () => {
    it('should call tokenMiddleware.auth and reviewController.remove', async () => {
      const response = await request(app).delete('/review123');

      expect(response.status).toBe(200);
      expect(response.body).toEqual({ status: 'removed' });
      expect(tokenMiddleware.auth).toHaveBeenCalled();
      expect(reviewController.remove).toHaveBeenCalled();
    });
  });
});