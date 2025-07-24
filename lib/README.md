# Easee Node-RED Library

A modular, well-tested, and thoroughly documented library for interacting with the Easee API in Node-RED environments.

## Overview

This library provides a clean, modular architecture that separates concerns and makes the codebase more maintainable, testable, and reusable. It replaces the monolithic 1930+ line configuration file with well-structured, focused modules.

## Features

- 🏗️ **Modular Architecture**: Clean separation of authentication, API, logging, and utility functions
- 🧪 **Highly Testable**: Each module can be tested independently
- 📚 **Comprehensive Documentation**: JSDoc annotations throughout
- 🔄 **Reusable**: Can be used as a standalone library outside Node-RED
- 🛡️ **Type Safe**: TypeScript-style JSDoc for better IDE support
- 🪵 **Advanced Logging**: Configurable logging with Node-RED integration
- 🔐 **Robust Authentication**: Token management with automatic refresh
- 📊 **Data Parsing**: Comprehensive Easee observation data parsing
- ⚡ **Performance**: Efficient HTTP client with retry logic

## Quick Start

```javascript
const easee = require('./lib');

// Create a client
const client = easee.createClient({
  credentials: {
    username: 'your-email@example.com',
    password: 'your-password'
  },
  options: {
    debugLogging: true
  }
});

// Login and make API calls
await client.login();
const chargers = await client.getChargers();
console.log('Found chargers:', chargers);
```

## Architecture

### Module Structure

```
lib/
├── index.js              # Main library entry point
├── auth/                 # Authentication module
│   ├── index.js         # Auth module exports
│   ├── credentials.js   # Credential validation
│   ├── token.js         # JWT token management
│   └── authentication.js # Login/logout operations
├── api/                 # API communication module
│   ├── index.js         # API module exports
│   ├── client.js        # HTTP client
│   └── parser.js        # Data parsing utilities
├── logging/             # Logging module
│   └── logger.js        # Configurable logging
└── utils/               # Utility functions
    └── index.js         # Common utilities
```

### Core Modules

#### Authentication (`lib/auth`)

Handles all authentication-related operations:

```javascript
const { auth } = require('./lib');

// Validate credentials
const validation = auth.validateCredentials({
  username: 'user@example.com',
  password: 'password123'
});

// Create authentication manager
const authManager = auth.createAuthManager(credentials, {
  logger: console.log
});

await authManager.login();
console.log('Access token:', authManager.getAccessToken());
```

#### API Client (`lib/api`)

Provides HTTP client and data parsing:

```javascript
const { api } = require('./lib');

// Create API client
const client = api.createApiClient(accessToken, {
  logger: console.log
});

// Make requests
const response = await client.get('/api/chargers');

// Parse observation data
const parsed = api.parseObservation(rawObservation);
console.log('Parsed:', parsed.dataType, parsed.value, parsed.unit);
```

#### Logging (`lib/logging`)

Configurable logging with Node-RED integration:

```javascript
const { logging } = require('./lib');

// Create logger
const logger = logging.createLogger({
  debugLogging: true,
  debugToNodeWarn: false,
  nodeContext: node // Node-RED node for integration
});

logger.info('Information message');
logger.debug('Debug message');
logger.warn('Warning message');
logger.error('Error message');
```

#### Utilities (`lib/utils`)

Common utility functions:

```javascript
const { utils } = require('./lib');

// Type checking
console.log(utils.isValidNumber(42)); // true
console.log(utils.isValidEmail('test@example.com')); // true

// Data transformation
const num = utils.toNumber('42.5', 0); // 42.5
const bool = utils.toBoolean('true'); // true

// Object utilities
const value = utils.safeGet(obj, 'user.profile.name', 'Unknown');
const cloned = utils.deepClone(originalObject);
```

## Usage Examples

### Node-RED Integration

```javascript
const easee = require('./lib');

function MyEaseeNode(config) {
  RED.nodes.createNode(this, config);
  
  // Create client with Node-RED integration
  const client = easee.createNodeRedClient(this, this.credentials, {
    debugLogging: config.debugLogging,
    debugToNodeWarn: config.debugToNodeWarn
  });
  
  this.on('input', async (msg) => {
    try {
      await client.login();
      const chargers = await client.getChargers();
      
      msg.payload = chargers;
      this.send(msg);
    } catch (error) {
      this.error(`Failed to get chargers: ${error.message}`, msg);
    }
  });
}
```

### Standalone Usage

```javascript
const easee = require('./lib');

async function main() {
  const client = easee.createClient({
    credentials: {
      username: process.env.EASEE_USERNAME,
      password: process.env.EASEE_PASSWORD
    },
    options: {
      debugLogging: true
    }
  });
  
  try {
    // Login
    await client.login();
    console.log('✅ Logged in successfully');
    
    // Get chargers
    const chargers = await client.getChargers();
    console.log(`📊 Found ${chargers.length} chargers`);
    
    // Get status for first charger
    if (chargers.length > 0) {
      const status = await client.getChargerStatus(chargers[0].id);
      console.log('🔌 Charger status:', status);
    }
    
  } catch (error) {
    console.error('❌ Error:', error.message);
  } finally {
    client.logout();
  }
}

main();
```

### Data Parsing

```javascript
const { api } = require('./lib');

// Parse streaming observation data
const observation = {
  id: 'EHXXXXXX_1_1640995200_8',
  timestamp: '2021-12-31T23:00:00Z',
  dataType: 8,
  value: 7.2
};

const parsed = api.parseObservation(observation);
console.log(parsed);
// Output:
// {
//   id: 'EHXXXXXX_1_1640995200_8',
//   timestamp: '2021-12-31T23:00:00Z',
//   timestampMs: 1640995200000,
//   dataType: 'total_power',
//   value: 7.2,
//   unit: 'kW',
//   raw: { ... }
// }

// Format for Node-RED
const nodeRedMsg = api.formatForNodeRed(parsed);
console.log(nodeRedMsg.topic); // 'easee/EHXXXXXX/total_power'
```

## Testing

The modular architecture makes testing much easier:

```bash
# Run all tests
npm test

# Run specific test suites
npm run test:unit
npm run test:integration

# Run tests with coverage
npm run test:coverage
```

### Unit Testing Example

```javascript
const { auth } = require('../lib');

describe('Authentication', () => {
  it('should validate credentials', () => {
    const result = auth.validateCredentials({
      username: 'test@example.com',
      password: 'password123'
    });
    
    expect(result.valid).toBe(true);
  });
  
  it('should decode JWT tokens', () => {
    const payload = auth.decodeToken(mockToken);
    expect(payload).not.toBeNull();
    expect(payload.sub).toBe('1234567890');
  });
});
```

## Migration from Monolithic Code

The new modular structure provides backward compatibility while offering a much cleaner API:

### Before (Monolithic)
```javascript
// 1930+ lines in one file with mixed concerns
function doLogin() { /* complex implementation */ }
function parseObservation() { /* mixed with other logic */ }
function logDebug() { /* embedded in various places */ }
```

### After (Modular)
```javascript
// Clean, focused modules
const client = easee.createClient(config);
await client.login();
const parsed = client.parser.parseObservation(data);
client.logger.debug('Processed observation');
```

## Benefits

1. **🧩 Modularity**: Each module has a single responsibility
2. **🧪 Testability**: Easy to unit test individual components  
3. **📖 Documentation**: Comprehensive JSDoc throughout
4. **♻️ Reusability**: Library can be used outside Node-RED
5. **🛠️ Maintainability**: Easier to understand and modify
6. **🔄 Backward Compatibility**: Existing nodes continue to work
7. **⚡ Performance**: Optimized HTTP client and caching
8. **🛡️ Error Handling**: Centralized, consistent error handling
9. **📊 Observability**: Enhanced logging and debugging capabilities
10. **🚀 Developer Experience**: Better IDE support with type hints

## Contributing

When contributing to this library:

1. Follow the modular architecture
2. Add comprehensive JSDoc documentation
3. Include unit tests for new functionality
4. Update integration tests as needed
5. Follow conventional commit messages
6. Ensure backward compatibility

## License

This project is licensed under the same terms as the main Node-RED contribution.
