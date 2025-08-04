"use strict";
var __createBinding = (this && this.__createBinding) || (Object.create ? (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    var desc = Object.getOwnPropertyDescriptor(m, k);
    if (!desc || ("get" in desc ? !m.__esModule : desc.writable || desc.configurable)) {
      desc = { enumerable: true, get: function() { return m[k]; } };
    }
    Object.defineProperty(o, k2, desc);
}) : (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    o[k2] = m[k];
}));
var __setModuleDefault = (this && this.__setModuleDefault) || (Object.create ? (function(o, v) {
    Object.defineProperty(o, "default", { enumerable: true, value: v });
}) : function(o, v) {
    o["default"] = v;
});
var __importStar = (this && this.__importStar) || (function () {
    var ownKeys = function(o) {
        ownKeys = Object.getOwnPropertyNames || function (o) {
            var ar = [];
            for (var k in o) if (Object.prototype.hasOwnProperty.call(o, k)) ar[ar.length] = k;
            return ar;
        };
        return ownKeys(o);
    };
    return function (mod) {
        if (mod && mod.__esModule) return mod;
        var result = {};
        if (mod != null) for (var k = ownKeys(mod), i = 0; i < k.length; i++) if (k[i] !== "default") __createBinding(result, mod, k[i]);
        __setModuleDefault(result, mod);
        return result;
    };
})();
Object.defineProperty(exports, "__esModule", { value: true });
const local_handler_1 = require("../../src/handlers/local-handler");
const path = __importStar(require("path"));
async function testLocalHandler() {
    console.log('Testing LocalHandler...');
    const testDataPath = path.join(__dirname, '../../test-data');
    const handler = new local_handler_1.LocalHandler();
    try {
        await handler.initialize(testDataPath);
        console.log('Initialized:', handler.getSourceInfo());
        const files = await handler.listFiles();
        console.log('Found files:', files);
        const claudeContent = await handler.getFile('CLAUDE.md');
        console.log('CLAUDE.md content:');
        console.log(claudeContent);
        const patterns = ['CLAUDE.md', 'README.md'];
        const multipleFiles = await handler.getFiles(patterns);
        console.log('Multiple files:', Array.from(multipleFiles.keys()));
        const nonExistent = await handler.getFile('nonexistent.md');
        console.log('Non-existent file:', nonExistent);
    }
    catch (error) {
        console.error('Error:', error);
    }
}
testLocalHandler();
