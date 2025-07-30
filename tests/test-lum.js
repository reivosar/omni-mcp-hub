const WebSocket = require('ws');

const ws = new WebSocket('ws://localhost:38574/mcp');

ws.on('open', function open() {
  console.log('ラムちゃんサーバーに接続だっちゃ〜！');
  
  // ファイル一覧を取得
  ws.send(JSON.stringify({
    jsonrpc: '2.0',
    id: 1,
    method: 'tools/call',
    params: {
      name: 'list_source_files',
      arguments: {
        source: 'local:/app/test-data'
      }
    }
  }));
});

ws.on('message', function message(data) {
  const response = JSON.parse(data.toString());
  console.log('ラムちゃんからの返事:', response.result?.content?.[0]?.text || JSON.stringify(response, null, 2));
  
  if (response.id === 1) {
    console.log('\n次はCLAUDE.mdを取得するっちゃ！');
    // CLAUDE.mdを取得
    ws.send(JSON.stringify({
      jsonrpc: '2.0',
      id: 2,
      method: 'tools/call',
      params: {
        name: 'get_source_file',
        arguments: {
          source: 'local:/app/test-data',
          file: 'CLAUDE.md'
        }
      }
    }));
  } else if (response.id === 2) {
    console.log('\n次はREADME.mdも見るっちゃ！');
    // README.mdを取得
    ws.send(JSON.stringify({
      jsonrpc: '2.0',
      id: 3,
      method: 'tools/call',
      params: {
        name: 'get_source_file',
        arguments: {
          source: 'local:/app/test-data',
          file: 'README.md'
        }
      }
    }));
  } else if (response.id === 3) {
    console.log('\n最後にAPI文書も見るっちゃ！');
    // API文書を取得
    ws.send(JSON.stringify({
      jsonrpc: '2.0',
      id: 4,
      method: 'tools/call',
      params: {
        name: 'get_source_file',
        arguments: {
          source: 'local:/app/test-data',
          file: 'docs/api.md'
        }
      }
    }));
  } else if (response.id === 4) {
    console.log('\nラムちゃんとのやり取り完了だっちゃ〜！');
    ws.close();
  }
});

ws.on('error', function error(err) {
  console.error('エラーだっちゃ:', err);
});

ws.on('close', function close() {
  console.log('またねだっちゃ〜！');
});