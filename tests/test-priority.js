const WebSocket = require('ws');

const ws = new WebSocket('ws://localhost:38574/sse');

ws.on('open', function open() {
  console.log('優先順位テスト開始！');
  
  // バンドル取得でどちらが優先されるかテスト
  ws.send(JSON.stringify({
    jsonrpc: '2.0',
    id: 1,
    method: 'tools/call',
    params: {
      name: 'get_source_bundle',
      arguments: {
        source: 'local:/app/test-data'
      }
    }
  }));
});

ws.on('message', function message(data) {
  const response = JSON.parse(data.toString());
  
  if (response.result && response.result.content) {
    const content = response.result.content[0].text;
    console.log('バンドル内容:');
    console.log(content);
    
    // どちらが含まれているかチェック
    if (content.includes('だっちゃ')) {
      console.log('ラムちゃんが含まれています！');
    }
    if (content.includes('なのだ')) {
      console.log('れれれのおじさんが含まれています！');
    }
  }
  
  ws.close();
});

ws.on('error', function error(err) {
  console.error('エラー:', err);
});

ws.on('close', function close() {
  console.log('テスト完了');
});