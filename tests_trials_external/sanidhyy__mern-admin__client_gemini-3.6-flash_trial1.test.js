import { jest } from "@jest/globals";

jest.mock("../models/Product.js");
jest.mock("../models/ProductStat.js");
jest.mock("../models/User.js");
jest.mock("../models/Transaction.js");
jest.mock("country-iso-2-to-3");

import Product from "../models/Product.js";
import ProductStat from "../models/ProductStat.js";
import User from "../models/User.js";
import Transaction from "../models/Transaction.js";
import getCountryISO3 from "country-iso-2-to-3";

import {
  getProducts,
  getCustomers,
  getTransactions,
  getGeography,
} from '../dataset/external/sanidhyy__mern-admin/server/controllers/client.js';

describe("Client Controller Unit Tests", () => {
  let req;
  let res;

  beforeEach(() => {
    jest.clearAllMocks();

    req = {
      query: {},
    };

    res = {
      status: jest.fn().mockReturnThis(),
      json: jest.fn().mockReturnThis(),
    };
  });

  describe("getProducts", () => {
    it("should fetch products with stats and return 200", async () => {
      const mockProducts = [
        { _id: "p1", name: "Product 1", _doc: { _id: "p1", name: "Product 1" } },
        { _id: "p2", name: "Product 2", _doc: { _id: "p2", name: "Product 2" } },
      ];
      const mockStatP1 = [{ productId: "p1", yearlySalesTotal: 1000 }];
      const mockStatP2 = [{ productId: "p2", yearlySalesTotal: 2000 }];

      Product.find.mockResolvedValue(mockProducts);
      ProductStat.find
        .mockResolvedValueOnce(mockStatP1)
        .mockResolvedValueOnce(mockStatP2);

      await getProducts(req, res);

      expect(Product.find).toHaveBeenCalled();
      expect(ProductStat.find).toHaveBeenCalledWith({ productId: "p1" });
      expect(ProductStat.find).toHaveBeenCalledWith({ productId: "p2" });
      expect(res.status).toHaveBeenCalledWith(200);
      expect(res.json).toHaveBeenCalledWith([
        { ...mockProducts[0]._doc, stat: mockStatP1 },
        { ...mockProducts[1]._doc, stat: mockStatP2 },
      ]);
    });

    it("should return 404 when Product.find fails", async () => {
      Product.find.mockRejectedValue(new Error("Database connection error"));

      await getProducts(req, res);

      expect(res.status).toHaveBeenCalledWith(404);
      expect(res.json).toHaveBeenCalledWith({
        message: "Database connection error",
      });
    });
  });

  describe("getCustomers", () => {
    it("should fetch users with role 'user' without password and return 200", async () => {
      const mockCustomers = [
        { _id: "u1", name: "User 1", role: "user" },
        { _id: "u2", name: "User 2", role: "user" },
      ];
      const selectMock = jest.fn().mockResolvedValue(mockCustomers);
      User.find.mockReturnValue({ select: selectMock });

      await getCustomers(req, res);

      expect(User.find).toHaveBeenCalledWith({ role: "user" });
      expect(selectMock).toHaveBeenCalledWith("-password");
      expect(res.status).toHaveBeenCalledWith(200);
      expect(res.json).toHaveBeenCalledWith(mockCustomers);
    });

    it("should return 404 when User.find fails", async () => {
      User.find.mockReturnValue({
        select: jest.fn().mockRejectedValue(new Error("User fetch failed")),
      });

      await getCustomers(req, res);

      expect(res.status).toHaveBeenCalledWith(404);
      expect(res.json).toHaveBeenCalledWith({ message: "User fetch failed" });
    });
  });

  describe("getTransactions", () => {
    it("should fetch transactions with default pagination and search and return 200", async () => {
      const mockTransactions = [{ _id: "t1", cost: "$100", userId: "u1" }];
      const limitMock = jest.fn().mockResolvedValue(mockTransactions);
      const skipMock = jest.fn().mockReturnValue({ limit: limitMock });
      const sortMock = jest.fn().mockReturnValue({ skip: skipMock });

      Transaction.find.mockReturnValue({ sort: sortMock });
      Transaction.countDocuments.mockResolvedValue(1);

      await getTransactions(req, res);

      expect(Transaction.find).toHaveBeenCalled();
      expect(sortMock).toHaveBeenCalledWith({});
      expect(skipMock).toHaveBeenCalledWith(20); // page (1) * pageSize (20)
      expect(limitMock).toHaveBeenCalledWith(20);
      expect(Transaction.countDocuments).toHaveBeenCalled();
      expect(res.status).toHaveBeenCalledWith(200);
      expect(res.json).toHaveBeenCalledWith({
        transactions: mockTransactions,
        total: 1,
      });
    });

    it("should handle custom page, pageSize, sort asc, and search parameters", async () => {
      req.query = {
        page: "2",
        pageSize: "10",
        sort: JSON.stringify({ field: "userId", sort: "asc" }),
        search: "test",
      };

      const mockTransactions = [{ _id: "t2", cost: "$200", userId: "u2" }];
      const limitMock = jest.fn().mockResolvedValue(mockTransactions);
      const skipMock = jest.fn().mockReturnValue({ limit: limitMock });
      const sortMock = jest.fn().mockReturnValue({ skip: skipMock });

      Transaction.find.mockReturnValue({ sort: sortMock });
      Transaction.countDocuments.mockResolvedValue(15);

      await getTransactions(req, res);

      expect(sortMock).toHaveBeenCalledWith({ userId: 1 });
      expect(skipMock).toHaveBeenCalledWith(20); // page (2) * pageSize (10)
      expect(limitMock).toHaveBeenCalledWith(10);
      expect(res.status).toHaveBeenCalledWith(200);
      expect(res.json).toHaveBeenCalledWith({
        transactions: mockTransactions,
        total: 15,
      });
    });

    it("should handle sort desc parameter", async () => {
      req.query = {
        sort: JSON.stringify({ field: "cost", sort: "desc" }),
      };

      const limitMock = jest.fn().mockResolvedValue([]);
      const skipMock = jest.fn().mockReturnValue({ limit: limitMock });
      const sortMock = jest.fn().mockReturnValue({ skip: skipMock });

      Transaction.find.mockReturnValue({ sort: sortMock });
      Transaction.countDocuments.mockResolvedValue(0);

      await getTransactions(req, res);

      expect(sortMock).toHaveBeenCalledWith({ cost: -1 });
    });

    it("should return 404 on error (e.g., invalid sort JSON)", async () => {
      req.query = { sort: "invalid_json" };

      await getTransactions(req, res);

      expect(res.status).toHaveBeenCalledWith(404);
      expect(res.json).toHaveBeenCalledWith({
        message: expect.any(String),
      });
    });
  });

  describe("getGeography", () => {
    it("should convert country ISO 2 codes to ISO 3, format them, and return 200", async () => {
      const mockUsers = [
        { country: "US" },
        { country: "US" },
        { country: "CA" },
      ];

      User.find.mockResolvedValue(mockUsers);
      getCountryISO3.mockImplementation((country) => {
        if (country === "US") return "USA";
        if (country === "CA") return "CAN";
        return country;
      });

      await getGeography(req, res);

      expect(User.find).toHaveBeenCalled();
      expect(getCountryISO3).toHaveBeenCalledWith("US");
      expect(getCountryISO3).toHaveBeenCalledWith("CA");
      expect(res.status).toHaveBeenCalledWith(200);
      expect(res.json).toHaveBeenCalledWith([
        { id: "USA", value: 2 },
        { id: "CAN", value: 1 },
      ]);
    });

    it("should return 404 when User.find fails", async () => {
      User.find.mockRejectedValue(new Error("Geography fetch failed"));

      await getGeography(req, res);

      expect(res.status).toHaveBeenCalledWith(404);
      expect(res.json).toHaveBeenCalledWith({
        message: "Geography fetch failed",
      });
    });
  });
});