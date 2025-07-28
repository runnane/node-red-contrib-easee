/**
 * ESLint configuration for node-red-contrib-easee
 * Using flat config format (ESLint 9+) with CommonJS
 */

const js = require("@eslint/js");

module.exports = [
  // Ignore files and directories
  {
    ignores: [
      "node_modules/**",
      "*.min.js",
      "build/**",
      "dist/**",
      "coverage/**"
    ]
  },

  // Base configuration for all JavaScript files
  {
    files: ["**/*.js"],
    languageOptions: {
      ecmaVersion: 2022,
      sourceType: "script", // Changed to script since project uses CommonJS
      globals: {
        // Node.js globals
        global: "readonly",
        process: "readonly",
        Buffer: "readonly",
        __dirname: "readonly",
        __filename: "readonly",
        console: "readonly",
        module: "readonly",
        require: "readonly",
        exports: "readonly",
        setTimeout: "readonly",
        clearTimeout: "readonly",
        setInterval: "readonly",
        clearInterval: "readonly",
        setImmediate: "readonly",
        clearImmediate: "readonly",

        // Node-RED globals
        RED: "readonly",

        // Jest globals (for test files)
        describe: "readonly",
        test: "readonly",
        it: "readonly",
        expect: "readonly",
        beforeEach: "readonly",
        afterEach: "readonly",
        beforeAll: "readonly",
        afterAll: "readonly",
        jest: "readonly"
      }
    },
    rules: {
      // Extend recommended rules
      ...js.configs.recommended.rules,

      // Code quality rules
      "no-console": "off", // Allow console for Node-RED logging
      "no-unused-vars": ["error", {
        "argsIgnorePattern": "^_",
        "varsIgnorePattern": "^_"
      }],
      "no-undef": "error",
      "no-redeclare": "error",
      "no-unreachable": "error",
      "no-dupe-keys": "error",
      "no-duplicate-case": "error",

      // Style rules
      "indent": ["error", 2, { "SwitchCase": 1 }],
      "quotes": ["error", "double", { "allowTemplateLiterals": true }],
      "semi": ["error", "always"],
      "comma-dangle": ["error", "never"],
      "object-curly-spacing": ["error", "always"],
      "array-bracket-spacing": ["error", "never"],
      "space-before-blocks": "error",
      "keyword-spacing": "error",
      "space-infix-ops": "error",
      "space-before-function-paren": ["error", "never"],
      "no-trailing-spaces": "error",
      "eol-last": "error",

      // Best practices
      "eqeqeq": ["error", "always"],
      "curly": ["error", "all"],
      "brace-style": ["error", "1tbs"],
      "no-eval": "error",
      "no-implied-eval": "error",
      "no-new-func": "error",
      "no-var": "error",
      "prefer-const": "error",
      "prefer-arrow-callback": "off", // Allow regular functions for Node-RED context
      "arrow-spacing": "error",

      // Node.js specific
      "no-process-exit": "error",
      "no-sync": "off", // Allow sync methods in Node-RED context

      // Async/await
      "require-await": "error",
      "no-return-await": "error"
    }
  },

  // Specific configuration for Node-RED node files
  {
    files: ["easee-client/*.js"],
    languageOptions: {
      sourceType: "script" // Node-RED nodes use CommonJS
    },
    rules: {
      "no-undef": "off", // RED is injected by Node-RED runtime
      "strict": "off" // Node-RED handles strict mode
    }
  },

  // Specific configuration for test files
  {
    files: ["tests/**/*.js", "**/*.test.js"],
    languageOptions: {
      sourceType: "script",
      globals: {
        fetch: "readonly" // Available in test environment
      }
    },
    rules: {
      "no-unused-expressions": "off", // Allow Jest expect statements
      "max-lines-per-function": "off", // Allow longer test functions
      "max-statements": "off" // Allow more statements in tests
    }
  },    // Ignore patterns
  {
    ignores: [
      "node_modules/**",
      "coverage/**",
      "backup/**",
      "*.min.js",
      "dist/**"
    ]
  }
];
