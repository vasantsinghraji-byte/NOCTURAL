/**
 * Service Worker Registration
 * Registers the service worker and handles updates
 */

(function() {
  'use strict';

  // Check if service workers are supported
  if (!('serviceWorker' in navigator)) {
    console.log('Service Workers not supported');
    return;
  }

  const HTML_CACHE_REFRESH_KEY = 'nocturnal-html-cache-refresh-attempted';

  function ensureStylesheet(href) {
    if (document.querySelector('link[href="' + href + '"]')) {
      return;
    }

    const link = document.createElement('link');
    link.rel = 'stylesheet';
    link.href = href;
    document.head.appendChild(link);
  }

  function shouldRefreshHtmlCache(message) {
    return /AppConfig is not defined|NocturnalSession is not defined|Unexpected token '<'|Loading chunk|Failed to fetch dynamically imported module|Cannot read properties of undefined/i.test(message || '');
  }

  function requestHtmlCacheRefresh(reason) {
    if (!navigator.serviceWorker.controller || sessionStorage.getItem(HTML_CACHE_REFRESH_KEY) === 'true') {
      return;
    }

    sessionStorage.setItem(HTML_CACHE_REFRESH_KEY, 'true');
    navigator.serviceWorker.controller.postMessage({
      type: 'NOCTURNAL_REFRESH_HTML_CACHE',
      reason: reason || 'app_boot_failure',
      url: window.location.href
    });
  }

  // Register service worker
  function registerServiceWorker() {
    navigator.serviceWorker.register('/service-worker.js')
      .then(function(registration) {
        console.log('Service Worker registered:', registration.scope);

        // Check for updates periodically
        setInterval(function() {
          registration.update();
        }, 60 * 60 * 1000); // Check every hour

        // Handle updates
        registration.addEventListener('updatefound', function() {
          const newWorker = registration.installing;

          newWorker.addEventListener('statechange', function() {
            if (newWorker.state === 'installed' && navigator.serviceWorker.controller) {
              // New service worker available, show update notification
              showUpdateNotification();
            }
          });
        });
      })
      .catch(function(error) {
        console.error('Service Worker registration failed:', error);
      });
  }

  // Show update notification to user
  function showUpdateNotification() {
    if (document.getElementById('sw-update-banner')) {
      return;
    }

    ensureStylesheet('/css/components/sw-register.css');

    const updateBanner = document.createElement('div');
    updateBanner.id = 'sw-update-banner';
    updateBanner.className = 'sw-update-card';

    const title = document.createElement('p');
    title.className = 'sw-update-title';
    title.textContent = 'New version available!';

    const reloadButton = document.createElement('button');
    reloadButton.type = 'button';
    reloadButton.className = 'sw-update-button sw-update-button-primary';
    reloadButton.dataset.swAction = 'reload';
    reloadButton.textContent = 'Update Now';

    const dismissButton = document.createElement('button');
    dismissButton.type = 'button';
    dismissButton.className = 'sw-update-button sw-update-button-secondary';
    dismissButton.dataset.swAction = 'dismiss';
    dismissButton.textContent = 'Later';

    updateBanner.append(title, reloadButton, dismissButton);
    document.body.appendChild(updateBanner);

    if (reloadButton) {
      reloadButton.addEventListener('click', function() {
        window.location.reload();
      });
    }

    if (dismissButton) {
      dismissButton.addEventListener('click', function() {
        updateBanner.remove();
      });
    }
  }

  // Handle service worker controller change
  navigator.serviceWorker.addEventListener('controllerchange', function() {
    console.log('Service Worker controller changed');
  });

  // Listen for messages from service worker
  navigator.serviceWorker.addEventListener('message', function(event) {
    console.log('Message from Service Worker:', event.data);

    if (event.data.type === 'CACHE_UPDATED') {
      // Cache was updated
      console.log('Cache updated:', event.data.url);
    }

    if (event.data.type === 'NOCTURNAL_HTML_CACHE_REFRESHED') {
      window.location.reload();
    }
  });

  window.addEventListener('error', function(event) {
    const message = event.message || (event.error && event.error.message);
    if (shouldRefreshHtmlCache(message)) {
      requestHtmlCacheRefresh(message);
    }
  });

  window.addEventListener('unhandledrejection', function(event) {
    const reason = event.reason || {};
    const message = reason.message || String(reason);
    if (shouldRefreshHtmlCache(message)) {
      requestHtmlCacheRefresh(message);
    }
  });

  // Register on load
  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', registerServiceWorker);
  } else {
    registerServiceWorker();
  }

  // Expose unregister function for debugging
  window.unregisterServiceWorker = function() {
    navigator.serviceWorker.getRegistrations().then(function(registrations) {
      registrations.forEach(function(registration) {
        registration.unregister().then(function(success) {
          if (success) {
            console.log('Service Worker unregistered');
          }
        });
      });
    });
  };

  // Check online/offline status
  function updateOnlineStatus() {
    const isOnline = navigator.onLine;
    document.body.classList.toggle('offline', !isOnline);

    if (!isOnline) {
      showOfflineIndicator();
    } else {
      hideOfflineIndicator();
    }
  }

  function showOfflineIndicator() {
    if (document.getElementById('offline-indicator')) return;

    ensureStylesheet('/css/components/sw-register.css');

    const indicator = document.createElement('div');
    indicator.id = 'offline-indicator';
    indicator.className = 'offline-indicator-banner';
    indicator.textContent = 'You are offline. Some features may be unavailable.';
    document.body.appendChild(indicator);
  }

  function hideOfflineIndicator() {
    const indicator = document.getElementById('offline-indicator');
    if (indicator) {
      indicator.remove();
    }
  }

  window.addEventListener('online', updateOnlineStatus);
  window.addEventListener('offline', updateOnlineStatus);

  // Initial status check
  updateOnlineStatus();

})();
