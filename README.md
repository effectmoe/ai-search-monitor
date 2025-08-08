# AI Search Monitor

AI検索プラットフォーム（ChatGPT、Perplexity、Gemini、Claude、Google AI Overview）でのブランド言及を自動追跡するモニタリングシステム。

**Last Deploy**: 2025-08-08 - 認証システム環境変数対応、カスタムクレデンシャル実装

## 🚀 特徴

- **5つのAIプラットフォーム対応**: ChatGPT、Perplexity、Gemini、Claude、Google AI Overview
- **自動スクレイピング**: Midscene.jsを使用したインテリジェントなWebスクレイピング
- **ワークフロー管理**: Mastraによる堅牢なワークフロー実装
- **TaskMagic統合**: 定期実行とWebhook連携
- **コスト管理**: 月額3,000円以内での運用
- **評価システム**: RAGAS準拠の品質評価メトリクス（Phase 1-3）

## 📋 技術スタック

- **コア**: Mastra、Midscene.js、TaskMagic
- **バックエンド**: Node.js、TypeScript、Express
- **データベース**: SQLite（本番環境ではPostgreSQL推奨）
- **スクレイピング**: Playwright、Midscene.js
- **評価**: @xenova/transformers（ローカル埋め込み）、natural（NLP）

## 🛠️ セットアップ

### 前提条件

- Node.js 18以上
- npm または yarn
- Git

### インストール

```bash
# リポジトリのクローン
git clone [repository-url]
cd ai-search-monitor

# 依存関係のインストール
npm install

# 環境変数の設定
cp .env.example .env
# .envファイルを編集して必要な値を設定

# データベースの初期化
npm run migrate

# 開発サーバーの起動
npm run dev
```

## 📁 プロジェクト構造

```
ai-search-monitor/
├── src/
│   ├── core/           # コア機能
│   │   ├── mastra/    # Mastraワークフロー
│   │   ├── midscene/  # スクレイピング
│   │   └── taskmagic/ # TaskMagic統合
│   ├── evaluation/    # 評価システム
│   │   ├── phase1/    # 基礎メトリクス
│   │   ├── phase2/    # RAGAS統合
│   │   └── phase3/    # 継続的改善
│   ├── api/          # REST API
│   ├── database/     # データベース層
│   └── utils/        # ユーティリティ
├── tests/           # テスト
├── docker/          # Docker設定
└── docs/           # ドキュメント
```

## 🔧 設定

### ブランド設定

`.env`ファイルで監視するブランドと競合を設定：

```env
BRAND_NAMES=YourBrand,Brand2,Brand3
COMPETITOR_NAMES=Competitor1,Competitor2,Competitor3
```

### レート制限

各プラットフォームのレート制限を調整：

```env
CHATGPT_RATE_LIMIT=10
PERPLEXITY_RATE_LIMIT=20
GEMINI_RATE_LIMIT=15
```

## 📊 評価システム

### Phase 1: 基礎メトリクス
- Faithfulness Score（忠実性）
- Position Strength（位置強度）
- Answer Relevancy（回答関連性）

### Phase 2: RAGAS統合
- Context Precision（文脈精度）
- Hallucination Detection（幻覚検出）
- DeepEval Lite実装

### Phase 3: 継続的改善
- Drift Detection（ドリフト検出）
- Human-in-the-Loop評価
- 自動最適化提案

## 🚦 使用方法

### APIエンドポイント

```bash
# モニタリング実行
POST /api/monitoring/run

# 結果取得
GET /api/monitoring/results/:clientId

# 統計取得
GET /api/monitoring/stats/:clientId
```

### CLIコマンド

```bash
# 手動モニタリング実行
npm run monitor

# データベースクリーンアップ
npm run cleanup

# レポート生成
npm run report
```

## 🧪 テスト

```bash
# 全テスト実行
npm test

# ユニットテストのみ
npm run test:unit

# 統合テスト
npm run test:integration

# E2Eテスト
npm run test:e2e
```

## 📈 パフォーマンス

- **処理能力**: 500件/日
- **API応答時間**: < 500ms
- **メモリ使用量**: < 2GB
- **同時実行**: 最大3スクレイパー

## 💰 コスト管理

- **月額上限**: 3,000円
- **APIコスト追跡**: 自動
- **アラート**: 80%到達時

## 🔒 セキュリティ

- JWT認証
- レート制限
- SQLインジェクション対策
- XSS対策
- CORS設定

## 📝 ライセンス

MIT

## 👥 貢献

プルリクエスト歓迎です。大きな変更の場合は、まずissueを開いて変更内容を議論してください。

## 📞 サポート

問題が発生した場合は、GitHubのissueを作成してください。