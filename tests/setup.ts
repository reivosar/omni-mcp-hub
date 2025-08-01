// Jest setup file
import nock from 'nock';

// Configure nock for HTTP mocking
beforeAll(() => {
  // Don't allow real HTTP requests during tests
  nock.disableNetConnect();
  // Allow connections to localhost for integration tests
  nock.enableNetConnect('127.0.0.1');
});

afterAll(() => {
  nock.cleanAll();
  nock.enableNetConnect();
});

afterEach(() => {
  nock.cleanAll();
});

// Global test timeout
jest.setTimeout(30000);

// Mock environment variables for config.yaml substitution
process.env.NODE_ENV = 'test';
process.env.GITHUB_TOKEN_TEST = 'test-token';
process.env.GITHUB_WEBHOOK_SECRET_TEST = 'test-webhook-secret';

// Set config path for tests
process.env.CONFIG_PATH = './tests/config.test.yaml';