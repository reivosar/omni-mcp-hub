# Changelog

All notable changes to this project will be documented in this file.

## [Unreleased]

### Added
- Claude Code Engineering Guide MCP Integration
- GitHub client for fetching markdown files
- Comprehensive test coverage improvements (85%+ on core modules)
- Input sanitization and validation system
- Audit logging with tamper evidence
- Secure communication with TLS/mTLS support
- Process management and zombie process prevention
- Resource handlers for engineering guide access
- MCP proxy manager with retry logic and error handling

### Security
- Secrets scanning CLI with multiple pattern detection
- SQL injection, XSS, and command injection prevention
- Rate limiting and DoS protection
- Execution sandbox for safe code execution
- Comprehensive input validation and sanitization

### Testing
- 838 passing tests across all modules
- 98.61% coverage on input-sanitization module
- 90%+ coverage on core security modules
- Process cleanup automation
- Mock implementations for external dependencies

### Infrastructure  
- TypeScript strict mode compliance
- ESLint configuration and automated fixes
- Automated process management scripts
- Test runner with proper argument handling

## [1.0.0] - 2025-08-21

### Added
- Initial release of Omni MCP Hub
- Basic MCP server functionality
- Configuration management
- Profile-based operation
- Security foundations