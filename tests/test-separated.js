const WebSocket = require('ws');

const ws = new WebSocket('ws://localhost:38574/sse');

ws.on('open', function open() {
  console.log('Separation test started!');
  
  // Get source list
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
  console.log('Received:', response.result?.content?.[0]?.text || JSON.stringify(response, null, 2));
  
  if (response.id === 1) {
    console.log('\nGetting CLAUDE.md from Lum folder:');
    // Get Lum's CLAUDE.md
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
    console.log('\nGetting RERERE.md from Rerere no Ojisan folder:');
    // Get Rerere no Ojisan's RERERE.md
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
    console.log('\nFolder separation test completed!');
    ws.close();
  }
});

ws.on('error', function error(err) {
  console.error('Error:', err);
});

ws.on('close', function close() {
  console.log('Test finished');
});