# Contributing to Omni MCP Hub

## Getting Started

### Prerequisites
- Node.js 20+
- npm or yarn
- Git

### Setup
```bash
git clone https://github.com/reivosar/omni-mcp-hub.git
cd omni-mcp-hub
npm install
npm run build
```

### Running Tests
```bash
# Run all tests
npm test

# Run specific test file
npm test -- tests/input-sanitization.test.ts

# Run with coverage
npm run test:coverage

# Clean up test processes
npm run test:cleanup
```

## Development Guidelines

### Code Style
- Use TypeScript strict mode
- Follow ESLint rules: `npm run lint`
- Format code: `npm run lint:fix`
- Write comprehensive tests (aim for 90%+ coverage)

### Security Requirements
- Never commit secrets or API keys
- Use input sanitization for all external data
- Implement proper authentication/authorization
- Add security tests for sensitive functionality

### Testing Requirements
- All new features must include tests
- Security-related code requires comprehensive test coverage
- Use descriptive test names and organize in logical groups
- Mock external dependencies properly

### Pull Request Process
1. Create feature branch: `git checkout -b feature/your-feature-name`
2. Make changes with tests
3. Run full test suite: `npm test`
4. Ensure no TypeScript errors: `npm run build`
5. Run linter: `npm run lint`
6. Commit with clear messages
7. Push and create PR

### Commit Message Format
```
type(scope): description

body (optional)

footer (optional)
```

Types: feat, fix, docs, style, refactor, test, chore

### Security Considerations
- Run security scan: `npm run scan:secrets`
- Review security-related changes carefully
- Document security implications
- Test authentication/authorization thoroughly

## Issue Reporting
- Use clear, descriptive titles
- Provide steps to reproduce bugs
- Include error messages and stack traces
- Specify Node.js and npm versions
- Label appropriately (bug, enhancement, security, etc.)

## Questions?
Open an issue or contact @reivosar