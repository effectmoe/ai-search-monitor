import { Router } from 'express';
import { authController } from '../controllers/auth.controller';
import { rateLimitMiddleware } from '../middleware/rate-limit.middleware';
import { validationMiddleware } from '../middleware/validation.middleware';
import { responseMiddleware } from '../middleware/response.middleware';
import { authMiddleware } from '../middleware/auth.middleware';
import { z } from 'zod';

const router = Router();

// Authentication routes have special rate limiting
router.use(rateLimitMiddleware.perIp(20, 60000)); // 20 requests per minute per IP

// Login request schema
const LoginSchema = z.object({
  email: z.string().email(),
  password: z.string().min(6),
});

// Token refresh schema
const RefreshTokenSchema = z.object({
  refreshToken: z.string(),
});

// Password reset request schema
const PasswordResetRequestSchema = z.object({
  email: z.string().email(),
});

// Password reset schema
const PasswordResetSchema = z.object({
  token: z.string(),
  newPassword: z.string().min(8),
});

/**
 * @route POST /api/v1/auth/login
 * @desc Authenticate user and return JWT token
 * @access Public
 * @ratelimit 5 attempts per 15 minutes per IP
 */
router.post('/login',
  rateLimitMiddleware.perIp(5, 15 * 60000), // Strict rate limiting for login
  validationMiddleware.validateBody(LoginSchema),
  responseMiddleware.setCacheControl(0), // No caching for auth
  authController.login
);

/**
 * @route POST /api/v1/auth/refresh
 * @desc Refresh JWT token using refresh token
 * @access Public
 * @ratelimit 10 requests per hour per IP
 */
router.post('/refresh',
  rateLimitMiddleware.perIp(10, 3600000), // 10 per hour
  validationMiddleware.validateBody(RefreshTokenSchema),
  responseMiddleware.setCacheControl(0), // No caching for auth
  authController.refreshToken
);

/**
 * @route POST /api/v1/auth/logout
 * @desc Logout user and invalidate tokens
 * @access Private (requires authentication)
 */
router.post('/logout',
  authMiddleware.authenticate,
  responseMiddleware.setCacheControl(0), // No caching for auth
  authController.logout
);

/**
 * @route GET /api/v1/auth/me
 * @desc Get current user information
 * @access Private (requires authentication)
 */
router.get('/me',
  authMiddleware.authenticate,
  responseMiddleware.setCacheControl(300), // Cache for 5 minutes
  authController.getCurrentUser
);

/**
 * @route POST /api/v1/auth/password-reset-request
 * @desc Request password reset (send email)
 * @access Public
 * @ratelimit 3 requests per hour per IP
 */
router.post('/password-reset-request',
  rateLimitMiddleware.perIp(3, 3600000), // 3 per hour
  validationMiddleware.validateBody(PasswordResetRequestSchema),
  responseMiddleware.setCacheControl(0), // No caching for auth
  authController.requestPasswordReset
);

/**
 * @route POST /api/v1/auth/password-reset
 * @desc Reset password using reset token
 * @access Public
 * @ratelimit 5 requests per hour per IP
 */
router.post('/password-reset',
  rateLimitMiddleware.perIp(5, 3600000), // 5 per hour
  validationMiddleware.validateBody(PasswordResetSchema),
  responseMiddleware.setCacheControl(0), // No caching for auth
  authController.resetPassword
);

/**
 * @route POST /api/v1/auth/verify-token
 * @desc Verify if JWT token is valid
 * @access Public
 */
router.post('/verify-token',
  authMiddleware.optionalAuth, // Optional auth to check token
  responseMiddleware.setCacheControl(0), // No caching for auth
  authController.verifyToken
);

// Export router
export { router as authRoutes };