import { VercelRequest, VercelResponse } from '@vercel/node';

export default function handler(req: VercelRequest, res: VercelResponse) {
  // 環境変数の存在確認（値は隠す）
  const envStatus = {
    JWT_SECRET: process.env.JWT_SECRET ? '✅ 設定済み' : '❌ 未設定',
    DEFAULT_EMAIL: process.env.DEFAULT_EMAIL ? '✅ 設定済み' : '❌ 未設定', 
    DEFAULT_PASSWORD: process.env.DEFAULT_PASSWORD ? '✅ 設定済み' : '❌ 未設定',
    NODE_ENV: process.env.NODE_ENV || 'not set',
    // デバッグ用: メールアドレスだけ一部表示
    email_hint: process.env.DEFAULT_EMAIL ? 
      process.env.DEFAULT_EMAIL.substring(0, 3) + '***' : 
      'not set'
  };

  res.status(200).json({
    message: '環境変数の状態',
    status: envStatus,
    timestamp: new Date().toISOString()
  });
}