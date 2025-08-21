#!/bin/bash

# テストプロセス監視スクリプト
# プロセスのゾンビ化を監視して自動クリーンアップ

MONITOR_INTERVAL=5  # 5秒間隔で監視
MAX_RUNTIME=300     # 5分でタイムアウト

echo "🔍 Starting test process monitor..."
echo "📊 Monitoring interval: ${MONITOR_INTERVAL}s"
echo "⏰ Max runtime: ${MAX_RUNTIME}s"

start_time=$(date +%s)

while true; do
    current_time=$(date +%s)
    elapsed=$((current_time - start_time))
    
    # 最大実行時間チェック
    if [ $elapsed -gt $MAX_RUNTIME ]; then
        echo "⏰ Maximum runtime exceeded, forcing cleanup..."
        ./scripts/cleanup-test-processes.sh
        break
    fi
    
    # Vitestプロセスチェック
    vitest_count=$(ps aux | grep -E "(vitest|tsx.*test)" | grep -v grep | wc -l)
    node_test_count=$(ps aux | grep -E "node.*test" | grep -v grep | wc -l)
    
    if [ $vitest_count -gt 0 ] || [ $node_test_count -gt 0 ]; then
        echo "📊 [$(date '+%H:%M:%S')] Vitest: $vitest_count, Node tests: $node_test_count (${elapsed}s elapsed)"
        
        # 異常に多いプロセスをチェック
        if [ $vitest_count -gt 3 ] || [ $node_test_count -gt 5 ]; then
            echo "⚠️  Warning: Too many test processes detected!"
            echo "🧹 Initiating emergency cleanup..."
            ./scripts/cleanup-test-processes.sh
        fi
    else
        echo "✅ No test processes running, monitoring complete"
        break
    fi
    
    sleep $MONITOR_INTERVAL
done

echo "🔍 Process monitoring completed"