# Claude Code MCP接続設定

## 📁 ファイル一覧

- `claude-config-example.json` - Claude Code用MCP設定ファイル
- `start.sh` - ワンコマンド起動スクリプト
- `lum-behavior.md` - ラムちゃん風AI設定
- `pirate-behavior.md` - 海賊風AI設定
- `special-behavior.md` - 関西弁AI設定
- `CLAUDE.md` - 標準AI設定

## 🚀 超簡単セットアップ

### ワンコマンド起動
```bash
./examples/start.sh
```

### Claude Code でテスト
新しいターミナルで：
```bash
cd /Users/mac/workspace/omni-mcp-hub
claude
```

テストコマンド：
```bash
/use add a:5 b:3
/use echo message:"Hello MCP!"
```

## 🧪 CLAUDE.md機能テスト

### ラムちゃん設定適用
```bash
/use load_claude_config filePath:"./examples/lum-behavior.md" profileName:"lum"
/use apply_claude_behavior profileName:"lum"
```

適用後に質問すると、ラムちゃんの話し方で回答されます：
- 語尾に「だっちゃ」
- 一人称「うち」
- 「ダーリン」呼び

### 海賊設定適用
```bash
/use load_claude_config filePath:"./examples/pirate-behavior.md" profileName:"pirate"
/use apply_claude_behavior profileName:"pirate"
```

### 関西弁設定適用
```bash
/use load_claude_config filePath:"./examples/special-behavior.md" profileName:"kansai"
/use apply_claude_behavior profileName:"kansai"
```

## 📋 利用可能コマンド

### 基本ツール
- `add` - 数値計算
- `echo` - メッセージエコー

### CLAUDE.md管理
- `find_claude_files` - CLAUDE.mdファイル検索
- `load_claude_config` - 設定ファイル読み込み
- `get_claude_behavior` - 現在の設定表示
- `apply_claude_behavior` - 振る舞い適用
- `list_claude_profiles` - プロファイル一覧
- `update_claude_config` - 設定更新

### リソースアクセス
- `@omni-mcp-hub:info://server` - サーバー情報
- `@omni-mcp-hub:claude://profile/{name}` - プロファイル情報

## 🔍 トラブルシューティング

### MCPサーバーが認識されない
1. Claude Codeを再起動
2. 設定ファイルのパスを確認
3. MCPサーバーが起動していることを確認

### ツールが動作しない
1. `/use` コマンドの構文を確認
2. MCPサーバーのログを確認
3. プロジェクトが正しくビルドされているか確認

### CLAUDE.md設定が反映されない
1. ファイルパスが正しいか確認
2. プロファイル名を確認
3. `apply_claude_behavior` が実行されているか確認