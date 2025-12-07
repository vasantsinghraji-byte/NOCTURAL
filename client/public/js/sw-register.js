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
    const updateBanner = document.createElement('div');
    updateBanner.id = 'sw-update-banner';
    updateBanner.innerHTML = `
      <div style="
        position: fixed;
        bottom: 20px;
        right: 20px;
        background: #4CAF50;
        color: white;
        padding: 16px 24px;
        border-radius: 8px;
        box-shadow: 0 4px 12px rgba(0,0,0,0.15);
        z-index: 10000;
        max-width: 300px;
        animation: slideIn 0.3s ease-out;
      ">
        <p style="margin: 0 0 12px 0; font-weight: 600;">
          New version available!
        </p>
        <button onclick="window.location.reload()" style="
          background: white;
          color: #4CAF50;
          border: none;
          padding: 8px 16px;
          border-radius: 4px;
          cursor: pointer;
          font-weight: 600;
        ">
          Update Now
        </button>
        <button onclick="this.closest('div').parentElement.remove()" style="
          background: transparent;
          color: white;
          border: 1px solid white;
          padding: 8px 16px;
          border-radius: 4px;
          cursor: pointer;
          margin-left: 8px;
        ">
          Later
        </button>
      </div>
    `;

    // Add animation
    const style = document.createElement('style');
    style.textContent = `
      @keyframes slideIn {
        from {
          transform: translateX(400px);
          opacity: 0;
        }
        to {
          transform: translateX(0);
          opacity: 1;
        }
      }
    `;
    document.head.appendChild(style);
    document.body.appendChild(updateBanner);
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

    const indicator = document.createElement('div');
    indicator.id = 'offline-indicator';
    indicator.innerHTML = `
      <div style="
        position: fixed;
        top: 0;
        left: 0;
        right: 0;
        background: #f44336;
        color: white;
        padding: 12px;
        text-align: center;
        z-index: 10001;
        font-weight: 600;
        box-shadow: 0 2px 8px rgba(0,0,0,0.15);
      ">
        ⚠️ You are offline. Some features may be unavailable.
      </div>
    `;
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
