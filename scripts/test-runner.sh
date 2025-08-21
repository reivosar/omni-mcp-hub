#!/bin/bash

# テスト実行スクリプト
# 引数をvitestに渡してからクリーンアップ

echo "🧪 Running tests with arguments: $@"

# Vitestを実行
vitest run --reporter=verbose "$@"
TEST_EXIT_CODE=$?

# プロセスクリーンアップ
./scripts/cleanup-test-processes.sh

# 元の終了コードを返す
exit $TEST_EXIT_CODE