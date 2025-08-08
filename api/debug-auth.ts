import { VercelRequest, VercelResponse } from '@vercel/node';
import bcrypt from 'bcrypt';

export default async function handler(req: VercelRequest, res: VercelResponse) {
  const { email, password } = req.body || {};
  
  // 環境変数の値を取得
  const defaultEmail = (process.env.DEFAULT_EMAIL || 'admin@example.com').toLowerCase();
  const defaultPassword = process.env.DEFAULT_PASSWORD || 'password123';
  
  // パスワードハッシュを生成
  const passwordHash = await bcrypt.hash(defaultPassword, 10);
  
  // 入力されたパスワードと比較
  let isValidPassword = false;
  if (password) {
    isValidPassword = await bcrypt.compare(password, passwordHash);
  }
  
  // デバッグ情報（本番では削除すること）
  const debugInfo = {
    envVars: {
      DEFAULT_EMAIL: process.env.DEFAULT_EMAIL ? '✅ Set' : '❌ Not set',
      DEFAULT_PASSWORD: process.env.DEFAULT_PASSWORD ? '✅ Set' : '❌ Not set',
      JWT_SECRET: process.env.JWT_SECRET ? '✅ Set' : '❌ Not set',
    },
    expectedEmail: defaultEmail,
    receivedEmail: email ? email.toLowerCase() : 'not provided',
    emailMatch: email?.toLowerCase() === defaultEmail,
    passwordProvided: !!password,
    passwordValid: isValidPassword,
    // テスト用: 正しい認証情報で直接ログイン成功させる
    shouldSucceed: (email?.toLowerCase() === 'info@effect.moe' && password === 'Monchan5454@')
  };
  
  // 正しいクレデンシャルの場合は成功を返す
  if (debugInfo.shouldSucceed) {
    const token = 'debug-token-' + Date.now();
    return res.status(200).json({
      success: true,
      message: 'Debug login successful',
      token,
      debugInfo
    });
  }
  
  res.status(200).json({
    success: false,
    message: 'Debug auth check',
    debugInfo
  });
}