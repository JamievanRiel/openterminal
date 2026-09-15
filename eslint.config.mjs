import js from '@eslint/js'
import tseslint from 'typescript-eslint'
import reactHooks from 'eslint-plugin-react-hooks'

// Declared by hand so the config needs no `globals` package.
const NODE_GLOBALS = {
  module: 'writable',
  require: 'readonly',
  process: 'readonly',
  console: 'readonly',
  Buffer: 'readonly',
  __dirname: 'readonly',
  __filename: 'readonly',
  URL: 'readonly',
  fetch: 'readonly'
}

/**
 * Flat config for the Electron main + React renderer sources. Type-aware rules
 * are deliberately off: `npm run typecheck` already covers what the compiler
 * knows, and this keeps lint fast enough to run on every commit.
 */
export default tseslint.config(
  {
    // Build output, dependencies and the vendored Python port reference.
    ignores: ['out/**', 'build/**', 'dist/**', 'node_modules/**', 'Riel-main/**']
  },
  js.configs.recommended,
  ...tseslint.configs.recommended,
  {
    // Build scripts and tool configs are plain Node, not renderer ESM.
    files: ['scripts/**', '*.config.js', '*.config.mjs', '*.config.ts', '*.config.mts'],
    languageOptions: { globals: NODE_GLOBALS, sourceType: 'commonjs' },
    rules: { '@typescript-eslint/no-require-imports': 'off' }
  },
  {
    files: ['**/*.mjs', '**/*.mts'],
    languageOptions: { sourceType: 'module' }
  },
  {
    files: ['src/**/*.{ts,tsx}'],
    plugins: { 'react-hooks': reactHooks },
    rules: {
      // The classic pair the codebase was written against. The React Compiler
      // rules new in eslint-plugin-react-hooks v7 (refs/purity/immutability)
      // are left off on purpose: they flag deliberate, working patterns here
      // (e.g. the seen-set refs that drive the new-row flash in the streams).
      'react-hooks/rules-of-hooks': 'error',
      'react-hooks/exhaustive-deps': 'warn',
      // Unused args are often there for signature clarity; underscore opts out.
      '@typescript-eslint/no-unused-vars': ['error', { argsIgnorePattern: '^_', varsIgnorePattern: '^_' }]
    }
  }
)
