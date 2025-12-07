/**
 * Lazy Loading for Images
 * Progressive image loading to improve initial page load performance
 */

(function() {
  'use strict';

  // Configuration
  const CONFIG = {
    rootMargin: '50px', // Start loading 50px before image enters viewport
    threshold: 0.01,
    loadingClass: 'lazy-loading',
    loadedClass: 'lazy-loaded',
    errorClass: 'lazy-error',
    placeholderDataAttr: 'data-src',
    srcsetDataAttr: 'data-srcset',
    bgImageDataAttr: 'data-bg'
  };

  /**
   * Check if IntersectionObserver is supported
   */
  function isIntersectionObserverSupported() {
    return 'IntersectionObserver' in window;
  }

  /**
   * Load image
   */
  function loadImage(img) {
    const src = img.getAttribute(CONFIG.placeholderDataAttr);
    const srcset = img.getAttribute(CONFIG.srcsetDataAttr);
    const bgImage = img.getAttribute(CONFIG.bgImageDataAttr);

    // Add loading class
    img.classList.add(CONFIG.loadingClass);

    if (bgImage) {
      // Background image
      img.style.backgroundImage = `url(${bgImage})`;
      img.classList.remove(CONFIG.loadingClass);
      img.classList.add(CONFIG.loadedClass);
      img.removeAttribute(CONFIG.bgImageDataAttr);
    } else {
      // Regular image
      const imageToLoad = new Image();

      imageToLoad.onload = function() {
        if (src) {
          img.src = src;
          img.removeAttribute(CONFIG.placeholderDataAttr);
        }

        if (srcset) {
          img.srcset = srcset;
          img.removeAttribute(CONFIG.srcsetDataAttr);
        }

        img.classList.remove(CONFIG.loadingClass);
        img.classList.add(CONFIG.loadedClass);
      };

      imageToLoad.onerror = function() {
        img.classList.remove(CONFIG.loadingClass);
        img.classList.add(CONFIG.errorClass);
        console.error('Failed to load image:', src || bgImage);
      };

      imageToLoad.src = src;
      if (srcset) {
        imageToLoad.srcset = srcset;
      }
    }
  }

  /**
   * Initialize lazy loading with IntersectionObserver
   */
  function initIntersectionObserver() {
    const images = document.querySelectorAll(`[${CONFIG.placeholderDataAttr}], [${CONFIG.bgImageDataAttr}]`);

    if (images.length === 0) {
      return;
    }

    const imageObserver = new IntersectionObserver(function(entries, observer) {
      entries.forEach(function(entry) {
        if (entry.isIntersecting) {
          const img = entry.target;
          loadImage(img);
          observer.unobserve(img);
        }
      });
    }, {
      rootMargin: CONFIG.rootMargin,
      threshold: CONFIG.threshold
    });

    images.forEach(function(img) {
      imageObserver.observe(img);
    });

    console.log(`LazyLoad: Observing ${images.length} images`);
  }

  /**
   * Fallback for browsers without IntersectionObserver
   */
  function initScrollListener() {
    const images = document.querySelectorAll(`[${CONFIG.placeholderDataAttr}], [${CONFIG.bgImageDataAttr}]`);

    if (images.length === 0) {
      return;
    }

    let timeout;

    function checkImages() {
      images.forEach(function(img) {
        if (isInViewport(img)) {
          loadImage(img);
        }
      });
    }

    function isInViewport(element) {
      const rect = element.getBoundingClientRect();
      const margin = parseInt(CONFIG.rootMargin);

      return (
        rect.bottom >= -margin &&
        rect.right >= -margin &&
        rect.top <= (window.innerHeight || document.documentElement.clientHeight) + margin &&
        rect.left <= (window.innerWidth || document.documentElement.clientWidth) + margin
      );
    }

    function handleScroll() {
      clearTimeout(timeout);
      timeout = setTimeout(checkImages, 100);
    }

    window.addEventListener('scroll', handleScroll);
    window.addEventListener('resize', handleScroll);
    window.addEventListener('orientationchange', handleScroll);

    // Initial check
    checkImages();

    console.log(`LazyLoad: Scroll listener initialized for ${images.length} images`);
  }

  /**
   * Initialize lazy loading
   */
  function init() {
    if (isIntersectionObserverSupported()) {
      initIntersectionObserver();
    } else {
      initScrollListener();
    }
  }

  /**
   * Add CSS for lazy loading states
   */
  function addStyles() {
    const style = document.createElement('style');
    style.textContent = `
      .lazy-loading {
        filter: blur(5px);
        transition: filter 0.3s;
      }

      .lazy-loaded {
        filter: blur(0);
      }

      .lazy-error {
        opacity: 0.5;
      }

      /* Low quality placeholder */
      img[${CONFIG.placeholderDataAttr}] {
        background: #f0f0f0;
      }

      /* Fade-in animation */
      @keyframes fadeIn {
        from { opacity: 0; }
        to { opacity: 1; }
      }

      .lazy-loaded {
        animation: fadeIn 0.3s ease-in;
      }
    `;
    document.head.appendChild(style);
  }

  // Auto-initialize on DOMContentLoaded
  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', function() {
      addStyles();
      init();
    });
  } else {
    addStyles();
    init();
  }

  // Re-initialize on dynamic content changes
  window.reinitLazyLoad = init;

  // Export for module systems
  if (typeof module !== 'undefined' && module.exports) {
    module.exports = { init, loadImage, CONFIG };
  }

  // Expose globally
  window.LazyLoad = { init, loadImage, CONFIG };

})();
