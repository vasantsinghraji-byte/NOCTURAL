if (typeof AppConfig === 'undefined' || typeof NocturnalSession === 'undefined') {
    console.error('provider-session.js: dependencies missing - ensure config.js and frontend-session.js load first');
}

(function initProviderSession() {
    function navigateTo(url) {
        window.location.href = url;
    }

    function createProviderSessionExtension(baseSession) {
        return Object.assign({}, baseSession, {
            getStoredProvider: baseSession.getStoredRole,
            redirectAuthenticatedLogin: function(options) {
                var config = Object.assign({
                    redirectUrl: AppConfig.routes.page('provider.dashboard')
                }, options || {});

                if (!baseSession.isAuthenticated()) {
                    return false;
                }

                navigateTo(config.redirectUrl);
                return true;
            }
        });
    }

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
        extendSession: createProviderSessionExtension
    });

    window.ProviderSession = providerSession;
}());
