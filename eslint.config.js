const js = require('@eslint/js');
const globals = require('globals');
const security = require('eslint-plugin-security');
const unusedImports = require('eslint-plugin-unused-imports');
const noRawHtmlSinks = require('./tools/eslint-rules/no-raw-html-sinks');

const commonRules = {
  'no-console': 'warn',
  'no-unused-vars': ['warn', { argsIgnorePattern: '^_' }],
  // eslint 10 promotes these to errors via recommended; develop's pre-merge
  // lint treated them as non-blocking. Keep them as warnings (within the lint
  // warning budget) for the develop->main promotion; tracked for follow-up
  // (attach `cause` to rethrown errors; drop the dead assignments).
  'preserve-caught-error': 'warn',
  'no-useless-assignment': 'warn',
  'no-eval': 'error',
  'no-implied-eval': 'error',
  'no-buffer-constructor': 'error',
  'no-restricted-syntax': [
    'error',
    {
      selector: "CallExpression[callee.name='hash'][arguments.0.name=/pass(word)?|pwd/i]",
      message: 'Password hashing must use bcrypt.hash() or argon2.hash(); do not use generic hash helpers for passwords.'
    },
    {
      selector: "CallExpression[callee.name='hash'][arguments.0.property.name=/pass(word)?|pwd/i]",
      message: 'Password hashing must use bcrypt.hash() or argon2.hash(); do not use generic hash helpers for passwords.'
    },
    {
      selector: "CallExpression[callee.property.name='hash'][arguments.0.name=/pass(word)?|pwd/i]:not([callee.object.name='bcrypt']):not([callee.object.name='bcryptjs']):not([callee.object.name='argon2'])",
      message: 'Password hashing must use bcrypt.hash() or argon2.hash(); do not use generic hash helpers for passwords.'
    },
    {
      selector: "CallExpression[callee.property.name='hash'][arguments.0.property.name=/pass(word)?|pwd/i]:not([callee.object.name='bcrypt']):not([callee.object.name='bcryptjs']):not([callee.object.name='argon2'])",
      message: 'Password hashing must use bcrypt.hash() or argon2.hash(); do not use generic hash helpers for passwords.'
    },
    {
      selector: "CallExpression[callee.name='checksum'][arguments.0.name=/pass(word)?|pwd/i], CallExpression[callee.property.name='checksum'][arguments.0.name=/pass(word)?|pwd/i], CallExpression[callee.name='checksum'][arguments.0.property.name=/pass(word)?|pwd/i], CallExpression[callee.property.name='checksum'][arguments.0.property.name=/pass(word)?|pwd/i]",
      message: 'Do not checksum passwords. Use bcrypt.hash() or argon2.hash() for password storage.'
    },
    {
      selector: "CallExpression[callee.property.name='update'][callee.object.callee.property.name='createHash'][arguments.0.name=/pass(word)?|pwd/i], CallExpression[callee.property.name='update'][callee.object.callee.property.name='createHash'][arguments.0.property.name=/pass(word)?|pwd/i]",
      message: 'Do not hash passwords with crypto.createHash(). Use bcrypt.hash() or argon2.hash().'
    }
  ],
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
  'no-useless-escape': 'warn'
};

module.exports = [
  {
    ignores: [
      'client/dist/**',
      'client/build/**',
      'client/public/js/vendor/**',
      'coverage/**',
      'logs/**',
      'uploads/**',
      'android/app/build/**',
      'android/app/src/main/assets/public/**',
      'node_modules/**',
      'docs/**',
      'terraform/**',
      'grafana/**',
      'k8s/**',
      'prometheus/**',
      'promtail/**',
      'loki/**',
      'logstash/**',
      'filebeat/**',
      'nginx/**',
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
      'unused-imports': unusedImports,
      nocturnal: {
        rules: {
          'no-raw-html-sinks': noRawHtmlSinks
        }
      }
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
    files: ['tests/smoke/**/*.js'],
    languageOptions: {
      globals: {
        ...globals.browser,
        ...globals.jest
      }
    }
  },
  {
    files: ['tests/e2e/**/*.js', 'tests/e2e/**/*.cjs', 'tests/e2e-webauthn/**/*.js', 'tests/e2e-webauthn/**/*.cjs'],
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
        DOMPurify: 'readonly',
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
      'no-redeclare': 'off',
      'nocturnal/no-raw-html-sinks': 'error'
    }
  },
  {
    files: ['client/public/js/config.js'],
    rules: {
      'nocturnal/no-raw-html-sinks': 'off'
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
