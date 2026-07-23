// eslint.config.cjs — flat config for the toolkit-dashboard (Vite + React web).
//
// Modeled on voice-trainer/frontend's eslint setup (chain
// auto-startup-dev-services T3 follow-up), adapted for a web app:
//   - dropped eslint-plugin-react-native (RN-only);
//   - no-undef is OFF (typescript-eslint guidance — TypeScript already
//     catches undefined identifiers, and no-undef otherwise needs a
//     hand-maintained browser-globals list that drifts);
//   - parserOptions.project is omitted — none of the enabled rules are
//     type-aware, so type-aware linting would be cost without benefit
//     (and would error on any file not covered by a tsconfig).
//
// Gate behavior: `npm run lint` (plain `eslint .`) fails on ERRORS only;
// warnings are advisory ratchet candidates. The precommit gate +
// .gitea/workflows/ci.yaml run it.

const js = require('@eslint/js')
const tsParser = require('@typescript-eslint/parser')
const tsPlugin = require('@typescript-eslint/eslint-plugin')
const react = require('eslint-plugin-react')
const reactHooks = require('eslint-plugin-react-hooks')

module.exports = [
  {
    ignores: [
      'node_modules/**',
      'dist/**',
      '.vite/**',
      'coverage/**',
      'test-results/**',
      'playwright-report/**',
      // _dormant pages are excluded from the tsconfig + vitest too — keep
      // the toolchain consistent and don't lint disabled code.
      'src/pages/_dormant/**',
    ],
  },
  js.configs.recommended,
  {
    files: ['**/*.{ts,tsx,js,jsx,mjs,cjs}'],
    plugins: {
      react,
      'react-hooks': reactHooks,
      '@typescript-eslint': tsPlugin,
    },
    languageOptions: {
      parser: tsParser,
      parserOptions: {
        ecmaVersion: 'latest',
        sourceType: 'module',
        ecmaFeatures: { jsx: true },
      },
    },
    settings: {
      react: { version: 'detect' },
    },
    rules: {
      // TS handles undefined-identifier + unused-symbol detection; the
      // base ESLint rules give false positives on TS constructs.
      'no-undef': 'off',
      'no-unused-vars': 'off',

      // Errors — real defects / banned constructs.
      'no-debugger': 'error',
      'no-eval': 'error',
      'no-implied-eval': 'error',
      'no-with': 'error',
      'no-var': 'error',
      'prefer-const': 'error',
      // `_`-prefixed args/vars/caught-errors are the intentional-unused
      // marker the codebase already uses — honor it.
      '@typescript-eslint/no-unused-vars': [
        'error',
        {
          argsIgnorePattern: '^_',
          varsIgnorePattern: '^_',
          caughtErrorsIgnorePattern: '^_',
        },
      ],
      '@typescript-eslint/no-misused-new': 'error',
      // React hooks correctness: rules-of-hooks is a hard error (calling a
      // hook conditionally is a real bug); exhaustive-deps is advisory.
      'react-hooks/rules-of-hooks': 'error',
      'react-hooks/exhaustive-deps': 'warn',

      // Warnings — quality ratchet candidates, don't block the gate.
      '@typescript-eslint/no-non-null-assertion': 'warn',
      '@typescript-eslint/no-explicit-any': 'warn',
      'react/react-in-jsx-scope': 'off',
      'react/prop-types': 'off',
      'react/display-name': 'off',
      'no-empty': 'warn',
      'no-alert': 'warn',
      'eqeqeq': ['warn', 'smart'],
      'dot-notation': 'warn',
      'no-else-return': 'warn',
      'no-lonely-if': 'warn',
      'prefer-template': 'warn',
    },
  },
  {
    // Test files: mocks intentionally reach for `any` and empty bodies.
    files: ['**/*.test.{ts,tsx}', 'src/__tests__/**/*.{ts,tsx}', 'tests/**/*.{ts,tsx}'],
    rules: {
      '@typescript-eslint/no-explicit-any': 'off',
      'no-empty': 'off',
    },
  },
]
