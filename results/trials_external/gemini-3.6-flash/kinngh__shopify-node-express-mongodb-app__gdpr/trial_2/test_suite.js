import { customerDataRequest, customerRedact, shopRedact } from '../dataset/external/kinngh__shopify-node-express-mongodb-app/server/controllers/gdpr.js';
import { jest } from '@jest/globals';

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
    it('should log topic, shop, and request body then return success: true', async () => {
      const topic = 'CUSTOMERS_DATA_REQUEST';
      const shop = 'store.myshopify.com';
      const webhookRequestBody = {
        shop_id: 123456,
        shop_domain: 'store.myshopify.com',
        orders_requested: [123456],
        customer: {
          id: 123456,
          email: 'email@email.com',
          phone: '123-123-1231',
        },
        data_request: {
          id: 1111,
        },
      };

      const response = await customerDataRequest(topic, shop, webhookRequestBody);

      expect(consoleLogSpy).toHaveBeenCalledWith(`Handle ${topic} for ${shop}`);
      expect(consoleLogSpy).toHaveBeenCalledWith(webhookRequestBody);
      expect(response).toEqual({ success: true });
    });

    it('should log error and return success: false if an exception occurs', async () => {
      consoleLogSpy.mockImplementationOnce(() => {
        throw new Error('Logging failed');
      });

      const response = await customerDataRequest('CUSTOMERS_DATA_REQUEST', 'store.myshopify.com', {});

      expect(consoleErrorSpy).toHaveBeenCalled();
      expect(response).toEqual({ success: false });
    });
  });

  describe('customerRedact', () => {
    it('should log topic, shop, and request body then return success: true', async () => {
      const topic = 'CUSTOMERS_REDACT';
      const shop = 'store.myshopify.com';
      const webhookRequestBody = {
        shop_id: 123456,
        shop_domain: 'store.myshopify.com',
        customer: {
          id: 123456,
          email: 'email@email.com',
          phone: '123-123-1234',
        },
        orders_to_redact: [123456],
      };

      const response = await customerRedact(topic, shop, webhookRequestBody);

      expect(consoleLogSpy).toHaveBeenCalledWith(`Handle ${topic} for ${shop}`);
      expect(consoleLogSpy).toHaveBeenCalledWith(webhookRequestBody);
      expect(response).toEqual({ success: true });
    });

    it('should log error and return success: false if an exception occurs', async () => {
      consoleLogSpy.mockImplementationOnce(() => {
        throw new Error('Logging failed');
      });

      const response = await customerRedact('CUSTOMERS_REDACT', 'store.myshopify.com', {});

      expect(consoleErrorSpy).toHaveBeenCalled();
      expect(response).toEqual({ success: false });
    });
  });

  describe('shopRedact', () => {
    it('should log topic, shop, and request body then return success: true', async () => {
      const topic = 'SHOP_REDACT';
      const shop = 'store.myshopify.com';
      const webhookRequestBody = {
        shop_id: 123456,
        shop_domain: 'store.myshopify.com',
      };

      const response = await shopRedact(topic, shop, webhookRequestBody);

      expect(consoleLogSpy).toHaveBeenCalledWith(`Handle ${topic} for ${shop}`);
      expect(consoleLogSpy).toHaveBeenCalledWith(webhookRequestBody);
      expect(response).toEqual({ success: true });
    });

    it('should log error and return success: false if an exception occurs', async () => {
      consoleLogSpy.mockImplementationOnce(() => {
        throw new Error('Logging failed');
      });

      const response = await shopRedact('SHOP_REDACT', 'store.myshopify.com', {});

      expect(consoleErrorSpy).toHaveBeenCalled();
      expect(response).toEqual({ success: false });
    });
  });
});