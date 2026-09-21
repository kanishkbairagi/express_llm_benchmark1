// 16_shipping_controller.js - Address Validation & Rate Calculations

// Mock Validation & Carrier Services
export const AddressValidationService = {
  verify: async (address) => ({
    isValid: true,
    normalized: {
      street: address.street.trim(),
      city: address.city.trim(),
      state: address.state.toUpperCase().trim(),
      postalCode: address.postalCode.trim(),
      country: address.country.toUpperCase().trim()
    }
  })
};

export const CarrierRateService = {
  getRates: async (billableWeight, destinationCountry) => [
    { service: 'standard', rate: billableWeight * 2.5 + 5.0, estDays: '3-5 business days' },
    { service: 'express', rate: billableWeight * 5.0 + 12.0, estDays: '1-2 business days' },
    { service: 'overnight', rate: billableWeight * 9.0 + 25.0, estDays: 'Next business day' }
  ]
};

const RESTRICTED_COUNTRIES = ['CU', 'IR', 'KP', 'SY'];

export const validateShippingAddress = async (req, res) => {
  try {
    const { street, city, state, postalCode, country = 'US' } = req.body || {};

    if (!street || !city || !state || !postalCode) {
      return res.status(400).json({
        success: false,
        error: 'Incomplete address: street, city, state, and postalCode are required'
      });
    }

    const normCountry = country.toUpperCase().trim();
    if (RESTRICTED_COUNTRIES.includes(normCountry)) {
      return res.status(422).json({
        success: false,
        error: `Shipping is not available to destination country code "${normCountry}"`
      });
    }

    if (normCountry === 'US') {
      const usZipRegex = /^\d{5}(-\d{4})?$/;
      if (!usZipRegex.test(postalCode.trim())) {
        return res.status(400).json({
          success: false,
          error: 'Invalid US postal code format (expected 12345 or 12345-6789)'
        });
      }
    }

    const verificationResult = await AddressValidationService.verify({
      street,
      city,
      state,
      postalCode,
      country: normCountry
    });

    return res.status(200).json({
      success: true,
      message: 'Address verified',
      data: verificationResult
    });
  } catch (error) {
    return res.status(500).json({
      success: false,
      error: 'Address validation failed',
      details: error.message
    });
  }
};

export const calculateShippingRates = async (req, res) => {
  try {
    const { destination, packageDetails } = req.body || {};

    if (!destination || !destination.country || !destination.postalCode) {
      return res.status(400).json({
        success: false,
        error: 'Destination country and postalCode are required'
      });
    }

    if (RESTRICTED_COUNTRIES.includes(destination.country.toUpperCase())) {
      return res.status(422).json({
        success: false,
        error: `Carrier does not ship to "${destination.country}"`
      });
    }

    if (!packageDetails || typeof packageDetails !== 'object') {
      return res.status(400).json({
        success: false,
        error: 'packageDetails object is required'
      });
    }

    const { weightKg, dimensions } = packageDetails;

    if (typeof weightKg !== 'number' || weightKg <= 0) {
      return res.status(400).json({
        success: false,
        error: 'Package weightKg must be a positive number'
      });
    }

    if (
      !dimensions ||
      typeof dimensions.length !== 'number' ||
      typeof dimensions.width !== 'number' ||
      typeof dimensions.height !== 'number' ||
      dimensions.length <= 0 ||
      dimensions.width <= 0 ||
      dimensions.height <= 0
    ) {
      return res.status(400).json({
        success: false,
        error: 'Valid dimensions (length, width, height > 0) in cm are required'
      });
    }

    // Volumetric weight divisor: 5000 cm3/kg
    const volumetricWeight = (dimensions.length * dimensions.width * dimensions.height) / 5000;
    const billableWeight = Math.max(weightKg, volumetricWeight);

    const availableRates = await CarrierRateService.getRates(billableWeight, destination.country);

    const formattedRates = availableRates.map((option) => ({
      service: option.service,
      cost: parseFloat(option.rate.toFixed(2)),
      currency: 'USD',
      estimatedDelivery: option.estDays
    }));

    return res.status(200).json({
      success: true,
      data: {
        billableWeightKg: parseFloat(billableWeight.toFixed(2)),
        isVolumetric: volumetricWeight > weightKg,
        options: formattedRates
      }
    });
  } catch (error) {
    return res.status(500).json({
      success: false,
      error: 'Failed to compute shipping rates',
      details: error.message
    });
  }
};
