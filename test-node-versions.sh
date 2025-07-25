#!/bin/bash

# Node.js Version Testing Script
# Tests the package against multiple Node.js versions using nvm

set -e

echo "🚀 Node.js Multi-Version Testing Script"
echo "========================================"

# Define Node.js versions to test
NODE_VERSIONS=("18" "20" "22" "24")

# Function to test a specific Node.js version
test_node_version() {
    local version=$1
    echo ""
    echo "📦 Testing with Node.js $version..."
    echo "-----------------------------------"
    
    # Use nvm to switch Node.js version
    if [ ! -d "${HOME}/.nvm/.git" ]; then 
        echo >&2 "nvm is required in .git, but it's not installed.  Aborting."; 
        exit 1;
    fi

    export NVM_DIR="$([ -z "${XDG_CONFIG_HOME-}" ] && printf %s "${HOME}/.nvm" || printf %s "${XDG_CONFIG_HOME}/nvm")"
    [ -s "$NVM_DIR/nvm.sh" ] && \. "$NVM_DIR/nvm.sh" # This loads nvm

    if command -v nvm >/dev/null 2>&1; then
        echo "Using nvm to switch to Node.js $version"
        export NVM_DIR="$HOME/.nvm"
        [ -s "$NVM_DIR/nvm.sh" ] && \. "$NVM_DIR/nvm.sh"
        
        nvm use $version || {
            echo "⚠️  Node.js $version not installed, installing..."
            nvm install $version
            nvm use $version
        }
    else
        echo >&2 "⚠️  nvm is required, but it's not installed.  Aborting."; 
        exit 1;
    fi
    
    # Display current Node.js version
    echo "Current Node.js version: $(node --version)"
    echo "Current npm version: $(npm --version)"
    
    # Clean install dependencies
    echo "Installing dependencies..."
    npm ci
    
    # Run linting
    echo "Running linting..."
    npm run lint || echo "⚠️  Linting issues found"
    
    # Run tests
    echo "Running tests..."
    npm test
    
    # Run security audit
    echo "Running security audit..."
    npm audit --audit-level moderate || echo "⚠️  Security issues found"
    
    echo "✅ Node.js $version testing completed successfully"
}

# Main execution
echo "Starting multi-version testing..."
echo "Versions to test: ${NODE_VERSIONS[*]}"

for version in "${NODE_VERSIONS[@]}"; do
    test_node_version $version
done

echo ""
echo "🎉 All Node.js versions tested successfully!"
echo "============================================"
echo ""
echo "Summary:"
for version in "${NODE_VERSIONS[@]}"; do
    echo "  ✅ Node.js $version - PASSED"
done
