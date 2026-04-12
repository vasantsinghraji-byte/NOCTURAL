if (typeof AppConfig === 'undefined' || typeof NocturnalSession === 'undefined') {
    console.error('provider-session.js: dependencies missing - ensure config.js and frontend-session.js load first');
}

(function initProviderSession(window) {
    var providerSession = NocturnalSession.createRoleSession({
        role: 'provider',
        storageKeys: ['provider'],
        tokenKeys: ['token', 'providerToken'],
        legacyTokenKeys: ['providerToken'],
        redirectUrl: AppConfig.routes.page('provider.login'),
        fallbackName: 'Provider',
        fallbackRole: 'Healthcare Professional',
        getName: function(provider) {
            return provider.name || 'Provider';
        },
        getRoleLabel: function(provider) {
            return provider.role
                ? provider.role.charAt(0).toUpperCase() + provider.role.slice(1)
                : 'Healthcare Professional';
        },
        extendSession: function(session) {
            session.getStoredProvider = session.getStoredRole;
            session.redirectAuthenticatedLogin = function(options) {
                var config = Object.assign({
                    redirectUrl: AppConfig.routes.page('provider.dashboard')
                }, options || {});

                if (!session.isAuthenticated()) {
                    return false;
                }

                window.location.href = config.redirectUrl;
                return true;
            };

            return session;
        }
    });

    window.ProviderSession = providerSession;
})(window);
