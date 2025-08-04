#!/bin/bash

# Claude App Integration Startup Script
# Usage: ./start.sh [source_type]

set -e

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
PROJECT_ROOT="$(cd "$SCRIPT_DIR/../.." && pwd)"

# Color output
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
NC='\033[0m' # No Color

# Function to configure Claude options
configure_claude_options() {
    echo -e "${BLUE}Claude Configuration${NC}" >&2
    echo "" >&2
    
    # Model selection
    echo -e "${YELLOW}Select Claude Model:${NC}" >&2
    echo -e "  ${GREEN}1)${NC} claude-3-5-sonnet-20241022 (Default - Latest Sonnet)" >&2
    echo -e "  ${GREEN}2)${NC} claude-3-5-haiku-20241022 (Fast and efficient)" >&2
    echo -e "  ${GREEN}3)${NC} claude-3-opus-20240229 (Most capable)" >&2
    echo -e "  ${GREEN}4)${NC} claude-3-sonnet-20240229 (Balanced)" >&2
    echo -e "  ${GREEN}5)${NC} claude-3-haiku-20240307 (Fast)" >&2
    echo "" >&2
    echo -n -e "${BLUE}Select model (1-5, default: 1): ${NC}" >&2
    read -r model_choice
    
    local claude_model=""
    case "${model_choice:-1}" in
        1) claude_model="claude-3-5-sonnet-20241022" ;;
        2) claude_model="claude-3-5-haiku-20241022" ;;
        3) claude_model="claude-3-opus-20240229" ;;
        4) claude_model="claude-3-sonnet-20240229" ;;
        5) claude_model="claude-3-haiku-20240307" ;;
        *) claude_model="claude-3-5-sonnet-20241022" ;;
    esac
    
    # Temperature setting
    echo "" >&2
    echo -e "${YELLOW}Temperature (creativity level):${NC}" >&2
    echo -e "  ${GREEN}0.0${NC} - Very focused and deterministic" >&2
    echo -e "  ${GREEN}0.3${NC} - Slightly creative (Default)" >&2
    echo -e "  ${GREEN}0.7${NC} - Balanced creativity" >&2
    echo -e "  ${GREEN}1.0${NC} - Very creative" >&2
    echo "" >&2
    echo -n -e "${BLUE}Enter temperature (0.0-1.0, default: 0.3): ${NC}" >&2
    read -r temperature_input
    
    local claude_temperature="${temperature_input:-0.3}"
    # Validate temperature
    if ! [[ "$claude_temperature" =~ ^[0-1](\.[0-9]+)?$ ]]; then
        echo -e "${YELLOW}Invalid temperature, using default: 0.3${NC}" >&2
        claude_temperature="0.3"
    fi
    
    # Max tokens
    echo "" >&2
    echo -e "${YELLOW}Max tokens (response length):${NC}" >&2
    echo -e "  ${GREEN}1024${NC} - Short responses" >&2
    echo -e "  ${GREEN}4096${NC} - Medium responses (Default)" >&2
    echo -e "  ${GREEN}8192${NC} - Long responses" >&2
    echo "" >&2
    echo -n -e "${BLUE}Enter max tokens (default: 4096): ${NC}" >&2
    read -r max_tokens_input
    
    local claude_max_tokens="${max_tokens_input:-4096}"
    # Validate max tokens
    if ! [[ "$claude_max_tokens" =~ ^[0-9]+$ ]]; then
        echo -e "${YELLOW}Invalid max tokens, using default: 4096${NC}" >&2
        claude_max_tokens="4096"
    fi
    
    # System prompt
    echo "" >&2
    echo -e "${YELLOW}System Prompt (optional):${NC}" >&2
    echo -e "  ${GREEN}1)${NC} Default (Assistant)" >&2
    echo -e "  ${GREEN}2)${NC} Code Assistant" >&2
    echo -e "  ${GREEN}3)${NC} Documentation Expert" >&2
    echo -e "  ${GREEN}4)${NC} Custom" >&2
    echo "" >&2
    echo -n -e "${BLUE}Select system prompt (1-4, default: 1): ${NC}" >&2
    read -r prompt_choice
    
    local claude_system_prompt=""
    case "${prompt_choice:-1}" in
        1) claude_system_prompt="You are Claude, a helpful AI assistant." ;;
        2) claude_system_prompt="You are an expert code assistant. Help users with programming tasks, code review, debugging, and technical documentation." ;;
        3) claude_system_prompt="You are a documentation expert. Help users create, improve, and understand technical documentation." ;;
        4) 
            echo "" >&2
            echo -n -e "${BLUE}Enter custom system prompt: ${NC}" >&2
            read -r claude_system_prompt
            ;;
        *) claude_system_prompt="You are Claude, a helpful AI assistant." ;;
    esac
    
    # Output configuration
    echo "" >&2
    echo -e "${GREEN}Claude Configuration:${NC}" >&2
    echo -e "  Model: ${YELLOW}$claude_model${NC}" >&2
    echo -e "  Temperature: ${YELLOW}$claude_temperature${NC}" >&2
    echo -e "  Max Tokens: ${YELLOW}$claude_max_tokens${NC}" >&2
    echo -e "  System Prompt: ${YELLOW}${claude_system_prompt:0:50}...${NC}" >&2
    echo "" >&2
    
    # Return configuration as JSON-like string
    printf "MODEL=%s;TEMPERATURE=%s;MAX_TOKENS=%s;SYSTEM_PROMPT=%s" "$claude_model" "$claude_temperature" "$claude_max_tokens" "$claude_system_prompt"
}

# Function to show available source types and let user select
select_source_type() {
    local available_types=()
    
    # Find all directories in the claude-app examples folder
    for dir in "$SCRIPT_DIR"/*/ ; do
        if [ -d "$dir" ]; then
            local dirname=$(basename "$dir")
            # Skip common directories that aren't source types
            if [[ "$dirname" != "dist" && "$dirname" != "node_modules" && "$dirname" != ".git" ]]; then
                # Check if directory contains mcp-sources.yaml
                if [ -f "$dir/mcp-sources.yaml" ]; then
                    available_types+=("$dirname")
                fi
            fi
        fi
    done
    
    if [ ${#available_types[@]} -eq 0 ]; then
        echo -e "${RED}Error: No configuration directories found with mcp-sources.yaml${NC}" >&2
        exit 1
    fi
    
    echo -e "${BLUE}Available source configurations:${NC}" >&2
    echo "" >&2
    
    for i in "${!available_types[@]}"; do
        local type="${available_types[$i]}"
        local desc=""
        case "$type" in
            *github*) desc="GitHub repositories and documentation" ;;
            *local*) desc="Local filesystem directories" ;;
            *mcp*) desc="MCP server integrations" ;;
            *) desc="Custom configuration" ;;
        esac
        echo -e "  ${GREEN}$((i+1)))${NC} ${YELLOW}$type${NC} - $desc" >&2
    done
    
    echo "" >&2
    echo -n -e "${BLUE}Select configuration (1-${#available_types[@]}): ${NC}" >&2
    read -r selection
    
    if ! [[ "$selection" =~ ^[0-9]+$ ]] || [ "$selection" -lt 1 ] || [ "$selection" -gt "${#available_types[@]}" ]; then
        echo -e "${RED}Invalid selection. Please choose a number between 1 and ${#available_types[@]}${NC}" >&2
        exit 1
    fi
    
    local selected_type="${available_types[$((selection-1))]}"
    echo -e "${GREEN}Selected: $selected_type${NC}" >&2
    echo "" >&2
    
    # Return the selected type (this will be captured by the calling code)
    printf "%s" "$selected_type"
}

usage() {
    echo -e "${BLUE}Usage: $0 [source_type]${NC}"
    echo ""
    echo "If no source_type is provided, you will be prompted to select from available configurations."
    echo "In interactive mode, you can also configure Claude options (model, temperature, etc.)."
    echo ""
    echo "Available source types:"
    for dir in "$SCRIPT_DIR"/*/ ; do
        if [ -d "$dir" ] && [ -f "$dir/mcp-sources.yaml" ]; then
            local dirname=$(basename "$dir")
            local desc=""
            case "$dirname" in
                *github*) desc="GitHub repositories and documentation" ;;
                *local*) desc="Local filesystem directories" ;;
                *mcp*) desc="MCP server integrations" ;;
                *) desc="Custom configuration" ;;
            esac
            echo -e "  ${GREEN}$dirname${NC} - $desc"
        fi
    done
    echo ""
    echo -e "${YELLOW}Claude Configuration Options (interactive mode):${NC}"
    echo "  - Model selection (Sonnet, Haiku, Opus)"
    echo "  - Temperature (creativity level)"
    echo "  - Max tokens (response length)"
    echo "  - System prompt (assistant role)"
    echo ""
    echo "Example:"
    echo -e "  ${YELLOW}$0 github_sources${NC}  # Direct selection, default Claude settings"
    echo -e "  ${YELLOW}$0${NC}                 # Interactive selection with Claude configuration"
    exit 1
}

check_dependencies() {
    echo -e "${BLUE}Checking dependencies...${NC}"
    
    # Check if we're in the right directory
    if [ ! -f "$PROJECT_ROOT/package.json" ]; then
        echo -e "${RED}Error: Not in omni-mcp-hub project root${NC}"
        exit 1
    fi
    
    # Check Node.js
    if ! command -v node &> /dev/null; then
        echo -e "${RED}Error: Node.js is not installed${NC}"
        exit 1
    fi
    
    # Check npm dependencies
    if [ ! -d "$PROJECT_ROOT/node_modules" ]; then
        echo -e "${YELLOW}Installing npm dependencies...${NC}"
        cd "$PROJECT_ROOT" && npm install
    fi
}

setup_claude_app_config() {
    local source_type="$1"
    local claude_config="$2"
    local config_path="$SCRIPT_DIR/$source_type/mcp-sources.yaml"
    
    if [ ! -f "$config_path" ]; then
        echo -e "${RED}Error: Configuration file not found: $config_path${NC}"
        exit 1
    fi
    
    # Claude App MCP configuration directory
    local claude_config_dir="$HOME/.config/claude-app"
    local claude_mcp_config="$claude_config_dir/claude_app_config.json"
    
    # Create Claude App config directory if it doesn't exist
    mkdir -p "$claude_config_dir"
    
    # Copy configuration to Claude App
    echo -e "${BLUE}Setting up Claude App integration...${NC}"
    cp "$config_path" "$claude_config_dir/mcp-sources.yaml"
    
    # Create or update Claude Code MCP configuration  
    if [ ! -f "$claude_mcp_config" ]; then
        cat > "$claude_mcp_config" << EOF
{
  "mcpServers": {
    "omni-mcp-hub": {
      "url": "http://localhost:\${PORT:-3000}/sse"
    }
  }
}
EOF
        echo -e "${GREEN}Created Claude App MCP configuration${NC}"
    else
        echo -e "${YELLOW}Claude App MCP configuration already exists${NC}"
        echo -e "${YELLOW}Please manually add omni-mcp-hub server configuration${NC}"
    fi
    
    # Add Claude configuration to environment if provided
    if [ -n "$claude_config" ]; then
        local env_file="$claude_config_dir/.env"
        echo "" > "$env_file"
        echo "# Claude Configuration" >> "$env_file"
        
        # Parse claude_config and add to .env
        IFS=';' read -ra CONFIG_PARTS <<< "$claude_config"
        for part in "${CONFIG_PARTS[@]}"; do
            IFS='=' read -ra KEY_VALUE <<< "$part"
            local key="${KEY_VALUE[0]}"
            local value="${KEY_VALUE[1]}"
            
            case "$key" in
                "MODEL") echo "CLAUDE_MODEL=$value" >> "$env_file" ;;
                "TEMPERATURE") echo "CLAUDE_TEMPERATURE=$value" >> "$env_file" ;;
                "MAX_TOKENS") echo "CLAUDE_MAX_TOKENS=$value" >> "$env_file" ;;
                "SYSTEM_PROMPT") echo "CLAUDE_SYSTEM_PROMPT=\"$value\"" >> "$env_file" ;;
            esac
        done
        
        echo -e "${GREEN}Claude configuration added to .env file${NC}"
    fi
    
    echo -e "${GREEN}Configuration copied to: $claude_config_dir/mcp-sources.yaml${NC}"
}

setup_environment() {
    local source_type="$1"
    local claude_config="$2"
    
    echo -e "${BLUE}Environment setup for $source_type:${NC}"
    
    case "$source_type" in
        "github_sources")
            echo -e "${YELLOW}Required environment variables:${NC}"
            echo -e "  export GITHUB_TOKEN=\"your_github_token_here\""
            echo -e "  export PORT=3000"
            echo ""
            echo -e "${YELLOW}To get a GitHub token:${NC}"
            echo -e "  1. Go to https://github.com/settings/tokens"
            echo -e "  2. Generate new token (classic)"
            echo -e "  3. Select 'public_repo' scope"
            ;;
        "local_sources")
            echo -e "${YELLOW}Optional environment variables:${NC}"
            echo -e "  export PROJECTS_PATH=\"/path/to/your/projects\""
            echo -e "  export DOCS_PATH=\"/path/to/your/docs\""
            echo -e "  export WORKSPACE_PATH=\"/path/to/your/workspace\""
            echo -e "  export PORT=3000"
            ;;
        "mcp_servers")
            echo -e "${YELLOW}Optional environment variables:${NC}"
            echo -e "  export ARXIV_API_KEY=\"your_arxiv_key\"  # For research papers"
            echo -e "  export ALLOWED_PATHS=\"/tmp,/var/tmp\"   # For filesystem access"
            echo -e "  export DATABASE_PATH=\"./data.db\"      # For SQLite operations"
            echo -e "  export PORT=3000"
            ;;
    esac
    echo ""
}

build_project() {
    echo -e "${BLUE}Building project...${NC}"
    cd "$PROJECT_ROOT"
    
    if [ ! -d "dist" ] || [ "src" -nt "dist" ]; then
        npm run build
    else
        echo -e "${GREEN}Project already built${NC}"
    fi
}

start_server() {
    local source_type="$1"
    local claude_config="$2"
    
    echo -e "${BLUE}Starting Omni MCP Hub with $source_type configuration...${NC}"
    
    # Set configuration file
    export CONFIG_FILE="$HOME/.config/claude-app/mcp-sources.yaml"
    
    cd "$PROJECT_ROOT"
    
    echo -e "${GREEN}Server starting...${NC}"
    echo -e "${YELLOW}Configuration: $source_type${NC}"
    echo -e "${YELLOW}Config file: $CONFIG_FILE${NC}"
    if [ -n "$claude_config" ]; then
        echo -e "${YELLOW}Claude options: Configured${NC}"
    fi
    echo ""
    echo -e "${BLUE}To use with Claude App:${NC}"
    echo -e "  1. Restart Claude App application"
    echo -e "  2. The MCP server will start automatically with Claude"
    echo -e "  3. Access aggregated content through Claude's interface"
    echo ""
    echo -e "${YELLOW}Starting in standalone mode for testing...${NC}"
    
    npm start
}

setup_claude_registration() {
    local source_type="$1"
    
    echo ""
    echo -e "${BLUE}Setting up Claude Code MCP configuration...${NC}"
    
    # Create stdio server wrapper in dist directory
    local dist_app_dir="$SCRIPT_DIR/dist"
    mkdir -p "$dist_app_dir"
    local stdio_server="$dist_app_dir/claude-stdio-server.js"
    if [ ! -f "$stdio_server" ]; then
        cat > "$stdio_server" << 'EOF'
#!/usr/bin/env node

// Claude Code Stdio Server Wrapper for Claude App
const path = require('path');

// Configuration for the stdio server
const configPath = process.env.CONFIG_FILE || path.join(process.env.HOME, '.config/claude-app/mcp-sources.yaml');

// Set environment variables
process.env.CONFIG_FILE = configPath;
process.env.NODE_ENV = 'production';

// Start the stdio server
const serverPath = path.join(__dirname, '../../../dist/servers/claude-code-stdio-server.js');
try {
  require(serverPath);
} catch (error) {
  console.error('Failed to start stdio server:', error);
  process.exit(1);
}
EOF
        chmod +x "$stdio_server"
    fi
    
    echo ""
    echo -e "${BLUE}Registering with Claude Code...${NC}"
    
    # Check if claude command is available
    if ! command -v claude &> /dev/null; then
        echo -e "${RED}Error: 'claude' command not found${NC}"
        echo -e "${YELLOW}Please install Claude Code CLI first:${NC}"
        echo -e "  npm install -g @anthropic/claude-code"
        echo ""
        echo -e "${BLUE}Manual registration command:${NC}"
        echo -e "  ${YELLOW}claude mcp add omni-mcp-hub node $stdio_server${NC}"
        return
    fi
    
    # Remove existing registration if it exists
    echo -e "${BLUE}Checking for existing registration...${NC}"
    if claude mcp list 2>/dev/null | grep -q "omni-mcp-hub"; then
        echo -e "${YELLOW}Removing existing omni-mcp-hub registration...${NC}"
        claude mcp remove omni-mcp-hub 2>/dev/null || true
    fi
    
    # Register the MCP server
    echo -e "${BLUE}Registering omni-mcp-hub with Claude Code...${NC}"
    if claude mcp add omni-mcp-hub node "$stdio_server"; then
        echo -e "${GREEN}✅ Successfully registered omni-mcp-hub with Claude Code!${NC}"
        echo ""
        echo -e "${BLUE}Verifying registration:${NC}"
        claude mcp list | grep -A 2 -B 2 "omni-mcp-hub" || true
        echo ""
        echo -e "${GREEN}🎉 Setup complete! You can now use omni-mcp-hub in Claude Code.${NC}"
    else
        echo -e "${RED}❌ Failed to register omni-mcp-hub${NC}"
        echo ""
        echo -e "${BLUE}Manual registration command:${NC}"
        echo -e "  ${YELLOW}claude mcp add omni-mcp-hub node $stdio_server${NC}"
    fi
    
    echo ""
    echo -e "${BLUE}Additional commands:${NC}"
    echo -e "  ${YELLOW}claude mcp list${NC}           - List all registered MCP servers"
    echo -e "  ${YELLOW}claude mcp remove omni-mcp-hub${NC} - Remove this registration"
}

main() {
    echo -e "${GREEN}🚀 Omni MCP Hub - Claude App Integration${NC}"
    echo ""
    
    local source_type=""
    local claude_config=""
    
    if [ "$#" -eq 0 ]; then
        # Interactive mode - let user select source type
        source_type=$(select_source_type)
        
        # Ask if user wants to configure Claude options
        echo -n -e "${BLUE}Configure Claude options? (y/N): ${NC}" >&2
        read -r configure_claude
        
        if [[ "$configure_claude" =~ ^[Yy]$ ]]; then
            claude_config=$(configure_claude_options)
        fi
    else
        # Command line argument provided - parse all arguments
        while [[ $# -gt 0 ]]; do
            case $1 in
                --help|-h|help)
                    usage
                    ;;
                --dangerously-skip-permissions|--*)
                    # Ignore flags
                    shift
                    ;;
                *)
                    # This should be the source type
                    if [ -z "$source_type" ]; then
                        source_type="$1"
                    fi
                    shift
                    ;;
            esac
        done
        
        # If no source type found, show interactive menu
        if [ -z "$source_type" ]; then
            source_type=$(select_source_type)
        fi
        
        # Validate source type
        if [ ! -d "$SCRIPT_DIR/$source_type" ]; then
            echo -e "${RED}Error: Source type '$source_type' not found${NC}"
            echo ""
            echo -e "${YELLOW}Available configurations:${NC}"
            for dir in "$SCRIPT_DIR"/*/ ; do
                if [ -d "$dir" ] && [ -f "$dir/mcp-sources.yaml" ]; then
                    local dirname=$(basename "$dir")
                    echo -e "  - $dirname"
                fi
            done
            exit 1
        fi
        
        if [ ! -f "$SCRIPT_DIR/$source_type/mcp-sources.yaml" ]; then
            echo -e "${RED}Error: Configuration file not found: $SCRIPT_DIR/$source_type/mcp-sources.yaml${NC}"
            exit 1
        fi
    fi
    
    echo -e "${BLUE}Source Type: $source_type${NC}"
    if [ -n "$claude_config" ]; then
        echo -e "${BLUE}Claude Options: Configured${NC}"
    fi
    echo ""
    
    check_dependencies
    setup_claude_app_config "$source_type" "$claude_config"
    setup_environment "$source_type" "$claude_config"
    build_project
    start_server "$source_type" "$claude_config"
    
    # Ask if user wants to register with Claude Code
    echo ""
    echo -n -e "${BLUE}Register with Claude Code now? (Y/n): ${NC}"
    read -r register_claude
    
    if [[ "$register_claude" =~ ^[Nn]$ ]]; then
        echo -e "${YELLOW}Skipping Claude Code registration.${NC}"
        echo ""
        echo -e "${BLUE}To register manually later:${NC}"
        local stdio_server="$SCRIPT_DIR/dist/claude-stdio-server.js"
        echo -e "  ${YELLOW}claude mcp add omni-mcp-hub node $stdio_server${NC}"
    else
        setup_claude_registration "$source_type"
    fi
}

# Handle script interruption
trap 'echo -e "\n${YELLOW}Shutting down...${NC}"; exit 0' INT TERM

main "$@"