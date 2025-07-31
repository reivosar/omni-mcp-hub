const WebSocket = require('ws');

const ws = new WebSocket('ws://localhost:38574/sse');

ws.on('open', function open() {
  console.log('Connected to MCP server');
  
  // List sources
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
  console.log('Received:', JSON.stringify(response, null, 2));
  
  if (response.id === 1) {
    // List files in GitHub repo
    ws.send(JSON.stringify({
      jsonrpc: '2.0',
      id: 2,
      method: 'tools/call',
      params: {
        name: 'list_source_files',
        arguments: {
          source: 'github:anthropics/claude-code'
        }
      }
    }));
  } else if (response.id === 2) {
    // Get README.md from GitHub repo
    ws.send(JSON.stringify({
      jsonrpc: '2.0',
      id: 3,
      method: 'tools/call',
      params: {
        name: 'get_source_file',
        arguments: {
          source: 'github:anthropics/claude-code',
          file: 'README.md'
        }
      }
    }));
  } else if (response.id === 3) {
    console.log('GitHub test completed!');
    ws.close();
  }
});

ws.on('error', function error(err) {
  console.error('WebSocket error:', err);
});

ws.on('close', function close() {
  console.log('Disconnected');
});