import { jest } from '@jest/globals';
import { customerDataRequest, customerRedact, shopRedact } from '../dataset/external/kinngh__shopify-node-express-mongodb-app/server/controllers/gdpr.js';

describe('GDPR Controllers', () => {
  let consoleLogSpy;
  let consoleErrorSpy;

  beforeEach(() => {
    consoleLogSpy = jest.spyOn(console, 'log').mockImplementation(() => {});
    consoleErrorSpy = jest.spyOn(console, 'error').mockImplementation(() => {});
  });

  afterEach(() => {
    jest.restoreAllMocks();
  });

  describe('customerDataRequest', () => {
    it('should log topic, shop, and webhook request body and return success: true', async () => {
      const topic = 'CUSTOMERS_DATA_REQUEST';
      const shop = 'test-store.myshopify.com';
      const body = {
        shop_id: 123456,
        shop_domain: shop,
        orders_requested: [123456],
        customer: { id: 123456, email: 'email@email.com', phone: '123-123-1231' },
        data_request: { id: 1111 }
      };

      const result = await customerDataRequest(topic, shop, body);

      expect(consoleLogSpy).toHaveBeenCalledWith(`Handle ${topic} for ${shop}`);
      expect(consoleLogSpy).toHaveBeenCalledWith(body);
      expect(result).toEqual({ success: true });
    });

    it('should catch errors and return success: false', async () => {
      consoleLogSpy.mockImplementationOnce(() => {
        throw new Error('Logger error');
      });

      const result = await customerDataRequest('CUSTOMERS_DATA_REQUEST', 'test-store.myshopify.com', {});

      expect(consoleErrorSpy).toHaveBeenCalled();
      expect(result).toEqual({ success: false });
    });
  });

  describe('customerRedact', () => {
    it('should log topic, shop, and webhook request body and return success: true', async () => {
      const topic = 'CUSTOMERS_REDACT';
      const shop = 'test-store.myshopify.com';
      const body = {
        shop_id: 123456,
        shop_domain: shop,
        customer: { id: 123456, email: 'email@email.com', phone: '123-123-1234' },
        orders_to_redact: [123456]
      };

      const result = await customerRedact(topic, shop, body);

      expect(consoleLogSpy).toHaveBeenCalledWith(`Handle ${topic} for ${shop}`);
      expect(consoleLogSpy).toHaveBeenCalledWith(body);
      expect(result).toEqual({ success: true });
    });

    it('should catch errors and return success: false', async () => {
      consoleLogSpy.mockImplementationOnce(() => {
        throw new Error('Logger error');
      });

      const result = await customerRedact('CUSTOMERS_REDACT', 'test-store.myshopify.com', {});

      expect(consoleErrorSpy).toHaveBeenCalled();
      expect(result).toEqual({ success: false });
    });
  });

  describe('shopRedact', () => {
    it('should log topic, shop, and webhook request body and return success: true', async () => {
      const topic = 'SHOP_REDACT';
      const shop = 'test-store.myshopify.com';
      const body = {
        shop_id: 123456,
        shop_domain: shop
      };

      const result = await shopRedact(topic, shop, body);

      expect(consoleLogSpy).toHaveBeenCalledWith(`Handle ${topic} for ${shop}`);
      expect(consoleLogSpy).toHaveBeenCalledWith(body);
      expect(result).toEqual({ success: true });
    });

    it('should catch errors and return success: false', async () => {
      consoleLogSpy.mockImplementationOnce(() => {
        throw new Error('Logger error');
      });

      const result = await shopRedact('SHOP_REDACT', 'test-store.myshopify.com', {});

      expect(consoleErrorSpy).toHaveBeenCalled();
      expect(result).toEqual({ success: false });
    });
  });
});