// 01_auth_controller.js - JWT Signup/Login & Password Hashing

// Mock Database & Services
export const User = {
  findOne: async (query) => null,
  create: async (data) => ({ id: 'mock-user-id', ...data, createdAt: new Date() }),
  findById: async (id) => null
};

export const PasswordHelper = {
  hash: async (password) => `hashed_${password}`,
  compare: async (plain, hashed) => hashed === `hashed_${plain}`
};

export const TokenService = {
  generateToken: (payload) => `mock_jwt_token_${payload.id}`
};

export const signup = async (req, res) => {
  try {
    const { email, password, name } = req.body || {};

    if (!email || !password || !name) {
      return res.status(400).json({
        success: false,
        error: 'Missing required fields: email, password, and name are required'
      });
    }

    const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
    if (!emailRegex.test(email)) {
      return res.status(400).json({
        success: false,
        error: 'Invalid email format'
      });
    }

    if (typeof password !== 'string' || password.length < 8) {
      return res.status(400).json({
        success: false,
        error: 'Password must be at least 8 characters long'
      });
    }

    const existingUser = await User.findOne({ email: email.toLowerCase() });
    if (existingUser) {
      return res.status(409).json({
        success: false,
        error: 'An account with this email already exists'
      });
    }

    const hashedPassword = await PasswordHelper.hash(password);
    const newUser = await User.create({
      name: name.trim(),
      email: email.toLowerCase(),
      password: hashedPassword,
      role: 'user',
      isBlocked: false
    });

    const token = TokenService.generateToken({ id: newUser.id, role: newUser.role });

    return res.status(201).json({
      success: true,
      message: 'User registered successfully',
      data: {
        user: {
          id: newUser.id,
          name: newUser.name,
          email: newUser.email,
          role: newUser.role
        },
        token
      }
    });
  } catch (error) {
    return res.status(500).json({
      success: false,
      error: 'Internal server error during registration',
      details: error.message
    });
  }
};

export const login = async (req, res) => {
  try {
    const { email, password } = req.body || {};

    if (!email || !password) {
      return res.status(400).json({
        success: false,
        error: 'Email and password are required'
      });
    }

    const user = await User.findOne({ email: email.toLowerCase() });
    if (!user) {
      return res.status(401).json({
        success: false,
        error: 'Invalid email or password'
      });
    }

    if (user.isBlocked) {
      return res.status(403).json({
        success: false,
        error: 'Account has been suspended'
      });
    }

    const isMatch = await PasswordHelper.compare(password, user.password);
    if (!isMatch) {
      return res.status(401).json({
        success: false,
        error: 'Invalid email or password'
      });
    }

    const token = TokenService.generateToken({ id: user.id, role: user.role });

    return res.status(200).json({
      success: true,
      message: 'Login successful',
      data: {
        user: {
          id: user.id,
          name: user.name,
          email: user.email,
          role: user.role
        },
        token
      }
    });
  } catch (error) {
    return res.status(500).json({
      success: false,
      error: 'Internal server error during login',
      details: error.message
    });
  }
};
