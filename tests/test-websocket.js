const WebSocket = require('ws');

const ws = new WebSocket('ws://localhost:38574/sse');

ws.on('open', function open() {
  console.log('Connected to MCP server');
  
  // Initialize
  ws.send(JSON.stringify({
    jsonrpc: '2.0',
    id: 1,
    method: 'initialize',
    params: {}
  }));
});

ws.on('message', function message(data) {
  const response = JSON.parse(data.toString());
  console.log('Received:', JSON.stringify(response, null, 2));
  
  if (response.id === 1) {
    // After initialize, list tools
    ws.send(JSON.stringify({
      jsonrpc: '2.0',
      id: 2,
      method: 'tools/list'
    }));
  } else if (response.id === 2) {
    // After tools list, list sources
    ws.send(JSON.stringify({
      jsonrpc: '2.0',
      id: 3,
      method: 'tools/call',
      params: {
        name: 'list_sources',
        arguments: {}
      }
    }));
  } else if (response.id === 3) {
    // After sources list, get a file
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
    console.log('Test completed successfully!');
    ws.close();
  }
});

ws.on('error', function error(err) {
  console.error('WebSocket error:', err);
});

ws.on('close', function close() {
  console.log('Disconnected from MCP server');
});