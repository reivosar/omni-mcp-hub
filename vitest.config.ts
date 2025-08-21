import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    globals: true,
    environment: 'node',
    env: {
      NODE_ENV: 'test'
    },
    // プロセス管理設定 - ゾンビプロセス防止
    testTimeout: 60000, // 60秒でテストタイムアウト
    teardownTimeout: 10000, // 10秒でteardownタイムアウト
    hookTimeout: 15000, // 15秒でhookタイムアウト
    fileParallelism: false, // ファイル並列実行を無効化してプロセス制御
    maxWorkers: 1, // ワーカー数を1に制限
    minWorkers: 1,
    // カバレッジ設定
    coverage: {
      provider: 'v8',
      reporter: ['text', 'json', 'html'],
      exclude: [
        'node_modules/',
        'dist/',
        'examples/',
        '*.config.ts',
        'tests/**/*.test.ts'
      ],
      // カバレッジプロセスも制御
      reportsDirectory: './coverage',
      cleanOnRerun: true
    },
    include: ['tests/**/*.test.ts'],
    exclude: ['node_modules', 'dist'],
    // プロセス監視とクリーンアップ
    pool: 'forks',
    poolOptions: {
      forks: {
        singleFork: true, // 単一フォークでプロセス制御
        isolate: true
      }
    },
    // ファイル監視除外でリソース節約
    watchExclude: [
      '**/node_modules/**',
      '**/dist/**',
      '**/coverage/**',
      '**/.git/**'
    ],
    // エラー時即座に終了
    bail: 1,
    // メモリリーク防止
    logHeapUsage: true
  }
});