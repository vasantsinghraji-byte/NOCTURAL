/**
 * Resource Hints Helper
 * Adds preload, prefetch, and preconnect hints to improve page load performance
 */

(function() {
  'use strict';

  /**
   * Add preconnect hint for external domains
   */
  function preconnect(url, crossorigin = false) {
    const link = document.createElement('link');
    link.rel = 'preconnect';
    link.href = url;

    if (crossorigin) {
      link.crossOrigin = 'anonymous';
    }

    document.head.appendChild(link);
  }

  /**
   * Add DNS prefetch for external domains
   */
  function dnsPrefetch(url) {
    const link = document.createElement('link');
    link.rel = 'dns-prefetch';
    link.href = url;
    document.head.appendChild(link);
  }

  /**
   * Add preload hint for critical resources
   */
  function preload(url, as, type = null, crossorigin = false) {
    const link = document.createElement('link');
    link.rel = 'preload';
    link.href = url;
    link.as = as;

    if (type) {
      link.type = type;
    }

    if (crossorigin) {
      link.crossOrigin = 'anonymous';
    }

    document.head.appendChild(link);
  }

  /**
   * Add prefetch hint for future navigation
   */
  function prefetch(url, as = null) {
    const link = document.createElement('link');
    link.rel = 'prefetch';
    link.href = url;

    if (as) {
      link.as = as;
    }

    document.head.appendChild(link);
  }

  /**
   * Add prerender hint for likely next page
   */
  function prerender(url) {
    const link = document.createElement('link');
    link.rel = 'prerender';
    link.href = url;
    document.head.appendChild(link);
  }

  /**
   * Defer non-critical CSS loading
   */
  function loadCSS(href, media = 'all') {
    const link = document.createElement('link');
    link.rel = 'stylesheet';
    link.href = href;
    link.media = 'print'; // Load as print stylesheet initially
    link.onload = function() {
      this.media = media; // Switch to target media once loaded
    };

    document.head.appendChild(link);

    // Fallback for browsers that don't support onload
    setTimeout(function() {
      link.media = media;
    }, 3000);
  }

  /**
   * Defer JavaScript loading
   */
  function loadJS(src, async = true, defer = true) {
    return new Promise((resolve, reject) => {
      const script = document.createElement('script');
      script.src = src;

      if (async) script.async = true;
      if (defer) script.defer = true;

      script.onload = () => resolve(script);
      script.onerror = () => reject(new Error(`Failed to load script: ${src}`));

      document.body.appendChild(script);
    });
  }

  /**
   * Load script with timeout
   */
  function loadJSWithTimeout(src, timeout = 5000) {
    return new Promise((resolve, reject) => {
      const timer = setTimeout(() => {
        reject(new Error(`Script load timeout: ${src}`));
      }, timeout);

      loadJS(src)
        .then((script) => {
          clearTimeout(timer);
          resolve(script);
        })
        .catch((error) => {
          clearTimeout(timer);
          reject(error);
        });
    });
  }

  /**
   * Initialize critical resource hints
   */
  function initCriticalHints() {
    // Preconnect to API server
    const apiOrigin = window.API_URL || (window.location.protocol + '//' + window.location.host);
    if (apiOrigin !== window.location.origin) {
      preconnect(apiOrigin, true);
    }

    // DNS prefetch for external resources
    const externalDomains = [
      'https://fonts.googleapis.com',
      'https://fonts.gstatic.com',
      'https://cdn.jsdelivr.net'
    ];

    externalDomains.forEach(domain => dnsPrefetch(domain));
  }

  /**
   * Prefetch likely next pages based on current page
   */
  function prefetchLikelyPages() {
    const currentPath = window.location.pathname;

    const prefetchMap = {
      '/': ['/roles/doctor/browse-duties.html', '/roles/doctor/doctor-dashboard.html'],
      '/roles/doctor/browse-duties.html': ['/roles/doctor/duty-details.html', '/roles/doctor/my-applications.html'],
      '/roles/doctor/doctor-dashboard.html': ['/roles/doctor/calendar.html', '/roles/doctor/earnings.html'],
      '/roles/admin/admin-dashboard.html': ['/roles/admin/admin-analytics.html', '/roles/admin/admin-post-duty.html']
    };

    const pagesToPrefetch = prefetchMap[currentPath] || [];

    pagesToPrefetch.forEach(page => {
      prefetch(page, 'document');
    });
  }

  /**
   * Add resource hints based on user interaction
   */
  function addInteractionHints() {
    // Preload resources when user hovers over links
    document.addEventListener('mouseover', function(e) {
      if (e.target.tagName === 'A' && e.target.href) {
        const href = e.target.getAttribute('href');

        if (href && href.startsWith('/') && href.endsWith('.html')) {
          // Prefetch page on hover
          prefetch(href, 'document');
        }
      }
    }, { passive: true });
  }

  /**
   * Initialize all optimizations
   */
  function init() {
    // Wait for DOM to be ready
    if (document.readyState === 'loading') {
      document.addEventListener('DOMContentLoaded', function() {
        initCriticalHints();

        // Defer non-critical hints
        if ('requestIdleCallback' in window) {
          requestIdleCallback(function() {
            prefetchLikelyPages();
            addInteractionHints();
          });
        } else {
          setTimeout(function() {
            prefetchLikelyPages();
            addInteractionHints();
          }, 1000);
        }
      });
    } else {
      initCriticalHints();
      prefetchLikelyPages();
      addInteractionHints();
    }
  }

  // Auto-initialize
  init();

  // Expose API
  window.ResourceHints = {
    preconnect,
    dnsPrefetch,
    preload,
    prefetch,
    prerender,
    loadCSS,
    loadJS,
    loadJSWithTimeout,
    init
  };

})();
