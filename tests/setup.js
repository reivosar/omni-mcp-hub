"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
const nock_1 = __importDefault(require("nock"));
beforeAll(() => {
    nock_1.default.disableNetConnect();
    nock_1.default.enableNetConnect('127.0.0.1');
});
afterAll(() => {
    nock_1.default.cleanAll();
    nock_1.default.enableNetConnect();
});
afterEach(() => {
    nock_1.default.cleanAll();
});
jest.setTimeout(30000);
process.env.NODE_ENV = 'test';
process.env.GITHUB_TOKEN_TEST = 'test-token';
process.env.GITHUB_WEBHOOK_SECRET_TEST = 'test-webhook-secret';
process.env.CONFIG_PATH = './tests/mcp-sources.test.yaml';
