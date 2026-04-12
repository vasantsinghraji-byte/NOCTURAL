if (typeof AppConfig === 'undefined' || typeof NocturnalSession === 'undefined') {
    console.error('patient-session.js: dependencies missing - ensure config.js and frontend-session.js load first');
}

(function initPatientSession(window) {
    var patientSession = NocturnalSession.createRoleSession({
        role: 'patient',
        storageKeys: ['patient'],
        tokenKeys: ['token', 'patientToken'],
        legacyTokenKeys: ['patientToken'],
        redirectUrl: AppConfig.routes.page('patient.login'),
        fallbackName: '',
        getName: function(patient) {
            return patient.name || '';
        }
    });

    patientSession.getStoredPatient = patientSession.getStoredRole;

    window.PatientSession = patientSession;
})(window);
