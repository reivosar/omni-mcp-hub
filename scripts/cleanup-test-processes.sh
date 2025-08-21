#!/bin/bash

# テストプロセスクリーンアップスクリプト
# Vitestプロセスのゾンビ化を防ぐ

echo "🧹 Cleaning up test processes..."

# Vitestプロセスを検索して強制終了
VITEST_PIDS=$(ps aux | grep -E "(vitest|tsx.*test)" | grep -v grep | awk '{print $2}')

if [ -n "$VITEST_PIDS" ]; then
    echo "🔍 Found Vitest processes: $VITEST_PIDS"
    for pid in $VITEST_PIDS; do
        echo "💀 Killing process $pid"
        kill -9 "$pid" 2>/dev/null || true
    done
    echo "✅ Vitest processes cleaned up"
else
    echo "✅ No Vitest processes found"
fi

# Node.jsテストプロセスもクリーンアップ
NODE_TEST_PIDS=$(ps aux | grep -E "node.*test|node.*coverage" | grep -v grep | awk '{print $2}')

if [ -n "$NODE_TEST_PIDS" ]; then
    echo "🔍 Found Node test processes: $NODE_TEST_PIDS"
    for pid in $NODE_TEST_PIDS; do
        echo "💀 Killing process $pid"
        kill -9 "$pid" 2>/dev/null || true
    done
    echo "✅ Node test processes cleaned up"
else
    echo "✅ No Node test processes found"
fi

# 残存しているテスト関連プロセスをチェック
REMAINING=$(ps aux | grep -E "(vitest|tsx.*test|node.*test)" | grep -v grep | wc -l)

if [ "$REMAINING" -gt 0 ]; then
    echo "⚠️  Warning: $REMAINING test processes still running"
    ps aux | grep -E "(vitest|tsx.*test|node.*test)" | grep -v grep
else
    echo "✅ All test processes cleaned up successfully"
fi

echo "🧹 Process cleanup completed"