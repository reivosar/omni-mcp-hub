const WebSocket = require('ws');

const ws = new WebSocket('ws://localhost:38574/sse');

ws.on('open', function open() {
  console.log('Priority test started!');
  
  // Test which one is prioritized in bundle retrieval
  ws.send(JSON.stringify({
    jsonrpc: '2.0',
    id: 1,
    method: 'tools/call',
    params: {
      name: 'get_source_bundle',
      arguments: {
        source: 'local:/app/test-data'
      }
    }
  }));
});

ws.on('message', function message(data) {
  const response = JSON.parse(data.toString());
  
  if (response.result && response.result.content) {
    const content = response.result.content[0].text;
    console.log('Bundle content:');
    console.log(content);
    
    // Check which one is included
    if (content.includes('daccha')) {
      console.log('Lum is included!');
    }
    if (content.includes('nanoda')) {
      console.log('Rerere no Ojisan is included!');
    }
  }
  
  ws.close();
});

ws.on('error', function error(err) {
  console.error('Error:', err);
});

ws.on('close', function close() {
  console.log('Test completed');
});