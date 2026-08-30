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
  // Measured 2026-08-30: statements 11.91% (84/705), branches 7.98% (31/388),
  // functions 8.69% (8/92), lines 12.01% (84/699).
  //
  // Do NOT reintroduce a path-based group such as "./easee-client/" here.
  // Jest removes every file matched by a path group from the global group, and
  // collectCoverageFrom only collects easee-client/**/*.js — so a group on that
  // directory leaves the global group empty and its thresholds silently
  // unenforced. That is exactly what happened before: a global threshold of 99%
  // passed.
  coverageThreshold: {
    global: {
      branches: 7.9,
      functions: 8.6,
      lines: 11.9,
      statements: 11.8
    }
  },

  // Force Jest to process files in node_modules
  testEnvironmentOptions: {},

  // Disable cache to avoid issues
  cache: false
};
