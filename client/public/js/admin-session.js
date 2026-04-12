if (typeof AppConfig === 'undefined' || typeof NocturnalSession === 'undefined') {
    console.error('admin-session.js: dependencies missing - ensure config.js and frontend-session.js load first');
}

(function initAdminSession(window) {
    var adminSession = NocturnalSession.createRoleSession({
        role: 'admin',
        storageKeys: ['hospital', 'admin'],
        tokenKeys: ['token'],
        redirectUrl: AppConfig.routes.page('home'),
        userType: 'hospital',
        fallbackName: 'Administrator',
        getName: function(admin) {
            return admin.name || 'Administrator';
        }
    });

    adminSession.getStoredAdmin = adminSession.getStoredRole;

    window.AdminSession = adminSession;
})(window);
