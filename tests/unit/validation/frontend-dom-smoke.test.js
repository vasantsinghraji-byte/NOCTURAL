const fs = require('fs');
const path = require('path');
const vm = require('vm');

const rootDir = path.resolve(__dirname, '..', '..', '..');

class FakeClassList {
  constructor() {
    this.values = new Set();
  }

  toggle(className) {
    if (this.values.has(className)) {
      this.values.delete(className);
      return false;
    }

    this.values.add(className);
    return true;
  }

  contains(className) {
    return this.values.has(className);
  }
}

class FakeInteractiveElement {
  constructor({ dataset = {}, value = '', disabled = false } = {}) {
    this.dataset = dataset;
    this.value = value;
    this.disabled = disabled;
    this.listeners = {};
  }

  addEventListener(type, handler) {
    this.listeners[type] = handler;
  }

  click() {
    if (this.disabled || !this.listeners.click) {
      return;
    }

    this.listeners.click({ target: this });
  }

  dispatchChange() {
    if (this.listeners.change) {
      this.listeners.change({ target: this });
    }
  }
}

class FakeMarkupContainer {
  constructor() {
    this._innerHTML = '';
    this.pageButtons = [];
    this.limitSelect = null;
    this.retryButton = null;
  }

  set innerHTML(value) {
    this._innerHTML = value;
    this.pageButtons = [];
    this.limitSelect = null;
    this.retryButton = null;

    const pageButtonPattern = /<button[^>]*data-page="([^"]+)"[^>]*data-pagination-action="page-change"[^>]*?(disabled)?[^>]*>/g;
    let pageMatch = pageButtonPattern.exec(value);
    while (pageMatch) {
      this.pageButtons.push(new FakeInteractiveElement({
        dataset: { page: pageMatch[1] },
        disabled: Boolean(pageMatch[2])
      }));
      pageMatch = pageButtonPattern.exec(value);
    }

    if (value.includes('data-pagination-action="limit-change"')) {
      const selectedOptionMatch = value.match(/<option value="([^"]+)" selected>/);
      this.limitSelect = new FakeInteractiveElement({
        value: selectedOptionMatch ? selectedOptionMatch[1] : ''
      });
    }

    if (value.includes('pagination-retry-btn')) {
      this.retryButton = new FakeInteractiveElement();
    }
  }

  get innerHTML() {
    return this._innerHTML;
  }

  querySelectorAll(selector) {
    if (selector === '[data-pagination-action="page-change"]') {
      return this.pageButtons;
    }

    return [];
  }

  querySelector(selector) {
    if (selector === '[data-pagination-action="limit-change"]') {
      return this.limitSelect;
    }

    if (selector === '.pagination-retry-btn') {
      return this.retryButton;
    }

    return null;
  }
}

function createBaseContext() {
  const documentListeners = {};
  const localStorageValues = {};

  const localStorage = {
    getItem(key) {
      return Object.prototype.hasOwnProperty.call(localStorageValues, key)
        ? localStorageValues[key]
        : null;
    },
    setItem(key, value) {
      localStorageValues[key] = String(value);
    },
    removeItem(key) {
      delete localStorageValues[key];
    }
  };

  const document = {
    readyState: 'loading',
    head: { appendChild: jest.fn() },
    body: { appendChild: jest.fn() },
    createElement: jest.fn(() => ({ style: {}, className: '', innerHTML: '', appendChild: jest.fn() })),
    querySelector: jest.fn(() => null),
    querySelectorAll: jest.fn(() => []),
    getElementById: jest.fn(() => null),
    addEventListener: jest.fn((type, handler) => {
      documentListeners[type] = handler;
    })
  };

  const windowObject = {
    location: { href: '', origin: 'http://localhost', pathname: '/roles/doctor/doctor-dashboard.html' },
    innerWidth: 768,
    addEventListener: jest.fn(),
    removeEventListener: jest.fn(),
    document,
    localStorage
  };

  return {
    console: {
      ...console,
      log: jest.fn(),
      error: jest.fn(),
      warn: jest.fn()
    },
    setTimeout,
    clearTimeout,
    setInterval,
    clearInterval,
    fetch: jest.fn(),
    confirm: jest.fn(() => true),
    localStorage,
    document,
    window: windowObject,
    navigator: { serviceWorker: { addEventListener: jest.fn() }, onLine: true },
    AppConfig: undefined,
    URLSearchParams,
    __documentListeners: documentListeners
  };
}

function loadUnifiedNavigation() {
  const filePath = path.join(rootDir, 'client', 'public', 'js', 'unified-nav.js');
  const source = fs.readFileSync(filePath, 'utf8');
  const context = createBaseContext();
  vm.runInNewContext(`${source}\nthis.__UnifiedNavigation = UnifiedNavigation;`, context);
  return {
    UnifiedNavigation: context.__UnifiedNavigation,
    context
  };
}

function loadPaginationUtils() {
  const filePath = path.join(rootDir, 'client', 'public', 'js', 'pagination.js');
  const source = fs.readFileSync(filePath, 'utf8');
  const context = createBaseContext();
  vm.runInNewContext(source, context);
  return {
    PaginationUtils: context.window.PaginationUtils,
    context
  };
}

function loadNotificationCenter() {
  const filePath = path.join(rootDir, 'client', 'public', 'js', 'notification-center.js');
  const source = fs.readFileSync(filePath, 'utf8');
  const context = createBaseContext();
  vm.runInNewContext(`${source}\nthis.__NotificationCenter = NotificationCenter;`, context);
  return {
    NotificationCenter: context.__NotificationCenter,
    context
  };
}

function createElementNode(tagName) {
  const node = {
    tagName: String(tagName || '').toUpperCase(),
    style: {},
    dataset: {},
    listeners: {},
    children: [],
    classList: new FakeClassList(),
    _innerHTML: '',
    addEventListener(type, handler) {
      this.listeners[type] = handler;
    },
    appendChild(child) {
      this.children.push(child);
    },
    remove: jest.fn()
  };

  Object.defineProperty(node, 'innerHTML', {
    get() {
      return this._innerHTML;
    },
    set(value) {
      this._innerHTML = value;
      this.children = [];

      if (typeof value === 'string' && value.includes('data-sw-action="reload"')) {
        this.reloadButton = new FakeInteractiveElement();
        this.dismissButton = new FakeInteractiveElement();
      }
    }
  });

  node.querySelector = function(selector) {
    if (selector === '[data-sw-action="reload"]') {
      return this.reloadButton || null;
    }

    if (selector === '[data-sw-action="dismiss"]') {
      return this.dismissButton || null;
    }

    return null;
  };

  return node;
}

function loadSwRegister() {
  const filePath = path.join(rootDir, 'client', 'public', 'js', 'sw-register.js');
  const source = fs.readFileSync(filePath, 'utf8');
  const context = createBaseContext();
  const nodesById = {};
  const registrationListeners = {};
  const workerListeners = {};
  const registration = {
    scope: '/',
    installing: {
      state: 'installing',
      addEventListener: jest.fn((type, handler) => {
        workerListeners[type] = handler;
      })
    },
    update: jest.fn(),
    addEventListener: jest.fn((type, handler) => {
      registrationListeners[type] = handler;
    })
  };

  context.setInterval = jest.fn(() => 1);
  context.clearInterval = jest.fn();
  context.window.location.reload = jest.fn();
  context.document.body.classList = new FakeClassList();
  context.document.body.appendChild = jest.fn((node) => {
    if (node && node.id) {
      nodesById[node.id] = node;
    }
  });
  context.document.head.appendChild = jest.fn((node) => {
    if (node && node.id) {
      nodesById[node.id] = node;
    }
  });
  context.document.createElement = jest.fn((tagName) => createElementNode(tagName));
  context.document.getElementById = jest.fn((id) => nodesById[id] || null);
  context.navigator.serviceWorker = {
    controller: {},
    register: jest.fn(() => Promise.resolve(registration)),
    addEventListener: jest.fn(),
    getRegistrations: jest.fn(() => Promise.resolve([]))
  };

  vm.runInNewContext(source, context);

  return {
    context,
    registration,
    registrationListeners,
    workerListeners,
    nodesById
  };
}

describe('Frontend DOM Smoke', () => {
  it('should route unified navigation delegated click actions to the expected handlers', () => {
    const { UnifiedNavigation } = loadUnifiedNavigation();

    const navElement = {
      addEventListener(type, handler) {
        this[type] = handler;
      }
    };

    const instance = {
      toggleMobileMenu: jest.fn(),
      toggleDropdown: jest.fn(),
      logout: jest.fn()
    };

    UnifiedNavigation.prototype.attachNavEventListeners.call(instance, navElement);

    const mobileAction = {
      dataset: { navAction: 'toggle-mobile-menu' },
      closest(selector) {
        return selector === '[data-nav-action]' ? this : null;
      }
    };

    const dropdownAction = {
      dataset: { navAction: 'toggle-dropdown' },
      closest(selector) {
        return selector === '[data-nav-action]' ? this : null;
      }
    };

    const logoutAction = {
      dataset: { navAction: 'logout' },
      closest(selector) {
        return selector === '[data-nav-action]' ? this : null;
      }
    };

    const mobileEvent = { target: mobileAction };
    const dropdownEvent = { target: dropdownAction };
    const logoutEvent = { target: logoutAction };

    navElement.click(mobileEvent);
    navElement.click(dropdownEvent);
    navElement.click(logoutEvent);

    expect(instance.toggleMobileMenu).toHaveBeenCalledTimes(1);
    expect(instance.toggleDropdown).toHaveBeenCalledWith(dropdownEvent, dropdownAction);
    expect(instance.logout).toHaveBeenCalledWith(logoutEvent);
  });

  it('should let PaginationManager bind page and limit controls after rendering', () => {
    const { PaginationUtils } = loadPaginationUtils();
    const dataContainer = new FakeMarkupContainer();
    const paginationContainer = new FakeMarkupContainer();
    const limitContainer = new FakeMarkupContainer();

    const manager = new PaginationUtils.PaginationManager({
      container: dataContainer,
      paginationContainer,
      limitContainer,
      renderItem: (item) => `<div>${item.label}</div>`
    });

    manager.loadPage = jest.fn();
    manager.state.data = [{ label: 'Alpha' }];
    manager.state.pagination = {
      page: 2,
      pages: 4,
      hasNext: true,
      hasPrev: true,
      nextPage: 3,
      prevPage: 1,
      total: 16,
      count: 4,
      limit: 4
    };

    manager.render();

    const nextButton = paginationContainer.pageButtons.find((button) => button.dataset.page === '3');
    const limitSelect = limitContainer.limitSelect;

    expect(nextButton).toBeTruthy();
    expect(limitSelect).toBeTruthy();

    nextButton.click();
    limitSelect.value = '50';
    limitSelect.dispatchChange();

    expect(manager.loadPage).toHaveBeenNthCalledWith(1, 3);
    expect(manager.state.limit).toBe(50);
    expect(manager.loadPage).toHaveBeenNthCalledWith(2, 1);
  });

  it('should delegate notification clicks through NotificationCenter event binding', () => {
    const { NotificationCenter, context } = loadNotificationCenter();
    const bell = new FakeInteractiveElement();
    const markAllReadButton = new FakeInteractiveElement();
    const notificationList = new FakeInteractiveElement();
    const panel = { contains: jest.fn(() => false) };

    context.document.getElementById = jest.fn((id) => {
      if (id === 'notificationBell') return bell;
      if (id === 'markAllReadBtn') return markAllReadButton;
      if (id === 'notificationList') return notificationList;
      if (id === 'notificationPanel') return panel;
      return null;
    });

    const instance = {
      isOpen: false,
      togglePanel: jest.fn(),
      markAllAsRead: jest.fn(),
      handleNotificationClick: jest.fn(),
      closePanel: jest.fn()
    };

    NotificationCenter.prototype.attachEventListeners.call(instance);

    const clickedNotification = {
      dataset: { notificationId: 'notif-42' },
      closest(selector) {
        return selector === '[data-notification-id]' ? this : null;
      }
    };

    notificationList.listeners.click({ target: clickedNotification });

    expect(instance.handleNotificationClick).toHaveBeenCalledWith('notif-42');
    expect(markAllReadButton.listeners.click).toBeDefined();
    expect(bell.listeners.click).toBeDefined();
    expect(context.__documentListeners.click).toBeDefined();
  });

  it('should wire service-worker update banner buttons through bound listeners', async () => {
    const { context, registration, registrationListeners, workerListeners, nodesById } = loadSwRegister();

    await context.__documentListeners.DOMContentLoaded();
    await Promise.resolve();

    expect(context.navigator.serviceWorker.register).toHaveBeenCalledWith('/service-worker.js');
    expect(registration.addEventListener).toHaveBeenCalledWith('updatefound', expect.any(Function));

    registrationListeners.updatefound();
    registration.installing.state = 'installed';
    workerListeners.statechange();

    const updateBanner = nodesById['sw-update-banner'];
    expect(updateBanner).toBeTruthy();
    expect(updateBanner.querySelector('[data-sw-action="reload"]').listeners.click).toBeDefined();
    expect(updateBanner.querySelector('[data-sw-action="dismiss"]').listeners.click).toBeDefined();

    updateBanner.querySelector('[data-sw-action="reload"]').click();
    expect(context.window.location.reload).toHaveBeenCalledTimes(1);

    updateBanner.querySelector('[data-sw-action="dismiss"]').click();
    expect(updateBanner.remove).toHaveBeenCalledTimes(1);
  });
});
