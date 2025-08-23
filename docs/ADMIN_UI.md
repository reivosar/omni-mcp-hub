# Admin UI Documentation

The Omni MCP Hub includes a comprehensive administrative interface for managing profiles and system configuration.

## Admin UI Commands

### Interactive Mode

Launch the interactive admin interface:

```bash
npm run admin
# or
omni-admin
```

### Status Command

View system status:

```bash
npm run admin:status
# or
omni-admin status
```

## Features

### Profile Management

- **List Profiles**: View all configured profiles with status, tags, and modification dates
- **Add Profile**: Create new profiles with validation and tagging
- **Edit Profile**: Modify profile descriptions, tags, and activation status
- **Remove Profile**: Safely remove profiles with confirmation
- **Validate Profile**: Check file integrity and CLAUDE.md format compliance

### Import/Export

- **Import Profiles**: Load profiles from JSON backup files
- **Export Profiles**: Create JSON backups of all profile configurations

### System Status

- View total and active profile counts
- Monitor YAML-managed vs manually configured profiles
- Check configuration file paths and system health

## Profile Properties

Each profile supports the following properties:

- **Name**: Unique identifier for the profile
- **Path**: File system path to the CLAUDE.md file
- **Description**: Optional description of the profile's purpose
- **Tags**: Categorization labels (development, production, testing, experimental, custom)
- **Active**: Whether the profile is currently active
- **Checksum**: File integrity verification hash
- **Timestamps**: Creation and modification dates

## Navigation

The interactive UI uses:

- Arrow keys to navigate menu options
- Enter to select
- Spacebar to toggle checkboxes
- Ctrl+C to exit at any time

## Integration

The Admin UI integrates with:

- **YAML Configuration**: Automatically detects profiles from `omni-config.yaml`
- **Legacy Config**: Manages `.mcp-config.json` profiles
- **File Validation**: Uses ClaudeConfigManager for format validation
- **Path Resolution**: Supports relative and absolute path handling

## CLI Alternatives

For non-interactive use, see:

- `npm run profile:admin` - Legacy profile admin CLI
- Direct configuration file editing
- YAML configuration management

## Error Handling

The Admin UI provides:

- Input validation with helpful error messages
- File existence and accessibility checks
- Format validation for CLAUDE.md files
- Graceful handling of configuration file issues

## Security

- All file operations validate paths and permissions
- Checksum verification detects unauthorized modifications
- No sensitive data is displayed in plain text
- Configuration files are validated before processing