import js from '@eslint/js'
import tseslint from 'typescript-eslint'
import reactHooks from 'eslint-plugin-react-hooks'
import nextPlugin from '@next/eslint-plugin-next'
import eslintConfigPrettier from 'eslint-config-prettier'

export default tseslint.config(
  {
    // apps/mobile is a separate Expo/React Native app with its own toolchain
    // (Metro, require()-based asset loading) — this web ESLint config doesn't
    // apply to it and is also excluded from the web tsconfig. It should be linted
    // with an Expo config, not here.
    ignores: ['.next/', 'node_modules/', 'scripts/', 'infra/', '.claude/', 'apps/mobile/'],
  },
  js.configs.recommended,
  ...tseslint.configs.recommended,
  {
    // The service worker runs in the ServiceWorkerGlobalScope, so `self` and friends
    // are legitimate globals (not `no-undef`). Flat config can't use the old
    // `/* eslint-env serviceworker */` comment, so declare them here.
    files: ['public/sw.js'],
    languageOptions: {
      globals: { self: 'readonly', clients: 'readonly', caches: 'readonly', registration: 'readonly' },
    },
  },
  {
    plugins: {
      'react-hooks': reactHooks,
      '@next/next': nextPlugin,
    },
    rules: {
      ...reactHooks.configs.recommended.rules,
      ...nextPlugin.configs.recommended.rules,
      '@next/next/no-img-element': 'off',
      '@typescript-eslint/no-unused-vars': ['warn', { argsIgnorePattern: '^_' }],
      '@typescript-eslint/no-explicit-any': 'warn',
      'no-console': ['warn', { allow: ['warn', 'error'] }],
      'react-hooks/set-state-in-effect': 'warn',
      'react-hooks/refs': 'warn',
      'react-hooks/immutability': 'warn',
      'react-hooks/purity': 'warn',
      'react-hooks/preserve-manual-memoization': 'warn',
    },
  },
  eslintConfigPrettier
)
