# Test Coverage Improvement Plan - Prioritized by Risk × Frequency

## P0 (最優先で増やすべき)

### CLI一式が未カバー
- `src/cli/secrets-scan-cli.ts (0%)`
- `src/cli/profile-admin.ts (0%)` 
- `src/cli/admin-ui.ts (19.5%)`

**リスク**: 本番で一番触られる入口。引数解析/exit code/STDOUT/STDERR、ファイルパス解決、--help/--version、エラー時の非ゼロ終了。

**追加テスト例**:
```bash
node dist/cli/secrets-scan-cli --path fixtures --format json # スナップショット
# 不正引数 → usage表示＋exit 2
# I/O失敗（読取不能ディレクトリ）→ エラーメッセージ＋exit 1
```

### MCPプロキシの安定性
- `mcp-proxy/manager.ts (61.19%)`
- `mcp-proxy/client.ts (94.53% 未カバー143-162)`

**リスク**: 外部サーバ接続の再試行・バックオフ・部分失敗時の劣化運転。

**追加テスト例**:
- 片方接続不可→利用可能ツールのみ列挙
- 再接続成功→イベント発火/ツール再登録
- SSE/WS切断→自動再接続（行範囲389-414想定）

## P1 (高優先)

### 起動・終了のライフサイクル
- `index.ts (78.84% 未カバー274-292)`

**リスク**: 設定欠落/ポート使用中/部分初期化失敗、SIGTERM/SIGINTでクリーンシャットダウン。

**追加テスト例**:
- ポート衝突 → プロセス非ゼロ終了＆明確なログ
- SIGTERM送信→HTTP閉鎖/タイマ停止/ファイルウォッチ解放

### スキーママイグレーションの穴
- `utils/schema-version-manager.ts (43.96%)`

**リスク**: 後方互換・段階的移行・不正バージョン。

**追加テスト例**:
- vN→vN+1 正常/欠落キー補完/unknownフィールドのdrop or warn
- 不正version→バリデーションエラー
- ダウングレード禁止の確認（353-400付近）

### 監査ログ/監視の重要分岐
- `security/audit-logging.ts (79.02%)`
- `monitoring/monitoring-server.ts (88.76%)`
- `monitoring/metrics-collector.ts (96.88% 未カバー555-560)`

**追加テスト例**:
- 重要イベント（apply/rollback）で必須フィールド(ts, actor, hash, result)がJSONで出る
- /metricsのPrometheus整形、ヘルス→ready=trueの条件到達
- 例外時のエラーカウンタ増分

### 署名検証の否定経路
- `security/signature-verification.ts (92.38%)`

**追加テスト例**:
- 署名不正/鍵フォーマット不正/タイムスタンプ期限切れ/アルゴ非許可 → 明示的なエラー型

### ファイル周りの境界
- `utils/file-scanner.ts (88.79%)`
- `utils/path-security.ts (97.64%)`
- `utils/path-resolver.ts (85.43%)`

**追加テスト例**:
- include vs excludeの優先順位（exclude勝ち）
- ルート越境 ../../ → 拒否、シンボリックリンク越境
- Windows/UNC/正規化・大文字小文字差（111-132付近）

## P2 (中優先・落とし穴系)

### RBAC/Permissionの否定分岐
- `security/rbac.ts (86.13%)`
- `security/permission-validator.ts (96.42%)`

**リスク**: 親ロールはOKだが子ロールはNG/未知権限/環境依存の拒否

### Rate Limiterの限界ケース
- `security/rate-limiter.ts (90.76%)`

**リスク**: 限界値±1/ウィンドウ切替/リセット時の漏れ

### secure-communication
- `security/secure-communication.ts (85.34%)`

**リスク**: TLSピン不一致/自己署名/タイムアウト/リトライ上限

### resources/tools handlers
- `resources/handlers.ts (88.42%)`
- `tools/handlers.ts (81.61%)`

**リスク**: リソース未発見/型不一致/キャンセル（AbortController）

### config系
- `config/loader.ts (87.73%)`
- `config/yaml-config.ts (88.73%)`

**リスク**: 環境変数上書きの優先順位/additionalProperties:false違反/default適用

### エラー系ユーティリティ
- `utils/error-handler.ts (90.59%)`
- `utils/process-error-handler.ts (99.42% 未カバー219)`

**リスク**: 未指定cause/再スロー/プロセス終了パス

## Quick Wins（すぐ効く型での穴埋め）

### 0%/低率ファイルの最小スモーク
各CLIに**--helpで0 exit**、あり得る最短の正常系1ケース、代表的異常系1ケース（合計3本）

### クリティカル否定経路1本ずつ
- ポート衝突テスト
- ファイル境界の"../../ & symlink escape"
- 1本でルート外禁止の仕様を固定

## テスト実装の小技（Vitest想定）

### 子プロセスでCLI検証
```typescript
import { execa } from 'execa';

it('--help ok', async () => {
  const { stdout, exitCode } = await execa('node', ['dist/cli/secrets-scan-cli.js', '--help']);
  expect(exitCode).toBe(0);
  expect(stdout).toMatch(/Usage:/);
});

it('invalid arg → exit 2', async () => {
  await expect(execa('node', ['dist/cli/secrets-scan-cli.js', '--bad']))
    .rejects.toMatchObject({ exitCode: 2 });
});
```

### HTTP/TLS/時間系/FS
- HTTP/TLSをundici/mswでモック（タイムアウト・ピン不一致）
- 時間系はvi.setSystemTime・vi.useFakeTimers
- FSはmemfsやtmpdir（権限エラー・不可視ファイル）

## まとめ

**足りてないところの一般論**:
- **入口（CLI/HTTPミドルウェア）と否定経路（失敗系）とライフサイクル（起動/終了）**が薄い
- 越境/署名の"セキュア境界"でBad pathを埋めると、実害リスクが一気に下がる
- まずは CLI 0% → 最低3ケース/各、ルート越境テスト の2点セットから着手がコスパ高い

## 実装優先順序

1. **P0 CLI一式**: secrets-scan-cli, profile-admin, admin-ui の基本テスト
2. **P0 MCPプロキシ**: 接続失敗・再試行・部分失敗のテスト
3. **P1 ライフサイクル**: 起動失敗・終了処理のテスト
4. **P1 パス境界**: ディレクトリ越境・シンボリックリンクのテスト
5. **P1 監査ログ**: 重要イベントの必須フィールド出力テスト