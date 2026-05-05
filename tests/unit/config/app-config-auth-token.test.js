const fs = require('fs');
const path = require('path');
const vm = require('vm');

const rootDir = path.resolve(__dirname, '..', '..', '..');
const configSrc = fs.readFileSync(path.join(rootDir, 'client/public/js/config.js'), 'utf8');

function createLocalStorage(initialValues = {}) {
  const store = new Map(Object.entries(initialValues));

  return {
    getItem(key) {
      return store.has(key) ? store.get(key) : null;
    },
    setItem(key, value) {
      store.set(key, String(value));
    },
    removeItem(key) {
      store.delete(key);
    },
    clear() {
      store.clear();
    }
  };
}

function loadAppConfig(storageValues = {}) {
  const localStorage = createLocalStorage(storageValues);
  const context = {
    window: {
      location: {
        hostname: 'app.nocturnal.test',
        origin: 'https://app.nocturnal.test',
        protocol: 'https:'
      }
    },
    document: {
      querySelector: jest.fn(() => null)
    },
    localStorage,
    console: {
      log: jest.fn(),
      error: jest.fn()
    },
    fetch: jest.fn(),
    FormData: function FormData() {},
    AbortController,
    setTimeout,
    clearTimeout
  };

  vm.createContext(context);
  vm.runInContext(configSrc, context);

  return {
    AppConfig: context.window.AppConfig,
    localStorage
  };
}

describe('AppConfig auth token storage', () => {
  it('should migrate legacy patientToken values into the shared token key', () => {
    const { AppConfig, localStorage } = loadAppConfig({
      patientToken: 'legacy-patient-token'
    });

    expect(AppConfig.getToken()).toBe('legacy-patient-token');
    expect(localStorage.getItem('token')).toBe('legacy-patient-token');
    expect(localStorage.getItem('patientToken')).toBeNull();
  });

  it('should migrate legacy providerToken values into the shared token key', () => {
    const { AppConfig, localStorage } = loadAppConfig({
      providerToken: 'legacy-provider-token'
    });

    expect(AppConfig.getToken({ tokenKeys: ['providerToken'] })).toBe('legacy-provider-token');
    expect(localStorage.getItem('token')).toBe('legacy-provider-token');
    expect(localStorage.getItem('providerToken')).toBeNull();
  });

  it('should report authentication state through isAuthenticated()', () => {
    const authenticated = loadAppConfig({
      token: 'shared-token'
    });
    const unauthenticated = loadAppConfig();

    expect(authenticated.AppConfig.isAuthenticated()).toBe(true);
    expect(unauthenticated.AppConfig.isAuthenticated()).toBe(false);
  });

  it('should clear both shared and legacy patient token keys together', () => {
    const { AppConfig, localStorage } = loadAppConfig({
      token: 'shared-token',
      patientToken: 'legacy-patient-token',
      providerToken: 'legacy-provider-token'
    });

    AppConfig.clearToken();

    expect(localStorage.getItem('token')).toBeNull();
    expect(localStorage.getItem('patientToken')).toBeNull();
    expect(localStorage.getItem('providerToken')).toBeNull();
  });
});
