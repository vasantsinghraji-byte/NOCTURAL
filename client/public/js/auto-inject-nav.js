/**
 * Auto-inject Navigation Script
 * Add this single line to any page to get unified navigation and notifications:
 * <script src="/js/auto-inject-nav.js"></script>
 */

(function() {
    // Load Font Awesome if not already loaded
    if (!document.querySelector('link[href*="font-awesome"]')) {
        const fontAwesome = document.createElement('link');
        fontAwesome.rel = 'stylesheet';
        fontAwesome.href = 'https://cdnjs.cloudflare.com/ajax/libs/font-awesome/6.0.0/css/all.min.css';
        document.head.appendChild(fontAwesome);
    }

    // Load Unified Navigation
    const navScript = document.createElement('script');
    navScript.src = '/js/unified-nav.js';
    navScript.defer = true;
    document.head.appendChild(navScript);

    // Load Notification Center
    const notifScript = document.createElement('script');
    notifScript.src = '/js/notification-center.js';
    notifScript.defer = true;
    document.head.appendChild(notifScript);

    // Load Utils (Toast, Loading, Error Handling)
    const utilsScript = document.createElement('script');
    utilsScript.src = '/js/utils.js';
    utilsScript.defer = true;
    document.head.appendChild(utilsScript);

    console.log('Navigation, notifications, and utils auto-injected');
})();
