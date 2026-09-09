import js from '@eslint/js';
import hooks from 'eslint-plugin-react-hooks';
import globals from 'globals';
import tseslint from 'typescript-eslint';

export default [
  { ignores: ['**/node_modules/**', '**/dist/**', 'output/**', 'test-results/**', 'playwright-report/**', 'var/**'] },
  js.configs.recommended,
  ...tseslint.configs.recommended.map(config => ({ ...config, files: ['**/*.{ts,tsx,mts}'] })),
  { languageOptions: { ecmaVersion: 'latest', sourceType: 'module', globals: globals.node } },
  { files: ['tests/browser/**/*.{js,ts}', 'scripts/measure-browser.mjs'], languageOptions: { globals: globals.browser } },
  {
    files: ['frontend/**/*.{js,jsx,ts,tsx}'],
    languageOptions: { globals: globals.browser, parserOptions: { ecmaFeatures: { jsx: true } } },
    plugins: { 'react-hooks': hooks },
    rules: {
      'react-hooks/rules-of-hooks': 'error', 'react-hooks/exhaustive-deps': 'warn',
    },
  },
  { rules: { 'no-unused-vars': ['error', { argsIgnorePattern: '^_', varsIgnorePattern: '^_' }] } },
  {
    files: ['**/*.{ts,tsx,mts}'],
    languageOptions: { parserOptions: { project: ['./tsconfig.server.json', './frontend/tsconfig.json', './tsconfig.json'] } },
    rules: {
      'no-unused-vars': 'off',
      '@typescript-eslint/no-unused-vars': ['error', { argsIgnorePattern: '^_', varsIgnorePattern: '^_' }],
    },
  },
  {
    files: ['backend/**/*.ts', 'shared/**/*.ts', 'frontend/src/**/*.{ts,tsx}', 'scripts/*.mts'],
    ignores: ['**/*.test.ts', '**/*.test.mts', '**/test-helpers.ts'],
    rules: { '@typescript-eslint/no-floating-promises': 'error' },
  },
];
