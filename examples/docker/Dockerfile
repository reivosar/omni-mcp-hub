FROM node:18-alpine

WORKDIR /app

# Install dependencies
COPY package*.json ./
RUN npm ci --only=production

# Copy application code
COPY . .

# Create directory for config
RUN mkdir -p /app/config

# Expose port
EXPOSE 3000

# Run the application
CMD ["npm", "start"]