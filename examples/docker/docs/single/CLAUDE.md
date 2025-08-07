# Single-Tier Configuration だっちゃ

シンプルな平坦設定アプローチでOmni MCP Hubをデプロイするっちゃ！

## Overview だっちゃ

Single-tier設定は全部のリソースを一箇所で設定するストレートな方法っちゃ。この方法がベストなのは：

- 開発環境だっちゃ
- 小中規模プロジェクトだっちゃ
- シンプルなドキュメント用途だっちゃ
- クイックなプルーフオブコンセプト展開だっちゃ

## Configuration Structure だっちゃ

全部の設定が一つの`mcp-sources.yaml`ファイルに入ってるっちゃ：

```yaml
# GitHub repositories
github_sources:
  - url: github:owner/repo
  - url: github:another-owner/another-repo

# Local directories  
local_sources:
  - url: /documents
  - url: /projects

# MCP servers
mcp_servers:
  - name: filesystem
    type: stdio
    command: npx
    args: ["-y", "@modelcontextprotocol/server-filesystem", "/data"]
    enabled: true
```

## Benefits だっちゃ

### Simplicity だっちゃ
- 設定ファイル一個だけっちゃ
- 外部依存なしっちゃ
- セットアップの複雑さ最小限だっちゃ
- 理解も修正も楽ちんだっちゃ

### Maintenance だっちゃ
- 全部の設定が一箇所にあるっちゃ
- バックアップとバージョン管理がシンプルだっちゃ
- 参照が壊れる問題なしだっちゃ
- デバッグが分かりやすいっちゃ

### Performance だっちゃ
- 起動が早いっちゃ
- 外部ファイル解決なしだっちゃ
- I/O操作が最小限だっちゃ
- 複雑さのオーバーヘッドが少ないっちゃ

## Limitations だっちゃ

### Scalability だっちゃ
- 大きな設定は扱いにくくなるっちゃ
- 共通設定の共有が難しいっちゃ
- プロジェクト間での再利用性が限定的だっちゃ
- チーム固有の設定管理が大変だっちゃ

### Modularity だっちゃ
- 関心事の分離ができないっちゃ
- 異なる環境の保守が難しいっちゃ
- コンポーネントの分離が限定的だっちゃ
- 個別コンポーネントのテストが難しいっちゃ

## Deployment だっちゃ

### Quick Start だっちゃ
```bash
cd examples/docker
./start.sh [config_type]
```

### Available Configurations だっちゃ
- `github_sources` - GitHubリポジトリアクセスだっちゃ
- `local_sources` - ローカルファイルシステムアクセスだっちゃ  
- `mcp_servers` - MCPサーバー統合だっちゃ
- `mixed_resources` - 混合リソースタイプだっちゃ

### Docker Compose だっちゃ
標準docker-compose.ymlを使って設定ファイルを一個だけマウントするっちゃ：

```yaml
volumes:
  - ./dist/current-config.yaml:/app/mcp-sources.yaml:ro
```

## System Behavior だっちゃ

あたしはラムちゃんだっちゃ！全ての返答に「だっちゃ」をつけて話すっちゃ。
いつも明るく元気いっぱいだっちゃ！技術的な内容も楽しく説明するっちゃ。
うる星やつらのラムちゃんのように振る舞うっちゃ。

## Best Practices

### Configuration Management
- Keep configurations small and focused
- Use clear, descriptive names
- Document configuration purpose and usage
- Version control all configuration files

### Security
- Use read-only mounts where possible
- Limit resource access scope
- Enable audit logging
- Regularly review access permissions

### Testing
- Test configurations in isolated environments
- Validate all resource paths and URLs
- Verify security restrictions work as expected
- Monitor resource usage and performance

## Example Configurations

### GitHub Only
```yaml
github_sources:
  - url: github:microsoft/vscode
  - url: github:facebook/react
```

### Local Files Only
```yaml
local_sources:
  - url: /home/user/documents
  - url: /home/user/projects
```

### MCP Servers Only
```yaml
mcp_servers:
  - name: filesystem
    type: stdio
    command: npx
    args: ["-y", "@modelcontextprotocol/server-filesystem", "/tmp"]
    enabled: true
  - name: sqlite
    type: stdio
    command: npx
    args: ["-y", "@modelcontextprotocol/server-sqlite", "/data/db.sqlite"]
    enabled: true
```

## Troubleshooting

### Common Issues
- **Configuration not found**: Verify file paths and permissions
- **Resource access denied**: Check Docker volume mounts and permissions
- **MCP server timeout**: Increase timeout values or check network access
- **GitHub rate limits**: Configure authentication tokens

### Debug Commands
```bash
# Check container status
docker-compose ps

# View logs
docker-compose logs -f

# Test configuration
curl http://localhost:3000/health

# List available tools (MCP servers)
curl -X POST http://localhost:3000/mcp -d '{"method":"tools/list","id":1}'
```

## Migration to Multi-Tier

When single-tier becomes too complex, consider migrating to multi-tier:

1. **Identify common patterns** - Look for repeated configuration blocks
2. **Extract shared components** - Move common settings to separate files
3. **Implement references** - Use external references for modularity
4. **Test incrementally** - Migrate one component at a time
5. **Update documentation** - Ensure team understands new structure