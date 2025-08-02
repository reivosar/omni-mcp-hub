# Setup Guide

## Prerequisites

- Node.js 18 or higher
- npm or yarn package manager

## Installation Steps

1. **Clone the repository**
   ```bash
   git clone https://github.com/example/sample-project.git
   cd sample-project
   ```

2. **Install dependencies**
   ```bash
   npm install
   ```

3. **Configure environment**
   ```bash
   cp .env.example .env
   # Edit .env with your settings
   ```

4. **Start the application**
   ```bash
   npm start
   ```

## Configuration Options

| Variable | Description | Default |
|----------|-------------|---------|
| PORT | Server port | 3000 |
| NODE_ENV | Environment | development |
| LOG_LEVEL | Logging level | info |

## Troubleshooting

### Common Issues

1. **Port already in use**
   - Change the PORT environment variable
   - Kill the process using the port

2. **Dependencies not installing**
   - Clear npm cache: `npm cache clean --force`
   - Delete node_modules and reinstall

3. **Configuration errors**
   - Verify .env file exists
   - Check all required variables are set