const WebSocket = require('ws');

const ws = new WebSocket('ws://localhost:38574/sse');

ws.on('open', function open() {
  console.log('Debug test started');
  
  // Get README.md from lum folder individually
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
    console.log('lum folder README.md content:');
    if (response.result && response.result.content) {
      console.log(response.result.content[0].text);
    } else {
      console.log('Error:', JSON.stringify(response, null, 2));
    }
    
    // Next, test rerere-ojisan folder
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
    console.log('\nrerere-ojisan folder README.md content:');
    if (response.result && response.result.content) {
      console.log(response.result.content[0].text);
    } else {
      console.log('Error:', JSON.stringify(response, null, 2));
    }
    ws.close();
  }
});

ws.on('error', function error(err) {
  console.error('Error:', err);
});

ws.on('close', function close() {
  console.log('Debug finished');
});