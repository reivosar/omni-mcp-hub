FROM node:18-alpine

WORKDIR /app

# Install git for cloning repositories
RUN apk add --no-cache git

# Copy package files
COPY package*.json ./

# Install all dependencies (needed for build)
RUN npm ci

# Copy application code
COPY . .

# Copy test data
COPY test-data /app/test-data

# Build TypeScript
RUN npm run build

# Create directory for cloned repositories
RUN mkdir -p /app/repos

# Expose MCP WebSocket port
EXPOSE 38574

CMD ["npm", "start"]