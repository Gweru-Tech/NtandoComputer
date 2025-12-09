# Ntando Computer - Multi-stage Docker build
FROM node:18-alpine AS base

# Install dependencies needed for the build
RUN apk add --no-cache \
    python3 \
    make \
    g++ \
    git \
    curl \
    unzip

# Set working directory
WORKDIR /app

# Backend build stage
FROM base AS backend-build

# Copy backend package files
COPY backend/package*.json ./

# Install backend dependencies
RUN npm ci --only=production

# Copy backend source code
COPY backend/ .

# CLI build stage  
FROM base AS cli-build

# Copy CLI package files
COPY cli/package*.json ./

# Install CLI dependencies
RUN npm ci --only=production

# Copy CLI source code
COPY cli/ .

# Production stage
FROM node:18-alpine AS production

# Install runtime dependencies
RUN apk add --no-cache \
    curl \
    unzip \
    pm2

# Create app directory
WORKDIR /app

# Copy backend from build stage
COPY --from=backend-build /app .
COPY --from=cli-build /app/cli ./cli

# Create uploads directory with proper permissions
RUN mkdir -p /app/uploads && chown -R node:node /app

# Create non-root user
RUN addgroup -g 1001 -S nodejs && \
    adduser -S nodejs -u 1001

# Copy frontend files
COPY index.html styles.css script.js ./

# Install global CLI
RUN npm install -g ./cli

# Create PM2 ecosystem file
RUN echo '{\n  "apps": [{\n    "name": "ntando-computer",\n    "script": "backend/server.js",\n    "instances": "max",\n    "exec_mode": "cluster",\n    "env": {\n      "NODE_ENV": "production",\n      "PORT": 3000\n    },\n    "error_file": "/app/logs/err.log",\n    "out_file": "/app/logs/out.log",\n    "log_file": "/app/logs/combined.log",\n    "time": true\n  }]\n}' > ecosystem.config.js

# Create logs directory
RUN mkdir -p logs && chown -R nodejs:nodejs logs

# Switch to non-root user
USER nodejs

# Expose port
EXPOSE 3000

# Health check
HEALTHCHECK --interval=30s --timeout=3s --start-period=5s --retries=3 \
    CMD curl -f http://localhost:3000/api/health || exit 1

# Start the application with PM2
CMD ["pm2-runtime", "start", "ecosystem.config.js"]