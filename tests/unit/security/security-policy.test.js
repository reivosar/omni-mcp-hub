"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
const security_policy_1 = require("../../../src/security/security-policy");
describe('SecurityPolicyManager', () => {
    let policyManager;
    beforeEach(() => {
        security_policy_1.SecurityPolicyManager.instance = null;
        policyManager = security_policy_1.SecurityPolicyManager.getInstance();
    });
    describe('Singleton Pattern', () => {
        test('should return same instance', () => {
            const instance1 = security_policy_1.SecurityPolicyManager.getInstance();
            const instance2 = security_policy_1.SecurityPolicyManager.getInstance();
            expect(instance1).toBe(instance2);
        });
        test('should initialize with default policy', () => {
            const policy = policyManager.getPolicy();
            expect(policy).toEqual(security_policy_1.DEFAULT_SECURITY_POLICY);
        });
    });
    describe('Policy Management', () => {
        test('should update policy partially', () => {
            const updates = {
                sandboxEnabled: false,
                maxArguments: 20
            };
            policyManager.updatePolicy(updates);
            const policy = policyManager.getPolicy();
            expect(policy.sandboxEnabled).toBe(false);
            expect(policy.maxArguments).toBe(20);
            expect(policy.auditEnabled).toBe(security_policy_1.DEFAULT_SECURITY_POLICY.auditEnabled);
        });
        test('should not mutate original policy when getting copy', () => {
            const policy1 = policyManager.getPolicy();
            policy1.sandboxEnabled = false;
            const policy2 = policyManager.getPolicy();
            expect(policy2.sandboxEnabled).toBe(security_policy_1.DEFAULT_SECURITY_POLICY.sandboxEnabled);
        });
    });
    describe('Command Validation', () => {
        test('should allow whitelisted commands', () => {
            const allowedCommands = ['python', 'node', 'npm', 'pip'];
            for (const command of allowedCommands) {
                expect(policyManager.isCommandAllowed(command)).toBe(true);
            }
        });
        test('should block non-whitelisted commands', () => {
            const blockedCommands = ['rm', 'sudo', 'chmod', 'dd', 'curl'];
            for (const command of blockedCommands) {
                expect(policyManager.isCommandAllowed(command)).toBe(false);
            }
        });
        test('should block explicitly blocked commands even if in allowed list', () => {
            policyManager.updatePolicy({
                allowedCommands: [...security_policy_1.DEFAULT_SECURITY_POLICY.allowedCommands, 'rm'],
                blockedCommands: [...security_policy_1.DEFAULT_SECURITY_POLICY.blockedCommands, 'rm']
            });
            expect(policyManager.isCommandAllowed('rm')).toBe(false);
        });
        test('should handle command not in any list', () => {
            expect(policyManager.isCommandAllowed('unknown-command')).toBe(false);
        });
    });
    describe('Path Validation', () => {
        test('should allow paths within project directory', () => {
            const projectPaths = [
                process.cwd(),
                process.cwd() + '/src',
                process.cwd() + '/tests',
                '/tmp/test',
                '/var/tmp/test'
            ];
            for (const path of projectPaths) {
                const isAllowed = policyManager.isPathAllowed(path);
                if (!isAllowed) {
                    console.log('Expected path to be allowed but was blocked:', path);
                    console.log('Resolved path:', require('path').resolve(path));
                }
                expect(isAllowed).toBe(true);
            }
        });
        test('should block system directories', () => {
            const systemPaths = [
                '/etc',
                '/etc/passwd',
                '/bin',
                '/sbin',
                '/usr/bin',
                '/boot',
                '/sys',
                '/proc',
                '/dev',
                '/root'
            ];
            for (const path of systemPaths) {
                expect(policyManager.isPathAllowed(path)).toBe(false);
            }
        });
        test('should handle relative paths correctly', () => {
            const srcPathAllowed = policyManager.isPathAllowed('./src');
            const outsidePathAllowed = policyManager.isPathAllowed('../outside');
            if (!srcPathAllowed) {
                console.log('Expected ./src to be allowed. Resolved to:', require('path').resolve('./src'));
            }
            if (outsidePathAllowed) {
                console.log('Expected ../outside to be blocked. Resolved to:', require('path').resolve('../outside'));
            }
            expect(srcPathAllowed).toBe(true);
            expect(outsidePathAllowed).toBe(false);
        });
        test('should handle path traversal attempts', () => {
            const maliciousPaths = [
                '/tmp/../etc/passwd',
                process.cwd() + '/../../../etc',
                '/var/tmp/../../etc'
            ];
            for (const path of maliciousPaths) {
                expect(policyManager.isPathAllowed(path)).toBe(false);
            }
        });
    });
    describe('Argument Validation', () => {
        test('should allow safe arguments', () => {
            const safeArgs = [
                'test.py',
                '--version',
                '-m',
                'package-name',
                '/tmp/safe/path',
                'value123'
            ];
            const result = policyManager.validateArguments(safeArgs);
            expect(result.valid).toBe(true);
            expect(result.reason).toBeUndefined();
        });
        test('should reject too many arguments', () => {
            const tooManyArgs = new Array(100).fill('arg');
            const result = policyManager.validateArguments(tooManyArgs);
            expect(result.valid).toBe(false);
            expect(result.reason).toContain('Too many arguments');
        });
        test('should block dangerous argument patterns', () => {
            const dangerousArgs = [
                ['rm', '-rf'],
                ['--force'],
                ['test', '>', 'output'],
                ['cmd', '|', 'other'],
                ['test', ';', 'rm'],
                ['$(malicious)'],
                ['`malicious`'],
                ['../../../etc'],
                ['/etc/passwd'],
                ['sudo', 'command'],
                ['curl', 'evil.com']
            ];
            for (const args of dangerousArgs) {
                const result = policyManager.validateArguments(args);
                if (result.valid) {
                    console.log('Expected dangerous args to be blocked but were allowed:', args);
                }
                expect(result.valid).toBe(false);
                expect(result.reason).toContain('blocked pattern');
            }
        });
        test('should reject arguments not matching allowed patterns', () => {
            const invalidArgs = [
                'arg with spaces but no quotes',
                'arg@with!special#chars',
                'arg\nwith\nnewlines'
            ];
            for (const arg of invalidArgs) {
                const result = policyManager.validateArguments([arg]);
                expect(result.valid).toBe(false);
                expect(result.reason).toContain('does not match allowed patterns');
            }
        });
        test('should validate each argument independently', () => {
            const mixedArgs = ['safe-arg', '--force'];
            const result = policyManager.validateArguments(mixedArgs);
            expect(result.valid).toBe(false);
            expect(result.reason).toContain('--force');
        });
    });
    describe('Security Policy Configuration', () => {
        test('should maintain security when updating allowed commands', () => {
            policyManager.updatePolicy({
                allowedCommands: ['python', 'rm', 'sudo', 'dd']
            });
            expect(policyManager.isCommandAllowed('rm')).toBe(false);
            expect(policyManager.isCommandAllowed('sudo')).toBe(false);
            expect(policyManager.isCommandAllowed('dd')).toBe(false);
        });
        test('should handle empty policy updates', () => {
            const originalPolicy = policyManager.getPolicy();
            policyManager.updatePolicy({});
            const newPolicy = policyManager.getPolicy();
            expect(newPolicy).toEqual(originalPolicy);
        });
        test('should validate policy changes maintain security', () => {
            policyManager.updatePolicy({
                blockedCommands: [],
                allowedCommands: ['rm', 'sudo', 'dd']
            });
            const policy = policyManager.getPolicy();
            expect(policy.blockedCommands).toEqual([]);
            expect(policy.allowedCommands).toContain('rm');
            const rmValidation = policyManager.validateArguments(['-rf', '/']);
            expect(rmValidation.valid).toBe(false);
        });
    });
    describe('Edge Cases', () => {
        test('should handle null and undefined inputs', () => {
            expect(policyManager.isCommandAllowed('')).toBe(false);
            expect(policyManager.isPathAllowed('')).toBe(false);
            expect(policyManager.validateArguments([])).toEqual({ valid: true });
        });
        test('should handle special characters in commands', () => {
            const specialCommands = ['python3.9', 'node-v16', 'npm.cmd'];
            for (const command of specialCommands) {
                const isAllowed = security_policy_1.DEFAULT_SECURITY_POLICY.allowedCommands.some(allowed => command.startsWith(allowed));
            }
        });
        test('should handle very long arguments', () => {
            const longArg = 'a'.repeat(10000);
            const result = policyManager.validateArguments([longArg]);
            expect(typeof result.valid).toBe('boolean');
        });
        test('should handle unicode and special encoding', () => {
            const unicodeArgs = ['测试', '🚀', '\u0000', '\x00'];
            for (const arg of unicodeArgs) {
                const result = policyManager.validateArguments([arg]);
                expect(typeof result.valid).toBe('boolean');
            }
        });
    });
    describe('Default Policy Validation', () => {
        test('should have reasonable defaults', () => {
            const policy = security_policy_1.DEFAULT_SECURITY_POLICY;
            expect(policy.allowedCommands.length).toBeGreaterThan(0);
            expect(policy.blockedCommands.length).toBeGreaterThan(0);
            expect(policy.allowedPaths.length).toBeGreaterThan(0);
            expect(policy.blockedPaths.length).toBeGreaterThan(0);
            expect(policy.maxArguments).toBeGreaterThan(0);
            expect(policy.allowedArgumentPatterns.length).toBeGreaterThan(0);
            expect(policy.blockedArgumentPatterns.length).toBeGreaterThan(0);
            expect(policy.sandboxEnabled).toBe(true);
            expect(policy.auditEnabled).toBe(true);
        });
        test('should include essential safe commands', () => {
            const essentialCommands = ['python', 'node', 'npm', 'pip'];
            for (const command of essentialCommands) {
                expect(security_policy_1.DEFAULT_SECURITY_POLICY.allowedCommands).toContain(command);
            }
        });
        test('should block dangerous commands', () => {
            const dangerousCommands = ['rm', 'sudo', 'chmod', 'dd', 'curl', 'wget'];
            for (const command of dangerousCommands) {
                expect(security_policy_1.DEFAULT_SECURITY_POLICY.blockedCommands).toContain(command);
            }
        });
        test('should block system directories', () => {
            const systemDirs = ['/etc', '/bin', '/sbin', '/root'];
            for (const dir of systemDirs) {
                expect(security_policy_1.DEFAULT_SECURITY_POLICY.blockedPaths).toContain(dir);
            }
        });
    });
});
