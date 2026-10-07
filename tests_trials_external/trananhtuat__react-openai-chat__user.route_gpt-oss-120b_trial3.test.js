import { jest } from '@jest/globals';
import express from "express";
import request from "supertest";

// Mock the controller functions
jest.mock("../controllers/user.controller.js", () => ({
  userRegister: jest.fn((req, res) => res.status(201).json({ message: "registered" })),
  userSignIn: jest.fn((req, res) => res.status(200).json({ token: "dummy-token" })),
}));

// Mock the token authentication middleware
jest.mock("../middlewares/token.middleware.js", () => ({
  tokenAuth: jest.fn((req, res, next) => {
    // simulate a decoded token
    req.user = { username: "mockedUser" };
    next();
  }),
}));

// Provide a realistic implementation of the validator middleware
jest.mock("../utils/validator.js", () => ({
  validate: (req, res, next) => {
    const { validationResult } = require("express-validator");
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
      return res.status(400).json({ errors: errors.array() });
    }
    next();
  },
}));

// Import the router **after** the mocks are set up
import router from '../dataset/external/trananhtuat__react-openai-chat/server/routes/user.route.js';

const app = express();
app.use(express.json());
app.use(router);

describe("User routes", () => {
  describe("POST /signup", () => {
    it("should call userRegister and return 201 for valid data", async () => {
      const response = await request(app)
        .post("/signup")
        .send({ username: "validUser", password: "validPass123" });

      expect(response.status).toBe(201);
      expect(response.body).toEqual({ message: "registered" });
      const { userRegister } = await import("../controllers/user.controller.js");
      expect(userRegister).toHaveBeenCalled();
    });

    it("should return 400 when username is missing", async () => {
      const response = await request(app)
        .post("/signup")
        .send({ password: "validPass123" });

      expect(response.status).toBe(400);
      expect(response.body.errors).toEqual(
        expect.arrayContaining([
          expect.objectContaining({ msg: "username is required", param: "username" }),
        ])
      );
    });

    it("should return 400 when password is too short", async () => {
      const response = await request(app)
        .post("/signup")
        .send({ username: "validUser", password: "short" });

      expect(response.status).toBe(400);
      expect(response.body.errors).toEqual(
        expect.arrayContaining([
          expect.objectContaining({ msg: "password must have at least 8 characters", param: "password" }),
        ])
      );
    });
  });

  describe("POST /signin", () => {
    it("should call userSignIn and return 200 for valid credentials", async () => {
      const response = await request(app)
        .post("/signin")
        .send({ username: "validUser", password: "validPass123" });

      expect(response.status).toBe(200);
      expect(response.body).toEqual({ token: "dummy-token" });
      const { userSignIn } = await import("../controllers/user.controller.js");
      expect(userSignIn).toHaveBeenCalled();
    });

    it("should return 400 when username is too short", async () => {
      const response = await request(app)
        .post("/signin")
        .send({ username: "usr", password: "validPass123" });

      expect(response.status).toBe(400);
      expect(response.body.errors).toEqual(
        expect.arrayContaining([
          expect.objectContaining({ msg: "username must have at least 6 characters", param: "username" }),
        ])
      );
    });
  });

  describe("GET /check-token", () => {
    it("should pass tokenAuth middleware and return the username", async () => {
      const response = await request(app).get("/check-token");
      expect(response.status).toBe(200);
      expect(response.body).toEqual({ username: "mockedUser" });

      const { tokenAuth } = await import("../middlewares/token.middleware.js");
      expect(tokenAuth).toHaveBeenCalled();
    });
  });
});