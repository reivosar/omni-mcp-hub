const WebSocket = require('ws');

const ws = new WebSocket('ws://localhost:38574/sse');

ws.on('open', function open() {
  console.log('CLAUDE.md test started');
  
  // Get CLAUDE.md variants
  ws.send(JSON.stringify({
    jsonrpc: '2.0',
    id: 1,
    method: 'tools/call',
    params: {
      name: 'get_file_variants',
      arguments: {
        fileName: 'CLAUDE.md'
      }
    }
  }));
});

ws.on('message', function message(data) {
  const response = JSON.parse(data.toString());
  
  if (response.result && response.result.content) {
    console.log('CLAUDE.md variants:');
    console.log(response.result.content[0].text);
  } else {
    console.log('Received:', JSON.stringify(response, null, 2));
  }
  
  ws.close();
});

ws.on('error', function error(err) {
  console.error('Error:', err);
});

ws.on('close', function close() {
  console.log('Test completed');
});