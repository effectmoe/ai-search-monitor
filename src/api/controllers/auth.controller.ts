import { Response, NextFunction } from 'express';
import bcrypt from 'bcrypt';
import { AuthenticatedRequest, ErrorCodes } from '../types/api.types';
import { authMiddleware } from '../middleware/auth.middleware';
import { errorMiddleware } from '../middleware/error.middleware';
import { logger } from '../../utils/logger';
import { vercelKV } from '../../database/vercel-kv';

// In a real application, you would have a proper user management system
// For this demo, we'll use a simple in-memory store with predefined users
interface User {
  id: string;
  email: string;
  passwordHash: string;
  role: 'admin' | 'user' | 'readonly';
  permissions: string[];
  clientIds?: number[];
  isActive: boolean;
  createdAt: Date;
  lastLogin?: Date;
}

class AuthController {
  private users: Map<string, User> = new Map();

  constructor() {
    this.initializeDefaultUsers();
  }

  /**
   * Initialize default users for demo purposes
   */
  private async initializeDefaultUsers(): Promise<void> {
    const defaultPassword = process.env.DEFAULT_PASSWORD || 'password123';
    const defaultEmail = process.env.DEFAULT_EMAIL || 'admin@example.com';
    const passwordHash = await bcrypt.hash(defaultPassword, 10);

    // Admin user - あなた専用のアカウント
    this.users.set(defaultEmail, {
      id: 'admin-001',
      email: defaultEmail,
      passwordHash,
      role: 'admin',
      permissions: ['*'], // All permissions
      isActive: true,
      createdAt: new Date(),
    });

    // 追加のユーザーが必要な場合は環境変数で設定可能
    // 例: ADDITIONAL_USER_EMAIL, ADDITIONAL_USER_PASSWORD など

    logger.info('User initialized', {
      email: defaultEmail,
      defaultPassword: process.env.NODE_ENV === 'production' ? '[HIDDEN]' : defaultPassword,
    });
  }

  /**
   * User login
   * POST /api/v1/auth/login
   */
  login = errorMiddleware.asyncHandler(
    async (req: AuthenticatedRequest, res: Response) => {
      const { email, password } = req.body;

      // Find user
      const user = this.users.get(email.toLowerCase());
      if (!user) {
        throw errorMiddleware.createValidationError('email', 'Invalid email or password');
      }

      // Check if user is active
      if (!user.isActive) {
        throw errorMiddleware.createForbiddenError('Account is disabled');
      }

      // Verify password
      const isValidPassword = await bcrypt.compare(password, user.passwordHash);
      if (!isValidPassword) {
        throw errorMiddleware.createValidationError('password', 'Invalid email or password');
      }

      // Update last login
      user.lastLogin = new Date();

      // Generate tokens
      const accessToken = authMiddleware.generateToken(user);
      const refreshToken = this.generateRefreshToken(user.id);

      logger.info('User logged in', {
        userId: user.id,
        email: user.email,
        role: user.role,
        ip: this.getClientIp(req),
        userAgent: req.get('User-Agent'),
      });

      return res.success({
        user: {
          id: user.id,
          email: user.email,
          role: user.role,
          permissions: user.permissions,
          clientIds: user.clientIds,
        },
        tokens: {
          accessToken,
          refreshToken,
          expiresIn: 24 * 60 * 60, // 24 hours
        },
      }, {
        message: 'Login successful',
      });
    }
  );

  /**
   * Refresh JWT token
   * POST /api/v1/auth/refresh
   */
  refreshToken = errorMiddleware.asyncHandler(
    async (req: AuthenticatedRequest, res: Response) => {
      const { refreshToken } = req.body;

      // Validate refresh token from Vercel KV or memory
      let tokenData: { userId: string; expiresAt: Date } | null = null;
      
      if (vercelKV.isReady()) {
        tokenData = await vercelKV.getTemporaryData(`refresh:${refreshToken}`);
        if (tokenData && tokenData.expiresAt && new Date(tokenData.expiresAt) < new Date()) {
          await vercelKV.deleteTemporaryData(`refresh:${refreshToken}`);
          tokenData = null;
        }
      }

      if (!tokenData) {
        throw errorMiddleware.createValidationError('refreshToken', 'Invalid or expired refresh token');
      }

      // Get user
      const user = Array.from(this.users.values()).find(u => u.id === tokenData.userId);
      if (!user || !user.isActive) {
        if (vercelKV.isReady()) {
          await vercelKV.deleteTemporaryData(`refresh:${refreshToken}`);
        }
        throw errorMiddleware.createForbiddenError('User not found or inactive');
      }

      // Generate new tokens
      const newAccessToken = authMiddleware.generateToken(user);
      const newRefreshToken = await this.generateRefreshToken(user.id);

      // Remove old refresh token
      if (vercelKV.isReady()) {
        await vercelKV.deleteTemporaryData(`refresh:${refreshToken}`);
      }

      logger.info('Token refreshed', {
        userId: user.id,
        email: user.email,
      });

      return res.success({
        tokens: {
          accessToken: newAccessToken,
          refreshToken: newRefreshToken,
          expiresIn: 24 * 60 * 60, // 24 hours
        },
      });
    }
  );

  /**
   * User logout
   * POST /api/v1/auth/logout
   */
  logout = errorMiddleware.asyncHandler(
    async (req: AuthenticatedRequest, res: Response) => {
      const { refreshToken } = req.body;
      const authHeader = req.header('Authorization');

      // Blacklist current access token
      if (authHeader) {
        const token = authHeader.replace('Bearer ', '');
        await authMiddleware.blacklistToken(token);
      }

      // Remove refresh token if provided
      if (refreshToken && vercelKV.isReady()) {
        await vercelKV.deleteTemporaryData(`refresh:${refreshToken}`);
      }

      logger.info('User logged out', {
        userId: req.user?.id,
        email: req.user?.email,
      });

      return res.success({
        message: 'Logout successful',
      });
    }
  );

  /**
   * Get current user information
   * GET /api/v1/auth/me
   */
  getCurrentUser = errorMiddleware.asyncHandler(
    async (req: AuthenticatedRequest, res: Response) => {
      if (!req.user) {
        throw errorMiddleware.createValidationError('token', 'No user found in token');
      }

      // Get fresh user data
      const user = Array.from(this.users.values()).find(u => u.id === req.user!.id);
      if (!user || !user.isActive) {
        throw errorMiddleware.createForbiddenError('User not found or inactive');
      }

      return res.success({
        user: {
          id: user.id,
          email: user.email,
          role: user.role,
          permissions: user.permissions,
          clientIds: user.clientIds,
          lastLogin: user.lastLogin,
          createdAt: user.createdAt,
        },
      });
    }
  );

  /**
   * Request password reset
   * POST /api/v1/auth/password-reset-request
   */
  requestPasswordReset = errorMiddleware.asyncHandler(
    async (req: AuthenticatedRequest, res: Response) => {
      const { email } = req.body;

      // Find user
      const user = this.users.get(email.toLowerCase());
      if (!user) {
        // Don't reveal if user exists
        return res.success({
          message: 'If the email exists, a password reset link has been sent',
        });
      }

      // Generate reset token
      const resetToken = await this.generatePasswordResetToken(user.id);

      // In a real application, you would send an email with the reset link
      logger.info('Password reset requested', {
        userId: user.id,
        email: user.email,
        resetToken: process.env.NODE_ENV === 'production' ? '[HIDDEN]' : resetToken,
      });

      return res.success({
        message: 'If the email exists, a password reset link has been sent',
        // In development, include the token for testing
        ...(process.env.NODE_ENV !== 'production' && { resetToken }),
      });
    }
  );

  /**
   * Reset password using reset token
   * POST /api/v1/auth/password-reset
   */
  resetPassword = errorMiddleware.asyncHandler(
    async (req: AuthenticatedRequest, res: Response) => {
      const { token, newPassword } = req.body;

      // Validate reset token from Vercel KV
      let tokenData: { userId: string; expiresAt: Date } | null = null;
      
      if (vercelKV.isReady()) {
        tokenData = await vercelKV.getTemporaryData(`reset:${token}`);
        if (tokenData && tokenData.expiresAt && new Date(tokenData.expiresAt) < new Date()) {
          await vercelKV.deleteTemporaryData(`reset:${token}`);
          tokenData = null;
        }
      }

      if (!tokenData) {
        throw errorMiddleware.createValidationError('token', 'Invalid or expired reset token');
      }

      // Get user
      const user = Array.from(this.users.values()).find(u => u.id === tokenData.userId);
      if (!user || !user.isActive) {
        if (vercelKV.isReady()) {
          await vercelKV.deleteTemporaryData(`reset:${token}`);
        }
        throw errorMiddleware.createForbiddenError('User not found or inactive');
      }

      // Update password
      user.passwordHash = await bcrypt.hash(newPassword, 10);

      // Remove reset token
      if (vercelKV.isReady()) {
        await vercelKV.deleteTemporaryData(`reset:${token}`);
      }

      // Invalidate all refresh tokens for this user
      if (vercelKV.isReady()) {
        await vercelKV.invalidateCachePattern(`refresh:*`); // Simplified for demo
      }

      logger.info('Password reset completed', {
        userId: user.id,
        email: user.email,
      });

      return res.success({
        message: 'Password reset successfully',
      });
    }
  );

  /**
   * Verify JWT token validity
   * POST /api/v1/auth/verify-token
   */
  verifyToken = errorMiddleware.asyncHandler(
    async (req: AuthenticatedRequest, res: Response) => {
      if (!req.user) {
        return res.error(ErrorCodes.INVALID_TOKEN, 'Invalid token', 401);
      }

      // Check if user still exists and is active
      const user = Array.from(this.users.values()).find(u => u.id === req.user!.id);
      if (!user || !user.isActive) {
        return res.error(ErrorCodes.INVALID_TOKEN, 'User not found or inactive', 401);
      }

      return res.success({
        valid: true,
        user: {
          id: user.id,
          email: user.email,
          role: user.role,
          permissions: user.permissions,
          clientIds: user.clientIds,
        },
      });
    }
  );

  /**
   * Generate refresh token
   */
  private async generateRefreshToken(userId: string): Promise<string> {
    const token = `refresh_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
    const expiresAt = new Date(Date.now() + 7 * 24 * 60 * 60 * 1000); // 7 days

    if (vercelKV.isReady()) {
      await vercelKV.setTemporaryData(`refresh:${token}`, { userId, expiresAt }, 7 * 24 * 60 * 60);
    }

    return token;
  }

  /**
   * Generate password reset token
   */
  private async generatePasswordResetToken(userId: string): Promise<string> {
    const token = `reset_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
    const expiresAt = new Date(Date.now() + 60 * 60 * 1000); // 1 hour

    if (vercelKV.isReady()) {
      await vercelKV.setTemporaryData(`reset:${token}`, { userId, expiresAt }, 60 * 60);
    }

    return token;
  }

  /**
   * Get client IP address
   */
  private getClientIp(req: AuthenticatedRequest): string {
    return (
      req.get('X-Forwarded-For') ||
      req.get('X-Real-IP') ||
      req.connection.remoteAddress ||
      req.socket.remoteAddress ||
      'unknown'
    );
  }

}

// Export singleton instance
const authControllerInstance = new AuthController();
export { authControllerInstance as authController };