// 11_oauth_controller.js - Google/GitHub Social Login Callbacks

// Mock Database & Services
export const OAuthUser = {
  findByProviderId: async (provider, providerId) => null,
  findByEmail: async (email) => null,
  create: async (data) => ({ id: `usr_${Date.now()}`, ...data, createdAt: new Date() }),
  linkProvider: async (userId, provider, providerId) => true
};

export const OAuthService = {
  exchangeGoogleCode: async (code) => {
    if (code === 'invalid_code') throw new Error('Bad verification code');
    return {
      googleId: 'g_1029384756',
      email: 'alex@gmail.com',
      name: 'Alex Rivera',
      avatar: 'https://lh3.googleusercontent.com/a/mock'
    };
  },
  exchangeGithubCode: async (code) => {
    if (code === 'invalid_code') throw new Error('Bad verification code');
    return {
      githubId: 'gh_99887766',
      email: 'alex.rivera@github.com',
      username: 'arivera',
      avatar: 'https://avatars.githubusercontent.com/u/99887766'
    };
  },
  generateJwt: (payload) => `mock_oauth_jwt_${payload.id}`
};

export const handleGoogleCallback = async (req, res) => {
  try {
    const { code, state } = req.query || {};

    if (!code) {
      return res.status(400).json({
        success: false,
        error: 'Authorization code is missing from callback'
      });
    }

    let googleProfile;
    try {
      googleProfile = await OAuthService.exchangeGoogleCode(code);
    } catch (err) {
      return res.status(401).json({
        success: false,
        error: 'Authentication failed: Invalid authorization code'
      });
    }

    const { googleId, email, name, avatar } = googleProfile;
    let user = await OAuthUser.findByProviderId('google', googleId);

    if (!user) {
      user = await OAuthUser.findByEmail(email);
      if (user) {
        await OAuthUser.linkProvider(user.id, 'google', googleId);
      } else {
        user = await OAuthUser.create({
          email,
          name,
          avatar,
          providers: { google: googleId },
          isEmailVerified: true
        });
      }
    }

    const token = OAuthService.generateJwt({ id: user.id, email: user.email });

    return res.status(200).json({
      success: true,
      message: 'Google authentication successful',
      data: {
        token,
        user: {
          id: user.id,
          name: user.name,
          email: user.email,
          avatar: user.avatar
        }
      }
    });
  } catch (error) {
    return res.status(500).json({
      success: false,
      error: 'Google OAuth callback processing error',
      details: error.message
    });
  }
};

export const handleGithubCallback = async (req, res) => {
  try {
    const { code } = req.query || {};

    if (!code) {
      return res.status(400).json({
        success: false,
        error: 'Authorization code is missing from callback'
      });
    }

    let githubProfile;
    try {
      githubProfile = await OAuthService.exchangeGithubCode(code);
    } catch (err) {
      return res.status(401).json({
        success: false,
        error: 'Authentication failed: Invalid GitHub authorization code'
      });
    }

    const { githubId, email, username, avatar } = githubProfile;

    if (!email) {
      return res.status(422).json({
        success: false,
        error: 'Unable to retrieve verified email from GitHub account'
      });
    }

    let user = await OAuthUser.findByProviderId('github', githubId);

    if (!user) {
      user = await OAuthUser.findByEmail(email);
      if (user) {
        await OAuthUser.linkProvider(user.id, 'github', githubId);
      } else {
        user = await OAuthUser.create({
          email,
          name: username,
          avatar,
          providers: { github: githubId },
          isEmailVerified: true
        });
      }
    }

    const token = OAuthService.generateJwt({ id: user.id, email: user.email });

    return res.status(200).json({
      success: true,
      message: 'GitHub authentication successful',
      data: {
        token,
        user: {
          id: user.id,
          name: user.name,
          email: user.email,
          avatar: user.avatar
        }
      }
    });
  } catch (error) {
    return res.status(500).json({
      success: false,
      error: 'GitHub OAuth callback processing error',
      details: error.message
    });
  }
};
