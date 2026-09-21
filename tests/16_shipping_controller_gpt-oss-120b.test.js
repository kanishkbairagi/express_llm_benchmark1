import { jest } from '@jest/globals';
import {
  validateShippingAddress,
  calculateShippingRates,
  AddressValidationService,
  CarrierRateService
} from '../dataset/16_shipping_controller.js';

const createRes = () => {
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
        city: ' Springfield ',
        state: ' il ',
        postalCode: ' 62704 ',
        country: 'us'
      }
    };
    const res = createRes();

    await validateShippingAddress(req, res);

    expect(res.status).toHaveBeenCalledWith(200);
    expect(res.json).toHaveBeenCalledWith(
      expect.objectContaining({
        success: true,
        message: 'Address verified',
        data: expect.objectContaining({
          isValid: true,
          normalized: {
            street: '123 Main St',
            city: 'Springfield',
            state: 'IL',
            postalCode: '62704',
            country: 'US'
          }
        })
      })
    );
  });

  test('returns 400 when required fields are missing', async () => {
    const req = { body: { city: 'NY', state: 'NY', postalCode: '10001' } };
    const res = createRes();

    await validateShippingAddress(req, res);

    expect(res.status).toHaveBeenCalledWith(400);
    expect(res.json).toHaveBeenCalledWith(
      expect.objectContaining({
        success: false,
        error: expect.stringContaining('Incomplete address')
      })
    );
  });

  test('returns 422 for a restricted destination country', async () => {
    const req = {
      body: {
        street: '1 Infinite Loop',
        city: 'Cupertino',
        state: 'CA',
        postalCode: '95014',
        country: 'ir'
      }
    };
    const res = createRes();

    await validateShippingAddress(req, res);

    expect(res.status).toHaveBeenCalledWith(422);
    expect(res.json).toHaveBeenCalledWith(
      expect.objectContaining({
        success: false,
        error: expect.stringContaining('Shipping is not available')
      })
    );
  });

  test('returns 400 for invalid US postal code format', async () => {
    const req = {
      body: {
        street: '1600 Pennsylvania Ave NW',
        city: 'Washington',
        state: 'DC',
        postalCode: 'ABCDE',
        country: 'US'
      }
    };
    const res = createRes();

    await validateShippingAddress(req, res);

    expect(res.status).toHaveBeenCalledWith(400);
    expect(res.json).toHaveBeenCalledWith(
      expect.objectContaining({
        success: false,
        error: expect.stringContaining('Invalid US postal code')
      })
    );
  });

  test('returns 500 when AddressValidationService throws', async () => {
    jest.spyOn(AddressValidationService, 'verify').mockImplementation(() => {
      throw new Error('service failure');
    });

    const req = {
      body: {
        street: '10 Downing St',
        city: 'London',
        state: 'LDN',
        postalCode: 'SW1A 2AA',
        country: 'GB'
      }
    };
    const res = createRes();

    await validateShippingAddress(req, res);

    expect(res.status).toHaveBeenCalledWith(500);
    expect(res.json).toHaveBeenCalledWith(
      expect.objectContaining({
        success: false,
        error: 'Address validation failed',
        details: 'service failure'
      })
    );
  });
});

describe('calculateShippingRates', () => {
  afterEach(() => {
    jest.restoreAllMocks();
  });

  test('returns 200 with correct rates when data is valid (weight dominates)', async () => {
    const mockRates = [
      { service: 'standard', rate: 20.0, estDays: '3-5 business days' },
      { service: 'express', rate: 35.0, estDays: '1-2 business days' },
      { service: 'overnight', rate: 55.0, estDays: 'Next business day' }
    ];
    jest.spyOn(CarrierRateService, 'getRates').mockResolvedValue(mockRates);

    const req = {
      body: {
        destination: { country: 'US', postalCode: '90210' },
        packageDetails: {
          weightKg: 10,
          dimensions: { length: 30, width: 20, height: 10 }
        }
      }
    };
    const res = createRes();

    await calculateShippingRates(req, res);

    expect(res.status).toHaveBeenCalledWith(200);
    const jsonArg = res.json.mock.calls[0][0];
    expect(jsonArg.success).toBe(true);
    expect(jsonArg.data.billableWeightKg).toBeCloseTo(10);
    expect(jsonArg.data.isVolumetric).toBe(false);
    expect(jsonArg.data.options).toHaveLength(3);
    expect(jsonArg.data.options).toEqual(
      mockRates.map((r) => ({
        service: r.service,
        cost: parseFloat(r.rate.toFixed(2)),
        currency: 'USD',
        estimatedDelivery: r.estDays
      }))
    );
  });

  test('uses volumetric weight when it exceeds actual weight', async () => {
    const mockRates = [{ service: 'standard', rate: 100, estDays: '3-5 days' }];
    jest.spyOn(CarrierRateService, 'getRates').mockResolvedValue(mockRates);

    const req = {
      body: {
        destination: { country: 'CA', postalCode: 'H1A0A0' },
        packageDetails: {
          weightKg: 2,
          dimensions: { length: 100, width: 100, height: 100 } // 1,000,000 cm³ / 5000 = 200 kg
        }
      }
    };
    const res = createRes();

    await calculateShippingRates(req, res);

    const jsonArg = res.json.mock.calls[0][0];
    expect(jsonArg.data.billableWeightKg).toBeCloseTo(200);
    expect(jsonArg.data.isVolumetric).toBe(true);
    expect(CarrierRateService.getRates).toHaveBeenCalledWith(200, 'CA');
  });

  test('returns 400 when destination data is incomplete', async () => {
    const req = { body: { destination: { country: 'US' }, packageDetails: { weightKg: 1, dimensions: { length: 10, width: 10, height: 10 } } } };
    const res = createRes();

    await calculateShippingRates(req, res);

    expect(res.status).toHaveBeenCalledWith(400);
    expect(res.json).toHaveBeenCalledWith(
      expect.objectContaining({
        success: false,
        error: expect.stringContaining('Destination country and postalCode')
      })
    );
  });

  test('returns 422 for restricted destination country', async () => {
    const req = {
      body: {
        destination: { country: 'KP', postalCode: '12345' },
        packageDetails: { weightKg: 1, dimensions: { length: 10, width: 10, height: 10 } }
      }
    };
    const res = createRes();

    await calculateShippingRates(req, res);

    expect(res.status).toHaveBeenCalledWith(422);
    expect(res.json).toHaveBeenCalledWith(
      expect.objectContaining({
        success: false,
        error: expect.stringContaining('Carrier does not ship')
      })
    );
  });

  test('returns 400 when packageDetails are invalid', async () => {
    const req = {
      body: {
        destination: { country: 'US', postalCode: '12345' },
        packageDetails: { weightKg: -5, dimensions: { length: 10, width: 10, height: 10 } }
      }
    };
    const res = createRes();

    await calculateShippingRates(req, res);

    expect(res.status).toHaveBeenCalledWith(400);
    expect(res.json).toHaveBeenCalledWith(
      expect.objectContaining({
        success: false,
        error: expect.stringContaining('Package weightKg')
      })
    );
  });

  test('returns 500 when CarrierRateService throws', async () => {
    jest.spyOn(CarrierRateService, 'getRates').mockRejectedValue(new Error('rate service down'));

    const req = {
      body: {
        destination: { country: 'US', postalCode: '12345' },
        packageDetails: { weightKg: 1, dimensions: { length: 10, width: 10, height: 10 } }
      }
    };
    const res = createRes();

    await calculateShippingRates(req, res);

    expect(res.status).toHaveBeenCalledWith(500);
    expect(res.json).toHaveBeenCalledWith(
      expect.objectContaining({
        success: false,
        error: 'Failed to compute shipping rates',
        details: 'rate service down'
      })
    );
  });
});