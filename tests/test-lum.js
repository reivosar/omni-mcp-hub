const WebSocket = require('ws');

const ws = new WebSocket('ws://localhost:38574/sse');

ws.on('open', function open() {
  console.log('Connected to Lum server!');
  
  // Get file list
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
  console.log('Response from Lum:', response.result?.content?.[0]?.text || JSON.stringify(response, null, 2));
  
  if (response.id === 1) {
    console.log('\nNext, getting CLAUDE.md!');
    // Get CLAUDE.md
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
    console.log('\nNext, looking at README.md too!');
    // Get README.md
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
    console.log('\nFinally, looking at API documentation!');
    // Get API documentation
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
    console.log('\nInteraction with Lum completed!');
    ws.close();
  }
});

ws.on('error', function error(err) {
  console.error('Error:', err);
});

ws.on('close', function close() {
  console.log('See you later!');
});