const js = require('@eslint/js');
const globals = require('globals');
const security = require('eslint-plugin-security');
const unusedImports = require('eslint-plugin-unused-imports');

const commonRules = {
  'no-console': 'warn',
  'no-unused-vars': ['warn', { argsIgnorePattern: '^_' }],
  'no-eval': 'error',
  'no-implied-eval': 'error',
  'no-buffer-constructor': 'error',
  'no-param-reassign': ['warn', {
    props: true,
    ignorePropertyModificationsFor: ['req', 'res', 'next', 'user', 'booking', 'duty', 'app', 'schema', 'event', 'query']
  }],
  'unused-imports/no-unused-imports': 'warn',
  'security/detect-possible-timing-attacks': 'warn',
  'security/detect-non-literal-fs-filename': 'warn',
  'no-case-declarations': 'warn',
  'no-inner-declarations': 'warn',
  'no-prototype-builtins': 'warn',
  'no-useless-escape': 'warn',
  'no-useless-assignment': 'off',
  'preserve-caught-error': 'off'
};

module.exports = [
  {
    ignores: [
      'client/dist/**',
      'coverage/**',
      'node_modules/**',
      '**/*.ps1',
      '**/*.bat',
      '**/*.sh',
      '**/*.txt'
    ]
  },
  {
    ...js.configs.recommended,
    languageOptions: {
      ecmaVersion: 2022,
      sourceType: 'commonjs',
      globals: {
        ...globals.node,
        ...globals.es2021
      }
    },
    plugins: {
      security,
      'unused-imports': unusedImports
    },
    rules: {
      ...js.configs.recommended.rules,
      ...commonRules
    }
  },
  {
    files: ['tests/**/*.js', 'services/**/tests/**/*.js'],
    languageOptions: {
      globals: {
        ...globals.jest
      }
    },
    rules: {
      'no-console': 'off'
    }
  },
  {
    files: ['tests/smoke/**/*.js', 'tests/e2e/**/*.js', 'tests/e2e/**/*.cjs'],
    languageOptions: {
      globals: {
        ...globals.browser,
        ...globals.jest
      }
    }
  },
  {
    files: ['client/public/**/*.js'],
    languageOptions: {
      sourceType: 'module',
      globals: {
        ...globals.browser,
        NocturnalSession: 'readonly',
        AppConfig: 'readonly',
        AppFormat: 'readonly',
        AppUi: 'readonly',
        AdminSession: 'readonly',
        DoctorSession: 'readonly',
        PatientSession: 'readonly',
        ProviderSession: 'readonly',
        Chart: 'readonly',
        FullCalendar: 'readonly',
        Razorpay: 'readonly',
        API_URL: 'readonly',
        requestIdleCallback: 'readonly',
        module: 'readonly'
      }
    },
    rules: {
      'no-console': 'off',
      'no-redeclare': 'off'
    }
  },
  {
    files: ['client/public/service-worker.js'],
    languageOptions: {
      globals: {
        ...globals.browser,
        ...globals.serviceworker
      }
    }
  },
  {
    files: [
      'client/build.config.js',
      'client/webpack.config.js',
      'client/webpack.config.simple.js'
    ],
    rules: {
      'no-console': 'off',
      'no-global-assign': 'off'
    }
  },
  {
    files: [
      'scripts/**/*.js',
      'test-*.js',
      'setup-*.js',
      'verify-*.js',
      'update-*.js',
      'create-*.js',
      'recreate-*.js',
      'fix-*.js',
      'seed.js',
      'server.js',
      'ecosystem.config.js'
    ],
    rules: {
      'no-console': 'off'
    }
  },
  {
    files: ['setup-mongodb-auth.js', 'docker/mongo-init.js'],
    languageOptions: {
      globals: {
        db: 'writable',
        print: 'readonly',
        quit: 'readonly'
      }
    },
    rules: {
      'no-console': 'off'
    }
  },
  {
    files: ['utils/logger.js', 'packages/shared/src/utils/logger.js', 'packages/shared/**/*.js'],
    rules: {
      'no-console': 'off'
    }
  }
];
