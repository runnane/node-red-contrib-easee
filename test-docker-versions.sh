#!/bin/bash

# Docker Multi-Node Testing Script
# Tests the package in isolated Docker containers with different Node.js versions

set -e

echo "🐳 Docker Multi-Node Testing Script"
echo "==================================="

# Define Node.js versions to test
NODE_VERSIONS=("18" "20" "22" "24")

# Function to test with Docker
test_with_docker() {
    local version=$1
    echo ""
    echo "🐳 Testing with Node.js $version in Docker..."
    echo "----------------------------------------------"
    
    # Create temporary Dockerfile
    cat > Dockerfile.test << EOF
FROM node:${version}-alpine

WORKDIR /app

# Copy package files
COPY package*.json ./

# Install dependencies
RUN npm ci

# Copy source code
COPY . .

# Run tests
CMD ["npm", "run", "ci:test"]
EOF

    # Build and run test container
    echo "Building Docker image for Node.js $version..."
    docker build -f Dockerfile.test -t easee-test:node$version .
    
    echo "Running tests in Docker container..."
    docker run --rm easee-test:node$version
    
    # Cleanup
    rm -f Dockerfile.test
    docker rmi easee-test:node$version
    
    echo "✅ Node.js $version Docker testing completed"
}

# Check if Docker is available
if ! command -v docker >/dev/null 2>&1; then
    echo "❌ Docker not found. Please install Docker to use this script."
    exit 1
fi

echo "Starting Docker-based multi-version testing..."
echo "Versions to test: ${NODE_VERSIONS[*]}"

for version in "${NODE_VERSIONS[@]}"; do
    test_with_docker $version
done

echo ""
echo "🎉 All Docker-based Node.js versions tested successfully!"
echo "======================================================="
