FROM node:24-alpine3.21 AS builder

WORKDIR /app

# Install git for cloning repositories
RUN apk add --no-cache git

# Copy package files
COPY package*.json ./

# Install all dependencies (needed for build)
RUN npm ci

# Install MCP SDK for unified mode support
RUN npm install @modelcontextprotocol/sdk

# Copy application code
COPY . .

# Build TypeScript
RUN npm run build

# Production stage
FROM node:24-alpine3.21

WORKDIR /app

# Update packages for security
RUN apk update && apk upgrade && apk add --no-cache git

# Copy package files
COPY package*.json ./

# Install only production dependencies
RUN npm ci --omit=dev

# Install MCP SDK for production unified mode support
RUN npm install @modelcontextprotocol/sdk

# Copy built application from builder
COPY --from=builder /app/dist ./dist

# Copy necessary files
COPY mcp-sources.yaml.example ./

# Create directory for cloned repositories
RUN mkdir -p /app/repos

# Create non-root user
RUN addgroup -g 1001 -S nodejs && adduser -S nodejs -u 1001

# Change ownership
RUN chown -R nodejs:nodejs /app

# Switch to non-root user
USER nodejs

# Default to unified mode for maximum compatibility
ENV MCP_MODE=unified

CMD ["node", "dist/servers/server.js"]