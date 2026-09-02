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

  // Coverage thresholds - a floor that only ever goes up.
  //
  // These sit just under the measured coverage, so any change that reduces
  // coverage fails the build. When coverage rises, raise the floor to just
  // under the new number in the same change; never lower it to make a build
  // pass.
  //
  // Measured 2026-09-02 (EASEE-13): statements 28.95% (207/715), branches
  // 29.11% (115/395), functions 22.58% (21/93), lines 29.05% (206/709).
  // The jump from ~12% is the charger_state migration's tests, which drive the
  // rest client through a real Node-RED runtime for the first time.
  //
  // Do NOT reintroduce a path-based group such as "./easee-client/" here.
  // Jest removes every file matched by a path group from the global group, and
  // collectCoverageFrom only collects easee-client/**/*.js — so a group on that
  // directory leaves the global group empty and its thresholds silently
  // unenforced. That is exactly what happened before: a global threshold of 99%
  // passed.
  coverageThreshold: {
    global: {
      branches: 29.0,
      functions: 22.5,
      lines: 29.0,
      statements: 28.9
    }
  },

  // Force Jest to process files in node_modules
  testEnvironmentOptions: {},

  // Disable cache to avoid issues
  cache: false
};
