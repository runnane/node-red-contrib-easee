module.exports = {
  testEnvironment: 'node',
  
  // Force Jest to look in our directory regardless of node_modules
  testMatch: [
    '**/tests/unit/*.test.js',
    '**/tests/integration/*.test.js'
  ],
  
  // Clear all ignore patterns that might interfere
  testPathIgnorePatterns: [],
  modulePathIgnorePatterns: [],
  transformIgnorePatterns: [],
  
  // Setup files
  setupFilesAfterEnv: ['<rootDir>/tests/setup.js'],
  
  // Coverage settings
  collectCoverageFrom: [
    'easee-client/**/*.js',
    '!tests/**'
  ],
  
  coverageDirectory: 'coverage',
  coverageReporters: ['text', 'lcov'],
  
  // Force Jest to process files in node_modules
  testEnvironmentOptions: {},
  
  // Disable cache to avoid issues
  cache: false
};
