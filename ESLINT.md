# ESLint Setup

This project now uses ESLint for comprehensive code quality checking and formatting.

## Configuration

- **Configuration File**: `eslint.config.js` (using the new flat config format)
- **ESLint Version**: 9.0.0+ with modern flat configuration
- **Code Style**: Double quotes, 2-space indentation, semicolons required

## Scripts

- `npm run lint` - Check all JavaScript files for linting issues
- `npm run lint:fix` - Automatically fix all auto-fixable linting issues
- `npm run lint:jshint` - Run the legacy JSHint linter (for comparison)

## Rules Overview

### Code Quality
- No unused variables/functions (with `_` prefix allowed for intentionally unused)
- No undefined variables
- Consistent equality operators (`===` instead of `==`)
- Proper async/await usage

### Code Style
- Double quotes for strings
- 2-space indentation
- Semicolons required
- Consistent spacing around operators and keywords
- No trailing whitespace

### Node-RED Specific
- `RED` global is allowed (Node-RED runtime injection)
- Console logging is permitted
- Sync methods allowed (Node-RED context)
- CommonJS module format enforced

### Test Files
- Jest globals are recognized
- Longer functions allowed in tests
- Unused expressions permitted (for Jest expect statements)

## Current Status

After running `npm run lint:fix`, the codebase went from **1,168 issues** down to **44 issues** that require manual attention.

### Remaining Issues Summary

1. **Unused Variables** (most common)
   - Variables prefixed with `_` are allowed if intentionally unused
   - Remove or rename unused variables

2. **Missing Global Definitions**
   - `fetch` is not defined in test files (need to add to test environment)

3. **Equality Operators**
   - Change `==` to `===` and `!=` to `!==`

4. **Async/Await Issues**
   - Remove `async` from functions that don't use `await`

5. **Empty Blocks**
   - Add proper error handling or comments

## Integration

ESLint is now integrated into the development workflow:

- Run before commits to catch issues early
- Auto-fix handles most formatting issues
- Manual review needed for logic/quality issues
- Compatible with existing JSHint setup (both can coexist during transition)

## VS Code Integration

For VS Code users, install the ESLint extension to get:
- Real-time linting feedback
- Auto-fix on save
- Inline error/warning displays

## Next Steps

1. Fix remaining 44 manual issues
2. Consider adding ESLint to CI/CD pipeline
3. Gradually migrate from JSHint to ESLint completely
4. Add pre-commit hooks for automatic linting
