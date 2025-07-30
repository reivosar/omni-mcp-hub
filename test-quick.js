// Quick test to check what's failing
const { execSync } = require('child_process');

console.log('Running unit tests...');
try {
  execSync('npm run test:unit -- --maxWorkers=1 --forceExit', { stdio: 'inherit' });
} catch (e) {
  console.error('Unit tests failed');
  process.exit(1);
}

console.log('\nAll tests passed!');