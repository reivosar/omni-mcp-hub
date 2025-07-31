const WebSocket = require('ws');

const ws = new WebSocket('ws://localhost:38574/sse');

ws.on('open', function open() {
  console.log('れれれのおじさんサーバーに接続なのだ〜！');
  
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
  console.log('れれれのおじさんからの返事:', response.result?.content?.[0]?.text || JSON.stringify(response, null, 2));
  
  if (response.id === 1) {
    console.log('\n次はれれれのおじさんドキュメントを取得するのだ！');
    // RERERE.mdを取得
    ws.send(JSON.stringify({
      jsonrpc: '2.0',
      id: 2,
      method: 'tools/call',
      params: {
        name: 'get_source_file',
        arguments: {
          source: 'local:/app/test-data',
          file: 'RERERE.md'
        }
      }
    }));
  } else if (response.id === 2) {
    console.log('\n次はマニュアルも見るのだ！');
    // マニュアルを取得
    ws.send(JSON.stringify({
      jsonrpc: '2.0',
      id: 3,
      method: 'tools/call',
      params: {
        name: 'get_source_file',
        arguments: {
          source: 'local:/app/test-data',
          file: 'rerere/manual.md'
        }
      }
    }));
  } else if (response.id === 3) {
    console.log('\n最後にラムちゃんとの比較をするのだ！');
    // ラムちゃんのCLAUDE.mdも取得
    ws.send(JSON.stringify({
      jsonrpc: '2.0',
      id: 4,
      method: 'tools/call',
      params: {
        name: 'get_source_file',
        arguments: {
          source: 'local:/app/test-data',
          file: 'CLAUDE.md'
        }
      }
    }));
  } else if (response.id === 4) {
    console.log('\nバカモンめ〜、全部のファイルチェック完了なのだ〜！');
    ws.close();
  }
});

ws.on('error', function error(err) {
  console.error('エラーなのだ〜:', err);
});

ws.on('close', function close() {
  console.log('また来るのだ〜、バカモンめ〜！');
});