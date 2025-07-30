const WebSocket = require('ws');

const ws = new WebSocket('ws://localhost:38574/mcp');

ws.on('open', function open() {
  console.log('分離テスト開始！');
  
  // ソース一覧を取得
  ws.send(JSON.stringify({
    jsonrpc: '2.0',
    id: 1,
    method: 'tools/call',
    params: {
      name: 'list_sources',
      arguments: {}
    }
  }));
});

ws.on('message', function message(data) {
  const response = JSON.parse(data.toString());
  console.log('受信:', response.result?.content?.[0]?.text || JSON.stringify(response, null, 2));
  
  if (response.id === 1) {
    console.log('\nラムちゃんフォルダからCLAUDE.md取得:');
    // ラムちゃんのCLAUDE.mdを取得
    ws.send(JSON.stringify({
      jsonrpc: '2.0',
      id: 2,
      method: 'tools/call',
      params: {
        name: 'get_source_file',
        arguments: {
          source: 'local:/app/test-data/lum',
          file: 'CLAUDE.md'
        }
      }
    }));
  } else if (response.id === 2) {
    console.log('\nれれれのおじさんフォルダからRERERE.md取得:');
    // れれれのおじさんのRERERE.mdを取得
    ws.send(JSON.stringify({
      jsonrpc: '2.0',
      id: 3,
      method: 'tools/call',
      params: {
        name: 'get_source_file',
        arguments: {
          source: 'local:/app/test-data/rerere-ojisan',
          file: 'RERERE.md'
        }
      }
    }));
  } else if (response.id === 3) {
    console.log('\nフォルダ分離テスト完了！');
    ws.close();
  }
});

ws.on('error', function error(err) {
  console.error('エラー:', err);
});

ws.on('close', function close() {
  console.log('テスト終了');
});