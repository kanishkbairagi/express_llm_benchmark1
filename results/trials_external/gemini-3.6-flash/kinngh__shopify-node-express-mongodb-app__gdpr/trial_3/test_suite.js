import { jest } from '@jest/globals';
import {
  customerDataRequest,
  customerRedact,
  shopRedact,
} from '../dataset/external/kinngh__shopify-node-express-mongodb-app/server/controllers/gdpr.js';

describe('GDPR Controllers', () => {
  let logSpy;
  let errorSpy;

  beforeEach(() => {
    logSpy = jest.spyOn(console, 'log').mockImplementation(() => {});
    errorSpy = jest.spyOn(console, 'error').mockImplementation(() => {});
  });

  afterEach(() => {
    jest.restoreAllMocks();
  });

  describe('customerDataRequest', () => {
    it('should handle customer data request successfully and return { success: true }', async () => {
      const topic = 'CUSTOMERS_DATA_REQUEST';
      const shop = 'store.myshopify.com';
      const body = {
        shop_id: 123456,
        shop_domain: 'store.myshopify.com',
        orders_requested: [123456],
        customer: { id: 123456, email: 'email@email.com', phone: '123-123-1231' },
        data_request: { id: 1111 },
      };

      const result = await customerDataRequest(topic, shop, body);

      expect(logSpy).toHaveBeenCalledWith(`Handle ${topic} for ${shop}`);
      expect(logSpy).toHaveBeenCalledWith(body);
      expect(result).toEqual({ success: true });
    });

    it('should catch error and return { success: false } when an exception occurs', async () => {
      const badTopic = {
        toString() {
          throw new Error('Conversion error');
        },
      };

      const result = await customerDataRequest(badTopic, 'store.myshopify.com', {});

      expect(errorSpy).toHaveBeenCalledWith(expect.any(Error));
      expect(result).toEqual({ success: false });
    });
  });

  describe('customerRedact', () => {
    it('should handle customer redact successfully and return { success: true }', async () => {
      const topic = 'CUSTOMERS_REDACT';
      const shop = 'store.myshopify.com';
      const body = {
        shop_id: 123456,
        shop_domain: 'store.myshopify.com',
        customer: { id: 123456, email: 'email@email.com', phone: '123-123-1234' },
        orders_to_redact: [123456],
      };

      const result = await customerRedact(topic, shop, body);

      expect(logSpy).toHaveBeenCalledWith(`Handle ${topic} for ${shop}`);
      expect(logSpy).toHaveBeenCalledWith(body);
      expect(result).toEqual({ success: true });
    });

    it('should catch error and return { success: false } when an exception occurs', async () => {
      const badTopic = {
        toString() {
          throw new Error('Conversion error');
        },
      };

      const result = await customerRedact(badTopic, 'store.myshopify.com', {});

      expect(errorSpy).toHaveBeenCalledWith(expect.any(Error));
      expect(result).toEqual({ success: false });
    });
  });

  describe('shopRedact', () => {
    it('should handle shop redact successfully and return { success: true }', async () => {
      const topic = 'SHOP_REDACT';
      const shop = 'store.myshopify.com';
      const body = {
        shop_id: 123456,
        shop_domain: 'store.myshopify.com',
      };

      const result = await shopRedact(topic, shop, body);

      expect(logSpy).toHaveBeenCalledWith(`Handle ${topic} for ${shop}`);
      expect(logSpy).toHaveBeenCalledWith(body);
      expect(result).toEqual({ success: true });
    });

    it('should catch error and return { success: false } when an exception occurs', async () => {
      const badTopic = {
        toString() {
          throw new Error('Conversion error');
        },
      };

      const result = await shopRedact(badTopic, 'store.myshopify.com', {});

      expect(errorSpy).toHaveBeenCalledWith(expect.any(Error));
      expect(result).toEqual({ success: false });
    });
  });
});