import { jest } from '@jest/globals';
import {
  validateShippingAddress,
  calculateShippingRates,
  AddressValidationService,
  CarrierRateService
} from '../dataset/16_shipping_controller.js';

const mockRes = () => {
  const res = {};
  res.status = jest.fn().mockReturnValue(res);
  res.json = jest.fn().mockReturnValue(res);
  return res;
};

describe('validateShippingAddress', () => {
  afterEach(() => {
    jest.restoreAllMocks();
  });

  test('returns 200 with verified address when input is valid (US)', async () => {
    const req = {
      body: {
        street: ' 123 Main St ',
        city: 'New York',
        state: 'ny',
        postalCode: '10001',
        country: 'us'
      }
    };
    const res = mockRes();

    const verifySpy = jest.spyOn(AddressValidationService, 'verify').mockResolvedValue({
      isValid: true,
      normalized: {
        street: '123 Main St',
        city: 'New York',
        state: 'NY',
        postalCode: '10001',
        country: 'US'
      }
    });

    await validateShippingAddress(req, res);

    expect(res.status).toHaveBeenCalledWith(200);
    expect(res.json).toHaveBeenCalledWith({
      success: true,
      message: 'Address verified',
      data: expect.objectContaining({ isValid: true })
    });
    expect(verifySpy).toHaveBeenCalledWith({
      street: ' 123 Main St ',
      city: 'New York',
      state: 'ny',
      postalCode: '10001',
      country: 'US'
    });
  });

  test('returns 400 when required fields are missing', async () => {
    const req = { body: { city: 'Boston', state: 'MA', postalCode: '02101' } };
    const res = mockRes();

    await validateShippingAddress(req, res);

    expect(res.status).toHaveBeenCalledWith(400);
    expect(res.json).toHaveBeenCalledWith({
      success: false,
      error: 'Incomplete address: street, city, state, and postalCode are required'
    });
  });

  test('returns 422 for restricted country codes', async () => {
    const req = {
      body: {
        street: '1 Infinite Loop',
        city: 'Cupertino',
        state: 'CA',
        postalCode: '95014',
        country: 'ir' // restricted
      }
    };
    const res = mockRes();

    await validateShippingAddress(req, res);

    expect(res.status).toHaveBeenCalledWith(422);
    expect(res.json).toHaveBeenCalledWith({
      success: false,
      error: 'Shipping is not available to destination country code "IR"'
    });
  });

  test('returns 400 for invalid US postal code format', async () => {
    const req = {
      body: {
        street: '500 Some Rd',
        city: 'Seattle',
        state: 'WA',
        postalCode: 'ABCDE',
        country: 'US'
      }
    };
    const res = mockRes();

    await validateShippingAddress(req, res);

    expect(res.status).toHaveBeenCalledWith(400);
    expect(res.json).toHaveBeenCalledWith({
      success: false,
      error: 'Invalid US postal code format (expected 12345 or 12345-6789)'
    });
  });

  test('returns 500 when verification service throws', async () => {
    const req = {
      body: {
        street: '10 Downing St',
        city: 'London',
        state: 'LDN',
        postalCode: 'SW1A 2AA',
        country: 'GB'
      }
    };
    const res = mockRes();

    jest.spyOn(AddressValidationService, 'verify').mockRejectedValue(new Error('Service down'));

    await validateShippingAddress(req, res);

    expect(res.status).toHaveBeenCalledWith(500);
    expect(res.json).toHaveBeenCalledWith({
      success: false,
      error: 'Address validation failed',
      details: 'Service down'
    });
  });
});

describe('calculateShippingRates', () => {
  afterEach(() => {
    jest.restoreAllMocks();
  });

  const baseReq = {
    body: {
      destination: { country: 'US', postalCode: '90210' },
      packageDetails: {
        weightKg: 2,
        dimensions: { length: 30, width: 20, height: 10 }
      }
    }
  };

  test('returns 200 with rates when weight > volumetric weight', async () => {
    const req = { ...baseReq };
    const res = mockRes();

    const getRatesSpy = jest
      .spyOn(CarrierRateService, 'getRates')
      .mockResolvedValue([
        { service: 'standard', rate: 10, estDays: '3-5 business days' },
        { service: 'express', rate: 20, estDays: '1-2 business days' }
      ]);

    await calculateShippingRates(req, res);

    expect(res.status).toHaveBeenCalledWith(200);
    expect(res.json).toHaveBeenCalledWith({
      success: true,
      data: {
        billableWeightKg: 2,
        isVolumetric: false,
        options: [
          { service: 'standard', cost: 10, currency: 'USD', estimatedDelivery: '3-5 business days' },
          { service: 'express', cost: 20, currency: 'USD', estimatedDelivery: '1-2 business days' }
        ]
      }
    });
    expect(getRatesSpy).toHaveBeenCalledWith(2, 'US');
  });

  test('uses volumetric weight when it exceeds actual weight', async () => {
    const req = {
      body: {
        destination: { country: 'US', postalCode: '30301' },
        packageDetails: {
          weightKg: 1,
          dimensions: { length: 100, width: 100, height: 100 } // volumetric = 2000/5000 = 2000? wait compute: 100*100*100=1,000,000 /5000 =200
        }
      }
    };
    const res = mockRes();

    const getRatesSpy = jest.spyOn(CarrierRateService, 'getRates').mockResolvedValue([
      { service: 'standard', rate: 500, estDays: '3-5 business days' }
    ]);

    await calculateShippingRates(req, res);

    expect(res.status).toHaveBeenCalledWith(200);
    const responseData = res.json.mock.calls[0][0].data;
    expect(responseData.billableWeightKg).toBeCloseTo(200);
    expect(responseData.isVolumetric).toBe(true);
    expect(getRatesSpy).toHaveBeenCalledWith(200, 'US');
  });

  test('returns 400 when destination info is incomplete', async () => {
    const req = { body: { packageDetails: { weightKg: 1, dimensions: { length: 10, width: 10, height: 10 } } } };
    const res = mockRes();

    await calculateShippingRates(req, res);

    expect(res.status).toHaveBeenCalledWith(400);
    expect(res.json).toHaveBeenCalledWith({
      success: false,
      error: 'Destination country and postalCode are required'
    });
  });

  test('returns 422 for restricted destination country', async () => {
    const req = {
      body: {
        destination: { country: 'KP', postalCode: '12345' },
        packageDetails: { weightKg: 1, dimensions: { length: 10, width: 10, height: 10 } }
      }
    };
    const res = mockRes();

    await calculateShippingRates(req, res);

    expect(res.status).toHaveBeenCalledWith(422);
    expect(res.json).toHaveBeenCalledWith({
      success: false,
      error: 'Carrier does not ship to "KP"'
    });
  });

  test('returns 400 when package weight is invalid', async () => {
    const req = {
      body: {
        destination: { country: 'US', postalCode: '12345' },
        packageDetails: { weightKg: -5, dimensions: { length: 10, width: 10, height: 10 } }
      }
    };
    const res = mockRes();

    await calculateShippingRates(req, res);

    expect(res.status).toHaveBeenCalledWith(400);
    expect(res.json).toHaveBeenCalledWith({
      success: false,
      error: 'Package weightKg must be a positive number'
    });
  });

  test('returns 400 when dimensions are invalid', async () => {
    const req = {
      body: {
        destination: { country: 'US', postalCode: '12345' },
        packageDetails: { weightKg: 1, dimensions: { length: 0, width: 10, height: 10 } }
      }
    };
    const res = mockRes();

    await calculateShippingRates(req, res);

    expect(res.status).toHaveBeenCalledWith(400);
    expect(res.json).toHaveBeenCalledWith({
      success: false,
      error: 'Valid dimensions (length, width, height > 0) in cm are required'
    });
  });

  test('returns 500 when rate service throws', async () => {
    const req = { ...baseReq };
    const res = mockRes();

    jest.spyOn(CarrierRateService, 'getRates').mockRejectedValue(new Error('Rate API down'));

    await calculateShippingRates(req, res);

    expect(res.status).toHaveBeenCalledWith(500);
    expect(res.json).toHaveBeenCalledWith({
      success: false,
      error: 'Failed to compute shipping rates',
      details: 'Rate API down'
    });
  });
});