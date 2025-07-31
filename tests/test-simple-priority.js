const WebSocket = require('ws');

const ws = new WebSocket('ws://localhost:38574/sse');

ws.on('open', function open() {
  console.log('Connected successfully');
  
  // Get list of tools
  ws.send(JSON.stringify({
    jsonrpc: '2.0',
    id: 1,
    method: 'tools/list'
  }));
});

ws.on('message', function message(data) {
  const response = JSON.parse(data.toString());
  console.log('Received:', JSON.stringify(response, null, 2));
  ws.close();
});

ws.on('error', function error(err) {
  console.error('Error:', err);
});

ws.on('close', function close() {
  console.log('Disconnected');
});