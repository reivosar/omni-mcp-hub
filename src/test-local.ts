import { LocalHandler } from './handlers/local-handler';
import * as path from 'path';

async function testLocalHandler() {
  console.log('Testing LocalHandler...');
  
  const testDataPath = path.join(__dirname, '../test-data');
  const handler = new LocalHandler();
  
  try {
    // Initialize
    await handler.initialize(testDataPath);
    console.log('Initialized:', handler.getSourceInfo());
    
    // List files
    const files = await handler.listFiles();
    console.log('Found files:', files);
    
    // Get specific file
    const claudeContent = await handler.getFile('CLAUDE.md');
    console.log('CLAUDE.md content:');
    console.log(claudeContent);
    
    // Get multiple files
    const patterns = ['CLAUDE.md', 'README.md'];
    const multipleFiles = await handler.getFiles(patterns);
    console.log('Multiple files:', Array.from(multipleFiles.keys()));
    
    // Try non-existent file
    const nonExistent = await handler.getFile('nonexistent.md');
    console.log('Non-existent file:', nonExistent);
    
  } catch (error) {
    console.error('Error:', error);
  }
}

testLocalHandler();