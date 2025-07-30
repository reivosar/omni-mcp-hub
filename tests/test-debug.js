const WebSocket = require('ws');

const ws = new WebSocket('ws://localhost:38574/mcp');

ws.on('open', function open() {
  console.log('デバッグテスト開始');
  
  // 個別にlumフォルダのREADME.mdを取得
  ws.send(JSON.stringify({
    jsonrpc: '2.0',
    id: 1,
    method: 'tools/call',
    params: {
      name: 'get_source_file',
      arguments: {
        source: 'local:/app/test-data/lum',
        file: 'README.md'
      }
    }
  }));
});

ws.on('message', function message(data) {
  const response = JSON.parse(data.toString());
  
  if (response.id === 1) {
    console.log('lumフォルダのREADME.md内容:');
    if (response.result && response.result.content) {
      console.log(response.result.content[0].text);
    } else {
      console.log('エラー:', JSON.stringify(response, null, 2));
    }
    
    // 次にrerere-ojisanフォルダをテスト
    ws.send(JSON.stringify({
      jsonrpc: '2.0',
      id: 2,
      method: 'tools/call',
      params: {
        name: 'get_source_file',
        arguments: {
          source: 'local:/app/test-data/rerere-ojisan',
          file: 'README.md'
        }
      }
    }));
  } else if (response.id === 2) {
    console.log('\nrerere-ojisanフォルダのREADME.md内容:');
    if (response.result && response.result.content) {
      console.log(response.result.content[0].text);
    } else {
      console.log('エラー:', JSON.stringify(response, null, 2));
    }
    ws.close();
  }
});

ws.on('error', function error(err) {
  console.error('エラー:', err);
});

ws.on('close', function close() {
  console.log('デバッグ終了');
});