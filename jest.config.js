module.exports = {
  testEnvironment: "node",

  // Force Jest to look in our directory regardless of node_modules
  testMatch: [
    "**/tests/unit/*.test.js",
    "**/tests/integration/*.test.js"
  ],

  // Clear all ignore patterns that might interfere
  testPathIgnorePatterns: [],
  modulePathIgnorePatterns: [],
  transformIgnorePatterns: [],

  // Setup files
  setupFilesAfterEnv: ["<rootDir>/tests/setup.js"],

  // Enhanced coverage settings
  collectCoverage: false, // Set to true when running coverage
  collectCoverageFrom: [
    "easee-client/**/*.js",
    "!easee-client/**/*.html",
    "!tests/**",
    "!node_modules/**",
    "!coverage/**"
  ],

  coverageDirectory: "coverage",
  coverageReporters: [
    "text",           // Console output
    "text-summary",   // Brief summary
    "lcov",          // For IDE integration and CI
    "html",          // Interactive HTML report
    "json",          // JSON output for CI
    "clover"         // XML format for some CI systems
  ],

  // Coverage thresholds - adjusted for current coverage levels
  coverageThreshold: {
    global: {
      branches: 8,     // Currently at 7.98%
      functions: 9,    // Currently at 8.69%
      lines: 12,       // Currently at 12.01%
      statements: 12   // Currently at 11.91%
    },
    // Per-file thresholds - more lenient to start
    "./easee-client/": {
      branches: 7,
      functions: 8,
      lines: 12,
      statements: 11
    }
  },

  // Force Jest to process files in node_modules
  testEnvironmentOptions: {},

  // Disable cache to avoid issues
  cache: false
};
