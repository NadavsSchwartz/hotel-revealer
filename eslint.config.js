import js from '@eslint/js';
import react from 'eslint-plugin-react';
import hooks from 'eslint-plugin-react-hooks';
import globals from 'globals';

export default [
  { ignores: ['**/node_modules/**', '**/dist/**', 'output/**', 'test-results/**', 'playwright-report/**', 'var/**'] },
  js.configs.recommended,
  { languageOptions: { ecmaVersion: 'latest', sourceType: 'module', globals: globals.node } },
  { files: ['tests/browser/**/*.js', 'scripts/measure-browser.mjs'], languageOptions: { globals: globals.browser } },
  {
    files: ['frontend/**/*.{js,jsx}'],
    languageOptions: { globals: globals.browser, parserOptions: { ecmaFeatures: { jsx: true } } },
    plugins: { react, 'react-hooks': hooks },
    settings: { react: { version: '17.0' } },
    rules: {
      'react/jsx-uses-react': 'error', 'react/jsx-uses-vars': 'error',
      'react-hooks/rules-of-hooks': 'error', 'react-hooks/exhaustive-deps': 'warn',
    },
  },
  { rules: { 'no-unused-vars': ['error', { argsIgnorePattern: '^_', varsIgnorePattern: '^_' }] } },
];
