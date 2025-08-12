#!/bin/bash

# Omni MCP Hub - セットアップスクリプト
# 使い方: ./examples/start.sh

set -e

GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
RED='\033[0;31m'
NC='\033[0m'

PROJECT_DIR="/Users/mac/workspace/omni-mcp-hub"

echo -e "${BLUE}🔧 Omni MCP Hub セットアップ${NC}"
echo ""

cd "$PROJECT_DIR"

# 1. ビルド
echo -e "${YELLOW}1. プロジェクトをビルド中...${NC}"
npm run build
echo -e "${GREEN}✅ ビルド完了${NC}"
echo ""

# 2. Claude Code MCP設定
echo -e "${YELLOW}2. Claude Code設定中...${NC}"
cat > ~/.claude.json << 'EOF'
{
  "mcpServers": {
    "omni-mcp-hub": {
      "command": "node",
      "args": ["/Users/mac/workspace/omni-mcp-hub/dist/index.js"],
      "description": "Omni MCP Hub - CLAUDE.md configuration manager",
      "env": {}
    }
  }
}
EOF
echo -e "${GREEN}✅ ~/.claude.json に設定を保存${NC}"
echo ""

# 3. Claude Code起動
echo -e "${YELLOW}3. Claude Code起動中...${NC}"
echo ""
echo -e "${GREEN}🎉 セットアップ完了！Claude Codeを起動します...${NC}"
echo ""
echo -e "${BLUE}使用可能なコマンド:${NC}"
echo "   /use add a:5 b:3"
echo "   /use echo message:\"Hello MCP!\""
echo "   /use find_claude_files directory:\"./examples\""
echo "   /use load_claude_config filePath:\"./examples/lum-behavior.md\" profileName:\"lum\""
echo "   /use apply_claude_behavior profileName:\"lum\""
echo ""

# 4. ラムちゃん設定ファイルを表示
echo -e "${YELLOW}4. ラムちゃん設定ファイル表示中...${NC}"
echo ""
if [ -f "./examples/lum-behavior.md" ]; then
    cat ./examples/lum-behavior.md
    echo -e "${GREEN}✅ ラムちゃん設定ファイル読み込み完了${NC}"
else
    echo -e "${RED}❌ ラムちゃん設定ファイルが見つかりません: ./examples/lum-behavior.md${NC}"
fi
echo ""

# Claude Code起動
exec claude