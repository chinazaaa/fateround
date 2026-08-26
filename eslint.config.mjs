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
    // `scripts/` is listed sibling-by-sibling rather than wholesale so that scripts/playtest
    // stays LINTED. Those harnesses assert a security boundary, and `no-undef` matters there:
    // a refactor once dropped an import, and because the scripts fail fast on a connection error
    // the missing symbol was never reached at runtime — the harness looked fine while silently
    // skipping its redaction assertions.
    ignores: [
      '.next/',
      'node_modules/',
      'infra/',
      '.claude/',
      'apps/mobile/',
      'scripts/ci/',
      'scripts/og/',
      'scripts/*.mjs',
    ],
  },
  js.configs.recommended,
  ...tseslint.configs.recommended,
  {
    // The service worker runs in the ServiceWorkerGlobalScope, so `self` and friends
    // are legitimate globals (not `no-undef`). Flat config can't use the old
    // `/* eslint-env serviceworker */` comment, so declare them here.
    files: ['scripts/playtest/**/*.mjs'],
    languageOptions: {
      sourceType: 'module',
      globals: { process: 'readonly', console: 'readonly', fetch: 'readonly', URL: 'readonly' },
    },
  },
  {
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
