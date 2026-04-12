if (typeof AppConfig === 'undefined' || typeof NocturnalSession === 'undefined') {
    console.error('doctor-session.js: dependencies missing - ensure config.js and frontend-session.js load first');
}

(function initDoctorSession(window) {
    var doctorSession = NocturnalSession.createRoleSession({
        role: 'doctor',
        storageKeys: ['doctor', 'user'],
        tokenKeys: ['token'],
        redirectUrl: AppConfig.routes.page('home'),
        userType: 'doctor',
        fallbackName: 'Doctor',
        getName: function(doctor) {
            return doctor.name || doctor.fullName || 'Doctor';
        }
    });

    doctorSession.getStoredDoctor = doctorSession.getStoredRole;

    window.DoctorSession = doctorSession;
})(window);
