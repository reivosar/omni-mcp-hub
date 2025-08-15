# Docker Local Resources Test with Lum-chan

Dockerコンテナ内でラムちゃん設定をテストするための専用環境です。

## Quick Start

```bash
# ラムちゃんDockerテスト実行
./examples/docker-test/local-resources/start.sh

# インタラクティブモード（推奨）
./examples/docker-test/local-resources/start.sh --interactive --verbose

# デバッグ用シェルアクセス
./examples/docker-test/local-resources/start.sh --shell
```

## 特徴

### 🐳 **Docker統合**
- ラムちゃん設定が自動でロードされる
- local-resourcesディレクトリが適切にマウントされる
- MCPツールでキャラクター設定が利用可能

### 💖 **ラムちゃん設定**
- `lum-behavior.md`が自動適用される
- 「だっちゃ」口調でのAI応答
- うる星やつらキャラクター設定完全再現

### 🧪 **テスト機能**
- コンテナヘルスチェック
- 設定ファイル検証
- マウント確認
- MCPツール動作テスト

## 使用方法

### 基本テスト
```bash
./examples/docker-test/local-resources/start.sh
```

### インタラクティブモード
```bash
./examples/docker-test/local-resources/start.sh --interactive
```
MCPツールの動作をシミュレートして表示します。

### シェルアクセス
```bash
./examples/docker-test/local-resources/start.sh --shell
```
コンテナ内でデバッグやファイル確認ができます。

### 詳細ログ
```bash
./examples/docker-test/local-resources/start.sh --verbose
```
全ての動作ログを表示します。

## ファイル構成

```
examples/docker-test/local-resources/
├── start.sh           # メインテストスクリプト
├── omni-config.yaml   # ラムちゃん用設定
└── README.md          # このファイル
```

## 設定詳細

### omni-config.yaml
- **autoLoad**: ラムちゃん設定を自動ロード
- **defaultProfile**: "lum"に設定
- **includePaths**: local-resourcesディレクトリを含む
- **logging**: デバッグレベルで詳細ログ

### ラムちゃん設定
- **一人称**: うち
- **語尾**: だっちゃ
- **性格**: 愛らしく時々わがまま
- **特徴**: 宇宙人視点、電撃能力

## テスト例

```bash
$ ./examples/docker-test/local-resources/start.sh --interactive

💖 Lum-chan Docker Test だっちゃ！
======================================
📂 Working directory: /Users/mac/workspace/omni-mcp-hub
🛑 Cleaning up existing containers...
💝 Preparing Lum-chan configuration だっちゃ...
✨ Starting container with Lum-chan powers だっちゃ！
⏰ Waiting for Lum-chan to wake up だっちゃ...
✅ Lum-chan container is running だっちゃ〜♪
🧪 Testing Lum-chan configuration だっちゃ...
Testing container health だっちゃ...
✅ Container health check passed だっちゃ！
Testing Lum-chan configuration loading だっちゃ...
✅ Lum-chan config file found だっちゃ！
Testing examples directory mount だっちゃ...
✅ Examples directory mounted correctly だっちゃ！
Testing Lum-chan behavior file だっちゃ...
✅ Lum-chan behavior file found だっちゃ〜♪

💬 Interactive mode with Lum-chan だっちゃ〜♪
🔧 Simulating MCP tool calls だっちゃ...

Tool: apply_claude_config profileName:"lum"
Response: Successfully loaded Lum-chan configuration だっちゃ〜♪
Auto-applying profile 'lum'... うちはラムだっちゃ！

🎉 Lum-chan Docker test completed だっちゃ〜♪
```

## トラブルシューティング

### コンテナが起動しない
```bash
# ログを確認
docker-compose -f docker/docker-compose.yml logs omni-mcp-hub

# 強制クリーンアップ
docker-compose -f docker/docker-compose.yml down --volumes
```

### 設定ファイルが見つからない
```bash
# パスを確認
./examples/docker-test/local-resources/start.sh --shell
# コンテナ内で
ls -la /app/examples/local-resources/
```

### MCPツールが動作しない
- Claude Codeとの統合が必要
- MCP server設定を確認
- ポート設定を確認

## Claude Code統合

1. **コンテナ起動**
   ```bash
   ./examples/docker-test/local-resources/start.sh
   ```

2. **Claude Code設定**
   ```json
   {
     "mcpServers": {
       "omni-mcp-hub": {
         "command": "docker-compose",
         "args": ["-f", "docker/docker-compose.yml", "exec", "omni-mcp-hub", "node", "dist/index.js"],
         "description": "Omni MCP Hub with Lum-chan"
       }
     }
   }
   ```

3. **ツール使用**
   ```
   /use apply_claude_config profileName:"lum"
   /use list_claude_configs
   /use get_applied_config
   ```

ラムちゃんがDockerで完璧に動作するだっちゃ〜♪