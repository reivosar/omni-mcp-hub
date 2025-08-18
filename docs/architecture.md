# Omni MCP Hub Architecture

## System Architecture Overview

```mermaid
graph TB
    subgraph "Client Layer"
        CC[Claude Code]
    end

    subgraph "Omni MCP Hub Core"
        Server[OmniMCPServer]
        Server --> Init[Initialize]
        Init --> YamlConfig[YAML Config Manager]
        Init --> ConfigLoader[Config Loader]
        Init --> ProxyManager[MCP Proxy Manager]
        
        subgraph "Tool Handlers"
            TH[ToolHandlers]
            TH --> CLAUDE[CLAUDE.md Tools]
            TH --> Proxy[Proxied Tools]
        end

        subgraph "Resource Handlers"
            RH[ResourceHandlers]
            RH --> ConfigRes[Config Resources]
            RH --> InfoRes[Info Resources]
        end
    end

    subgraph "External MCP Servers"
        Serena[Serena MCP]
        Filesystem[Filesystem MCP]
        LocalFiles[Local-files MCP]
    end

    subgraph "Storage Layer"
        YamlFile[omni-config.yaml]
        ClaudeFiles[*.md Files]
    end

    CC -->|MCP Protocol| Server
    Server --> TH
    Server --> RH
    ProxyManager --> Serena
    ProxyManager --> Filesystem
    ProxyManager --> LocalFiles
    YamlConfig --> YamlFile
    ConfigLoader --> ClaudeFiles
```

## Initialization Flow

```mermaid
sequenceDiagram
    participant Main as index.ts
    participant Server as OmniMCPServer
    participant Yaml as YamlConfigManager
    participant Loader as ConfigurationLoader
    participant Proxy as MCPProxyManager
    participant Tools as ToolHandlers

    Main->>Server: new OmniMCPServer()
    Main->>Server: run()
    
    Server->>Server: initialize()
    Server->>Yaml: loadYamlConfig()
    Yaml->>Yaml: Find omni-config.yaml
    Yaml-->>Server: Config loaded
    
    Server->>Loader: loadConfiguration()
    Loader->>Loader: Load autoLoad profiles
    Loader->>Loader: Scan for CLAUDE.md files
    Loader-->>Server: Profiles loaded
    
    Server->>Proxy: initializeExternalServers()
    Proxy->>Proxy: Connect to Serena
    Proxy->>Proxy: Connect to Filesystem
    Proxy->>Proxy: Connect to Local-files
    Proxy-->>Server: Servers connected
    
    Server->>Tools: setupHandlers()
    Tools->>Tools: Register CLAUDE.md tools
    Tools->>Tools: Register proxied tools
    Tools-->>Server: Handlers ready
    
    Server->>Server: stdio.start()
    Server-->>Main: Server running
```

## Tool Request Flow

```mermaid
flowchart LR
    User[User] -->|Command| Claude[Claude Code]
    Claude -->|MCP Request| Hub[Omni MCP Hub]
    
    Hub --> Decision{Tool Type?}
    
    Decision -->|CLAUDE.md Tool| LocalHandler[Local Handler]
    LocalHandler --> FileSystem[File System]
    FileSystem -->|Profile Data| LocalHandler
    LocalHandler -->|Response| Hub
    
    Decision -->|External Tool| ProxyManager[Proxy Manager]
    ProxyManager --> ExtServer[External MCP Server]
    ExtServer -->|Tool Result| ProxyManager
    ProxyManager -->|Response| Hub
    
    Hub -->|MCP Response| Claude
    Claude -->|Result| User
```

## Configuration Loading Flow

```mermaid
flowchart TD
    Start([Start]) --> CheckYaml{omni-config.yaml exists?}
    
    CheckYaml -->|Yes| LoadYaml[Load YAML Config]
    CheckYaml -->|No| UseDefaults[Use Default Config]
    
    LoadYaml --> CheckAutoLoad{autoLoad profiles?}
    UseDefaults --> CheckAutoLoad
    
    CheckAutoLoad -->|Yes| LoadProfiles[Load Profiles]
    CheckAutoLoad -->|No| CheckFileSettings{fileSettings configured?}
    
    LoadProfiles --> ApplyProfiles{autoApply: true?}
    ApplyProfiles -->|Yes| ApplyBehavior[Apply Behavior]
    ApplyProfiles -->|No| StoreProfile[Store Profile]
    
    ApplyBehavior --> CheckFileSettings
    StoreProfile --> CheckFileSettings
    
    CheckFileSettings -->|Yes| EnableClaude[Enable CLAUDE.md Tools]
    CheckFileSettings -->|No| CheckExternal{External servers?}
    
    EnableClaude --> CheckExternal
    CheckExternal -->|Yes| ConnectServers[Connect External Servers]
    CheckExternal -->|No| Ready([Ready])
    
    ConnectServers --> AggregateTools[Aggregate Tools]
    AggregateTools --> Ready
```

## Component Relationships

```mermaid
classDiagram
    class OmniMCPServer {
        -server: Server
        -yamlConfigManager: YamlConfigManager
        -claudeConfigManager: ClaudeConfigManager
        -proxyManager: MCPProxyManager
        +run()
        +initialize()
        +cleanup()
    }
    
    class YamlConfigManager {
        -config: YamlConfig
        -configPath: string
        +loadYamlConfig()
        +getConfig()
        +saveYamlConfig()
    }
    
    class ConfigurationLoader {
        -yamlConfigManager: YamlConfigManager
        -claudeConfigManager: ClaudeConfigManager
        +loadConfiguration()
        +loadProfilesFromYaml()
        +autoScanProfiles()
    }
    
    class MCPProxyManager {
        -clients: Map
        -aggregatedTools: Map
        +addServer()
        +removeServer()
        +callTool()
        +getConnectedServers()
    }
    
    class ToolHandlers {
        -server: Server
        -claudeConfigManager: ClaudeConfigManager
        -activeProfiles: Map
        -proxyManager: MCPProxyManager
        +setupHandlers()
        +handleApplyClaudeConfig()
        +handleListClaudeConfigs()
    }
    
    class PathResolver {
        -workspaceRoot: string
        +resolveProfilePath()
        +generateProfilePaths()
        +getYamlConfigPath()
    }
    
    OmniMCPServer --> YamlConfigManager
    OmniMCPServer --> ConfigurationLoader
    OmniMCPServer --> MCPProxyManager
    OmniMCPServer --> ToolHandlers
    ConfigurationLoader --> YamlConfigManager
    ToolHandlers --> MCPProxyManager
    ToolHandlers --> PathResolver
```

## Error Handling Flow

```mermaid
flowchart TD
    Request[Tool Request] --> TryCatch{Try Execute}
    
    TryCatch -->|Success| Process[Process Tool]
    Process --> CheckProxy{Is Proxy Tool?}
    
    CheckProxy -->|Yes| ProxyCall[Call External Server]
    CheckProxy -->|No| LocalCall[Execute Locally]
    
    ProxyCall --> ProxyResult{Success?}
    LocalCall --> LocalResult{Success?}
    
    ProxyResult -->|Yes| ReturnSuccess[Return Result]
    ProxyResult -->|No| ProxyError[Log Proxy Error]
    
    LocalResult -->|Yes| ReturnSuccess
    LocalResult -->|No| LocalError[Log Local Error]
    
    TryCatch -->|Error| CatchError[Catch Error]
    CatchError --> LogError[Log Error]
    LogError --> ReturnError[Return Error Response]
    
    ProxyError --> ReturnError
    LocalError --> ReturnError
```

## Data Flow

```mermaid
graph LR
    subgraph Input
        YamlConfig[omni-config.yaml]
        MDFiles[*.md Files]
        ExtServers[External Servers]
    end
    
    subgraph Processing
        Parser[Config Parser]
        ProfileMgr[Profile Manager]
        ProxyMgr[Proxy Manager]
    end
    
    subgraph Storage
        ActiveProfiles[Active Profiles Map]
        ToolRegistry[Tool Registry]
        ResourceRegistry[Resource Registry]
    end
    
    subgraph Output
        MCPResponse[MCP Response]
        Logs[Log Files]
    end
    
    YamlConfig --> Parser
    MDFiles --> Parser
    Parser --> ProfileMgr
    ProfileMgr --> ActiveProfiles
    
    ExtServers --> ProxyMgr
    ProxyMgr --> ToolRegistry
    
    ActiveProfiles --> MCPResponse
    ToolRegistry --> MCPResponse
    ResourceRegistry --> MCPResponse
    
    Parser --> Logs
    ProfileMgr --> Logs
    ProxyMgr --> Logs
```