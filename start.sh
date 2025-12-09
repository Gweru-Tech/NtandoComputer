#!/bin/bash

# Ntando Computer - Startup Script for Render.com

set -e

echo "🚀 Starting Ntando Computer..."

# Set environment variables
export NODE_ENV=production
export PORT=${PORT:-10000}

# Create necessary directories
mkdir -p uploads logs

# Install dependencies if needed
if [ ! -d "node_modules" ]; then
    echo "📦 Installing dependencies..."
    npm install --only=production
fi

if [ ! -d "backend/node_modules" ]; then
    echo "📦 Installing backend dependencies..."
    cd backend && npm install --only=production && cd ..
fi

# Start the server
echo "🌟 Starting server on port $PORT..."
exec node backend/server.js