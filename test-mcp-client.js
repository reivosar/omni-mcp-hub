// Test client for MCP SSE server compatibility
const fetch = require('node-fetch');

async function testMCPServer() {
  console.log('Testing MCP SSE Server...');
  
  const request = {
    jsonrpc: '2.0',
    id: 1,
    method: 'fetch_idosal_git-mcp_documentation',
    params: {
      owner: 'idosal',
      repo: 'git-mcp',
      branch: 'main',
      include_externals: true
    }
  };

  try {
    const response = await fetch('http://localhost:3000/sse', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Accept': 'application/json, text/event-stream',
        'MCP-Protocol-Version': '2025-06-18'
      },
      body: JSON.stringify(request)
    });

    console.log('Response status:', response.status);
    console.log('Response headers:', Object.fromEntries(response.headers.entries()));

    if (response.body) {
      const reader = response.body.getReader();
      const decoder = new TextDecoder();
      
      let buffer = '';
      
      while (true) {
        const { done, value } = await reader.read();
        
        if (done) {
          console.log('Stream ended');
          break;
        }
        
        buffer += decoder.decode(value, { stream: true });
        
        // Process complete SSE messages
        const lines = buffer.split('\n');
        buffer = lines.pop() || ''; // Keep incomplete line in buffer
        
        let currentEvent = null;
        let currentData = '';
        
        for (const line of lines) {
          if (line.startsWith('event: ')) {
            currentEvent = line.substring(7);
          } else if (line.startsWith('data: ')) {
            currentData = line.substring(6);
          } else if (line === '' && currentEvent && currentData) {
            // Complete SSE message
            try {
              const message = JSON.parse(currentData);
              console.log('Received message:', JSON.stringify(message, null, 2));
              
              // Check if this is the final response
              if (message.id === 1 && message.result) {
                console.log('Received final response, test complete');
                return;
              }
            } catch (e) {
              console.error('Failed to parse SSE data:', currentData);
            }
            
            currentEvent = null;
            currentData = '';
          }
        }
      }
    }
  } catch (error) {
    console.error('Test failed:', error);
  }
}

// Also test GET request
async function testMCPServerInfo() {
  console.log('\nTesting server info endpoint...');
  
  try {
    const response = await fetch('http://localhost:3000/sse', {
      method: 'GET',
      headers: {
        'Accept': 'text/event-stream'
      }
    });

    console.log('GET Response status:', response.status);
    
    if (response.body) {
      const reader = response.body.getReader();
      const decoder = new TextDecoder();
      
      let buffer = '';
      
      while (true) {
        const { done, value } = await reader.read();
        
        if (done) break;
        
        buffer += decoder.decode(value, { stream: true });
        console.log('Server info stream:', buffer);
        break; // Just get the first message
      }
    }
  } catch (error) {
    console.error('Server info test failed:', error);
  }
}

// Run tests
if (require.main === module) {
  testMCPServerInfo()
    .then(() => testMCPServer())
    .catch(console.error);
}