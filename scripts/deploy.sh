#!/bin/bash

# Ntando Computer - Deployment Script
# This script deploys the platform to Render.com or any Node.js hosting

set -e

# Colors for output
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
NC='\033[0m' # No Color

# Configuration
APP_NAME="ntando-computer"
REPO_URL="https://github.com/ntando-computer/platform.git"
BRANCH="main"
BUILD_DIR="build"

# Logging function
log() {
    echo -e "${GREEN}[$(date +'%Y-%m-%d %H:%M:%S')] $1${NC}"
}

error() {
    echo -e "${RED}[$(date +'%Y-%m-%d %H:%M:%S')] ERROR: $1${NC}"
    exit 1
}

warning() {
    echo -e "${YELLOW}[$(date +'%Y-%m-%d %H:%M:%S')] WARNING: $1${NC}"
}

info() {
    echo -e "${BLUE}[$(date +'%Y-%m-%d %H:%M:%S')] INFO: $1${NC}"
}

# Check dependencies
check_dependencies() {
    log "Checking dependencies..."
    
    if ! command -v node &> /dev/null; then
        error "Node.js is not installed. Please install Node.js 18 or higher."
    fi
    
    if ! command -v npm &> /dev/null; then
        error "npm is not installed. Please install npm."
    fi
    
    if ! command -v git &> /dev/null; then
        error "Git is not installed. Please install Git."
    fi
    
    NODE_VERSION=$(node -v | cut -d'v' -f2 | cut -d'.' -f1)
    if [ "$NODE_VERSION" -lt 18 ]; then
        error "Node.js version 18 or higher is required. Current version: $(node -v)"
    fi
    
    log "Dependencies check passed ✓"
}

# Setup environment
setup_environment() {
    log "Setting up environment..."
    
    if [ ! -f ".env" ]; then
        warning ".env file not found. Creating from .env.example..."
        cp .env.example .env
        warning "Please update the .env file with your configuration before proceeding."
        read -p "Press Enter to continue after updating .env file..."
    fi
    
    # Load environment variables
    export $(grep -v '^#' .env | xargs)
    
    log "Environment setup completed ✓"
}

# Install dependencies
install_dependencies() {
    log "Installing dependencies..."
    
    # Install backend dependencies
    info "Installing backend dependencies..."
    cd backend
    npm install --production
    cd ..
    
    # Install CLI dependencies
    info "Installing CLI dependencies..."
    cd cli
    npm install --production
    cd ..
    
    # Install CLI globally
    npm install -g ./cli
    
    log "Dependencies installation completed ✓"
}

# Build application
build_application() {
    log "Building application..."
    
    # Create build directory
    mkdir -p $BUILD_DIR
    
    # Copy frontend files
    cp index.html styles.css script.js $BUILD_DIR/
    
    # Copy backend files
    cp -r backend $BUILD_DIR/
    
    # Copy CLI files
    cp -r cli $BUILD_DIR/
    
    # Copy configuration files
    cp render.yaml docker-compose.yml Dockerfile $BUILD_DIR/
    
    # Copy scripts
    cp -r scripts $BUILD_DIR/
    
    log "Application build completed ✓"
}

# Run tests
run_tests() {
    log "Running tests..."
    
    # Backend tests
    cd backend
    if [ -f "package.json" ] && grep -q "test" package.json; then
        npm test
    else
        warning "No backend tests found"
    fi
    cd ..
    
    # CLI tests
    cd cli
    if [ -f "package.json" ] && grep -q "test" package.json; then
        npm test
    else
        warning "No CLI tests found"
    fi
    cd ..
    
    log "Tests completed ✓"
}

# Deploy to Render.com
deploy_to_render() {
    log "Deploying to Render.com..."
    
    # Check if render CLI is installed
    if ! command -v render &> /dev/null; then
        info "Installing Render CLI..."
        npm install -g @render/render-cli
    fi
    
    # Login to Render (if needed)
    if ! render auth whoami &> /dev/null; then
        info "Please login to Render..."
        render auth login
    fi
    
    # Deploy using render.yaml
    render deploy --yaml render.yaml
    
    log "Deployment to Render.com completed ✓"
}

# Deploy to Docker
deploy_to_docker() {
    log "Building and deploying with Docker..."
    
    # Build Docker image
    docker build -t $APP_NAME .
    
    # Tag for deployment
    docker tag $APP_NAME:latest $APP_NAME:$(date +%Y%m%d-%H%M%S)
    
    # Save image to file
    docker save $APP_NAME:latest > $APP_NAME.tar
    
    log "Docker build completed ✓"
    info "Image saved as $APP_NAME.tar"
}

# Deploy to custom server
deploy_to_server() {
    local SERVER_URL=$1
    local SSH_USER=$2
    local SSH_KEY=$3
    
    log "Deploying to custom server: $SERVER_URL"
    
    # Create deployment package
    tar -czf deployment.tar.gz $BUILD_DIR/
    
    # Upload to server
    if [ -n "$SSH_KEY" ]; then
        scp -i "$SSH_KEY" deployment.tar.gz $SSH_USER@$SERVER_URL:~/
    else
        scp deployment.tar.gz $SSH_USER@$SERVER_URL:~/
    fi
    
    # Extract and deploy on server
    if [ -n "$SSH_KEY" ]; then
        ssh -i "$SSH_KEY" $SSH_USER@$SERVER_URL "
            tar -xzf deployment.tar.gz
            cd $BUILD_DIR
            npm install --production
            pm2 restart ecosystem.config.js || pm2 start ecosystem.config.js
        "
    else
        ssh $SSH_USER@$SERVER_URL "
            tar -xzf deployment.tar.gz
            cd $BUILD_DIR
            npm install --production
            pm2 restart ecosystem.config.js || pm2 start ecosystem.config.js
        "
    fi
    
    log "Server deployment completed ✓"
}

# Cleanup
cleanup() {
    log "Cleaning up..."
    
    # Remove temporary files
    rm -rf $BUILD_DIR
    rm -f deployment.tar.gz
    rm -f $APP_NAME.tar
    
    log "Cleanup completed ✓"
}

# Main deployment function
main() {
    local DEPLOYMENT_TYPE=${1:-render}
    
    log "Starting Ntando Computer deployment..."
    log "Deployment type: $DEPLOYMENT_TYPE"
    
    check_dependencies
    setup_environment
    install_dependencies
    build_application
    run_tests
    
    case $DEPLOYMENT_TYPE in
        "render")
            deploy_to_render
            ;;
        "docker")
            deploy_to_docker
            ;;
        "server")
            if [ -z "$2" ] || [ -z "$3" ]; then
                error "Server deployment requires: deploy.sh server <server_url> <ssh_user> [ssh_key]"
            fi
            deploy_to_server $2 $3 $4
            ;;
        "local")
            info "Local deployment completed. Files are ready in $BUILD_DIR/"
            ;;
        *)
            error "Unknown deployment type: $DEPLOYMENT_TYPE"
            ;;
    esac
    
    # Cleanup on success
    if [ $? -eq 0 ]; then
        cleanup
        log "🎉 Deployment completed successfully!"
        
        # Show next steps
        echo ""
        info "Next steps:"
        echo "1. Your application should be live in a few minutes"
        echo "2. Check the deployment logs for any issues"
        echo "3. Test the application at the provided URL"
        echo "4. Update your DNS records if using custom domains"
        echo ""
        success "Thank you for using Ntando Computer! 🚀"
    else
        error "Deployment failed. Please check the logs above."
    fi
}

# Success message
success() {
    echo -e "${GREEN}🎉 $1${NC}"
}

# Show usage
usage() {
    echo "Usage: $0 [deploy_type] [options]"
    echo ""
    echo "Deployment types:"
    echo "  render                Deploy to Render.com (default)"
    echo "  docker                Build Docker image"
    echo "  server <url> <user>   Deploy to custom server"
    echo "  local                 Build for local deployment"
    echo ""
    echo "Examples:"
    echo "  $0 render"
    echo "  $0 docker"
    echo "  $0 server example.com deploy user"
    echo "  $0 server example.com deploy user ~/.ssh/id_rsa"
    echo "  $0 local"
}

# Check for help flag
if [ "$1" = "--help" ] || [ "$1" = "-h" ]; then
    usage
    exit 0
fi

# Run main function
main "$@"