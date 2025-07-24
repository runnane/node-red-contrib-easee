# Testing Documentation

This directory contains comprehensive unit and integration tests for the Easee Node-RED contribution project.

## Test Structure

```
tests/
├── setup.js                    # Jest setup and global test utilities
├── fixtures/
│   └── mockData.js             # Mock data for API responses
├── mocks/
│   └── nodeRedMocks.js         # Mock utilities for Node-RED environment
├── unit/
│   ├── authentication.test.js  # Unit tests for login functionality
│   ├── tokenRefresh.test.js    # Unit tests for token refresh logic
│   └── tokenChecking.test.js   # Unit tests for automatic token checking
└── integration/
    └── authFlow.test.js        # Integration tests for complete auth flow
```

## Test Categories

### Unit Tests (`tests/unit/`)

- **Authentication Tests** (`authentication.test.js`)
  - Login with valid/invalid credentials
  - Error handling for network issues
  - Response parsing and validation
  - Username/password validation

- **Token Refresh Tests** (`tokenRefresh.test.js`)
  - Successful token refresh scenarios
  - Invalid/expired refresh token handling
  - Network error retry logic
  - Authentication state reset

- **Token Checking Tests** (`tokenChecking.test.js`)
  - Automatic token expiration checking
  - Scheduled token renewal
  - Credential validation
  - Timer management

### Integration Tests (`tests/integration/`)

- **Authentication Flow Tests** (`authFlow.test.js`)
  - Complete login-to-refresh workflow
  - Error recovery scenarios
  - Configuration edge cases
  - Token lifecycle management

## Mock System

### Global Test Helpers (`setup.js`)

The setup file provides global utilities available in all tests:

- `testHelpers.createMockNode()` - Create mock Easee configuration nodes
- `testHelpers.createAuthResponse()` - Generate mock authentication responses
- `testHelpers.createFetchResponse()` - Create mock fetch responses
- `testHelpers.resetMocks()` - Reset all mocks between tests

### Mock Data (`fixtures/mockData.js`)

Centralized mock data for consistent testing:

- Login success/failure responses
- Token refresh responses
- Error scenarios
- Network error simulations
- Observation data

### Node-RED Mocks (`mocks/nodeRedMocks.js`)

Mock utilities specific to Node-RED environment:

- `createMockRED()` - Mock Node-RED runtime
- `createMockEaseeNode()` - Mock Easee configuration node
- `mockFetchResponses` - Predefined fetch response mocks
- Verification helpers for status, events, and API calls

## Running Tests

⚠️ **Important Note**: This project is located inside a `node_modules` directory, which causes Jest to ignore it by default. We've provided multiple solutions:

### Option 1: Custom Test Runner (Recommended)
```bash
node run-tests.js
```

This custom runner works around Jest's `node_modules` exclusion and provides basic testing functionality.

### Option 2: Move Project Outside node_modules
For full Jest functionality, move the project to a different location:
```bash
# Copy project to a different location
cp -r /path/to/node_modules/node-red-contrib-easee ~/easee-development
cd ~/easee-development
npm test
```

### Option 3: Standard Jest Commands (if moved outside node_modules)
```bash
npm test              # All tests
npm run test:unit     # Unit tests only
npm run test:integration  # Integration tests only
npm run test:coverage # With coverage report
npm run test:watch    # Watch mode
npm run test:verbose  # Verbose output
```

## Test Features

### Mocked APIs
- All HTTP requests are mocked using Jest's `fetch` mock
- No real network calls are made during testing
- Predictable responses for different scenarios

### Timer Testing
- Uses Jest's fake timers for testing scheduled operations
- Token expiration checking
- Automatic retry mechanisms

### Error Simulation
- Network timeouts and connection errors
- Invalid credentials and server errors
- Malformed API responses

### State Verification
- Node status updates
- Event emissions
- Authentication state changes
- Token lifecycle management

## Test Coverage

The test suite aims for comprehensive coverage of:

- ✅ Authentication methods (`doLogin`, `doRefreshToken`)
- ✅ Token management (`checkToken`, expiration handling)
- ✅ Error handling and recovery
- ✅ Network failure scenarios
- ✅ Configuration validation
- ✅ Timer and scheduling logic
- ✅ Node-RED integration points

## Writing New Tests

When adding new tests:

1. **Use the existing mock utilities** to maintain consistency
2. **Follow the AAA pattern** (Arrange, Act, Assert)
3. **Mock external dependencies** (fetch, timers, etc.)
4. **Test both success and failure scenarios**
5. **Verify side effects** (status updates, events, state changes)
6. **Use descriptive test names** that explain the scenario

### Example Test Structure

```javascript
describe('Feature Name', () => {
  let node;

  beforeEach(() => {
    node = createMockEaseeNode();
    // Setup test-specific mocks
  });

  test('should handle success scenario', async () => {
    // Arrange
    mockFetchResponses.loginSuccess();

    // Act
    const result = await node.doLogin();

    // Assert
    expect(result).toEqual(expectedData);
    verifyNodeStatus(node, expectedStatus);
  });
});
```

## Debugging Tests

- Use `npm run test:verbose` for detailed output
- Add `console.log` statements in test setup
- Use Jest's `--detectOpenHandles` flag to find async issues
- Run single test files: `jest tests/unit/authentication.test.js`
