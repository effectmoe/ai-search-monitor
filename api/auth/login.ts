import { VercelRequest, VercelResponse } from '@vercel/node';
import bcrypt from 'bcrypt';
import jwt from 'jsonwebtoken';

export default async function handler(req: VercelRequest, res: VercelResponse) {
  // CORSヘッダー
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');

  if (req.method === 'OPTIONS') {
    return res.status(200).end();
  }

  if (req.method !== 'POST') {
    return res.status(405).json({ success: false, error: 'Method not allowed' });
  }

  try {
    const { email, password } = req.body;

    // 環境変数から認証情報を取得
    const defaultEmail = (process.env.DEFAULT_EMAIL || 'admin@example.com').toLowerCase();
    const defaultPassword = process.env.DEFAULT_PASSWORD || 'password123';

    // メールアドレスの確認
    if (email?.toLowerCase() !== defaultEmail) {
      return res.status(401).json({
        success: false,
        error: {
          code: 'INVALID_CREDENTIALS',
          message: 'Invalid email or password'
        }
      });
    }

    // パスワードの確認
    const passwordHash = await bcrypt.hash(defaultPassword, 10);
    const isValidPassword = await bcrypt.compare(password, passwordHash);

    if (!isValidPassword) {
      return res.status(401).json({
        success: false,
        error: {
          code: 'INVALID_CREDENTIALS',
          message: 'Invalid email or password'
        }
      });
    }

    // JWT トークンの生成
    const jwtSecret = process.env.JWT_SECRET || 'default-secret-change-in-production';
    const token = jwt.sign(
      {
        id: 'admin-001',
        email: defaultEmail,
        role: 'admin'
      },
      jwtSecret,
      { expiresIn: '24h' }
    );

    // 成功レスポンス
    return res.status(200).json({
      success: true,
      data: {
        user: {
          id: 'admin-001',
          email: defaultEmail,
          role: 'admin',
          permissions: ['*']
        },
        tokens: {
          accessToken: token,
          expiresIn: 86400
        }
      }
    });

  } catch (error) {
    console.error('Login error:', error);
    return res.status(500).json({
      success: false,
      error: {
        code: 'INTERNAL_ERROR',
        message: 'An error occurred during login'
      }
    });
  }
}