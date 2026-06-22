(function initializeNativeCapabilities(windowObject) {
    const capacitor = windowObject.Capacitor;
    const isNative = !!(
        capacitor
        && typeof capacitor.isNativePlatform === 'function'
        && capacitor.isNativePlatform()
    );
    const plugins = (capacitor && capacitor.Plugins) || {};
    const ACCESS_TOKEN_KEY = 'nocturnal.accessToken';
    const REFRESH_TOKEN_KEY = 'nocturnal.refreshToken';
    const BACKGROUND_WATCHER_KEY = 'nocturnal.backgroundLocationWatcher';
    const BACKGROUND_LOCATION_CONSENT_KEY = 'nocturnal.backgroundLocationConsent';
    const DIAGNOSTIC_LOG_KEY = 'nocturnal.diagnosticLog';
    const MAX_DIAGNOSTIC_ENTRIES = 50;
    const STORAGE_PREFIX = 'capacitor-storage_';
    const BACKGROUND_LOCATION_DISCLOSURE = [
        'Allow background location tracking?',
        '',
        'Nocturnal collects your precise location while the app is closed or not in use only during an active care visit or duty workflow.',
        '',
        'This supports arrival verification, active-duty safety, and care coordination. Tracking stops when you end it. Your location is not sold.'
    ].join('\n');

    const requirePlugin = (name) => {
        if (!isNative || !plugins[name]) {
            throw new Error(`${name} is only available in the native Nocturnal application`);
        }
        return plugins[name];
    };

    const secureStorage = () => requirePlugin('SecureStorage');

    const getStoredValue = async (key) => {
        if (!isNative) return null;
        const result = await secureStorage().internalGetItem({
            prefixedKey: `${STORAGE_PREFIX}${key}`,
            sync: false
        });
        return result.data === null ? null : JSON.parse(result.data);
    };

    const setStoredValue = async (key, value) => {
        if (!isNative) return;
        await secureStorage().internalSetItem({
            prefixedKey: `${STORAGE_PREFIX}${key}`,
            data: JSON.stringify(value),
            sync: false,
            access: 0
        });
    };

    const removeStoredValue = async (key) => {
        if (!isNative) return;
        await secureStorage().internalRemoveItem({
            prefixedKey: `${STORAGE_PREFIX}${key}`,
            sync: false
        });
    };

    const sanitizeDiagnosticDetails = (details = {}) => Object.fromEntries(
        Object.entries(details)
            .filter(([key]) => !/token|authorization|password|email|phone|body|payload|patient|user/i.test(key))
            .map(([key, value]) => [
                key,
                typeof value === 'string' ? value.slice(0, 200) : value
            ])
    );

    const logEvent = async (level, event, details = {}) => {
        if (!isNative) return;

        const entry = {
            timestamp: new Date().toISOString(),
            level,
            event,
            details: sanitizeDiagnosticDetails(details)
        };

        try {
            const existing = await getStoredValue(DIAGNOSTIC_LOG_KEY);
            const logs = Array.isArray(existing) ? existing : [];
            await setStoredValue(DIAGNOSTIC_LOG_KEY, [...logs, entry].slice(-MAX_DIAGNOSTIC_ENTRIES));
        } catch (_error) {
            // Diagnostics must never interrupt the user workflow.
        }

        windowObject.dispatchEvent(new CustomEvent('nocturnal:native-log', { detail: entry }));
    };

    const logError = (event, error, details = {}) => logEvent('error', event, {
        ...details,
        errorName: error && error.name,
        errorMessage: error && error.message
    });

    const getDiagnosticLogs = async () => (await getStoredValue(DIAGNOSTIC_LOG_KEY)) || [];

    const clearDiagnosticLogs = () => removeStoredValue(DIAGNOSTIC_LOG_KEY);

    const saveAuthResponse = async (responsePayload) => {
        if (!isNative || !responsePayload) return;
        const payload = responsePayload.data || responsePayload;
        const tokens = payload.tokens;
        if (!tokens || !tokens.accessToken || !tokens.refreshToken) return;

        await Promise.all([
            setStoredValue(ACCESS_TOKEN_KEY, tokens.accessToken),
            setStoredValue(REFRESH_TOKEN_KEY, tokens.refreshToken)
        ]);
    };

    const clearAuth = async () => {
        if (!isNative) return;
        await Promise.all([
            removeStoredValue(ACCESS_TOKEN_KEY),
            removeStoredValue(REFRESH_TOKEN_KEY)
        ]);
    };

    const authenticate = async (reason = 'Authenticate to access Nocturnal') => {
        const biometricAuth = requirePlugin('BiometricAuthNative');
        const availability = await biometricAuth.checkBiometry();
        if (!availability.isAvailable && !availability.deviceIsSecure) {
            throw new Error('Biometric authentication or a secure device credential is required');
        }

        await biometricAuth.authenticate({
            reason,
            androidTitle: 'Nocturnal authentication',
            androidSubtitle: reason,
            androidConfirmationRequired: false,
            allowDeviceCredential: true
        });
        return true;
    };

    const capturePhoto = async () => {
        const camera = requirePlugin('Camera');
        return camera.getPhoto({
            quality: 75,
            allowEditing: false,
            resultType: 'uri',
            source: 'prompt',
            correctOrientation: true,
            saveToGallery: false,
            width: 1600,
            height: 1600
        });
    };

    const captureAndUpload = async (endpoint, fieldName = 'file') => {
        const photo = await capturePhoto();
        if (!photo.webPath) {
            throw new Error('The camera did not return an accessible image');
        }

        const formData = new FormData();
        const photoResponse = await fetch(photo.webPath);
        const photoBlob = await photoResponse.blob();
        formData.append(fieldName, photoBlob, `camera-${Date.now()}.${photo.format || 'jpeg'}`);
        return windowObject.AppConfig.fetchRoute(endpoint, {
            method: 'POST',
            body: formData,
            parseJson: true
        });
    };

    const getCurrentLocation = async () => {
        const geolocation = requirePlugin('Geolocation');
        await geolocation.requestPermissions();
        return geolocation.getCurrentPosition({
            enableHighAccuracy: true,
            timeout: 15000
        });
    };

    const startBackgroundLocation = async (callback) => {
        const backgroundGeolocation = requirePlugin('BackgroundGeolocation');
        const existingWatcher = await getStoredValue(BACKGROUND_WATCHER_KEY);
        if (existingWatcher) return existingWatcher;

        const hasConsent = await getStoredValue(BACKGROUND_LOCATION_CONSENT_KEY);
        if (!hasConsent) {
            const approved = windowObject.confirm(BACKGROUND_LOCATION_DISCLOSURE);
            if (!approved) {
                throw new Error('Background location tracking was not approved');
            }
            await setStoredValue(BACKGROUND_LOCATION_CONSENT_KEY, {
                approvedAt: new Date().toISOString(),
                disclosureVersion: 1
            });
        }

        if (plugins.LocalNotifications) {
            await plugins.LocalNotifications.requestPermissions();
        }

        if (capacitor.getPlatform() === 'android') {
            const permissionBridge = requirePlugin('NocturnalBackgroundPermission');
            const permission = await permissionBridge.check();
            if (!permission.granted) {
                windowObject.alert(
                    'To continue, open Permissions > Location and select "Allow all the time". Then return to Nocturnal and start tracking again.'
                );
                await permissionBridge.openSettings();
                throw new Error('Allow all the time location permission is required');
            }
        }

        const watcherId = await backgroundGeolocation.addWatcher({
            backgroundMessage: 'Nocturnal is using your location for active care workflows.',
            backgroundTitle: 'Nocturnal location tracking',
            requestPermissions: true,
            stale: false,
            distanceFilter: 50
        }, (location, error) => {
            if (typeof callback === 'function') callback(location, error);
            windowObject.dispatchEvent(new CustomEvent('nocturnal:location', {
                detail: { location, error }
            }));
        });

        await setStoredValue(BACKGROUND_WATCHER_KEY, watcherId);
        return watcherId;
    };

    const stopBackgroundLocation = async () => {
        const watcherId = await getStoredValue(BACKGROUND_WATCHER_KEY);
        if (!watcherId) return;
        await requirePlugin('BackgroundGeolocation').removeWatcher({ id: watcherId });
        await removeStoredValue(BACKGROUND_WATCHER_KEY);
    };

    const revokeBackgroundLocationConsent = async () => {
        await stopBackgroundLocation();
        await removeStoredValue(BACKGROUND_LOCATION_CONSENT_KEY);
    };

    const registerPushNotifications = async () => {
        const pushNotifications = requirePlugin('PushNotifications');
        const permissions = await pushNotifications.requestPermissions();
        if (permissions.receive !== 'granted') {
            throw new Error('Push notification permission was not granted');
        }

        await pushNotifications.addListener('registration', async (registration) => {
            await windowObject.AppConfig.fetchRoute('mobileDevices.root', {
                method: 'POST',
                body: JSON.stringify({
                    token: registration.value,
                    platform: capacitor.getPlatform()
                }),
                parseJson: true
            });
        });
        await pushNotifications.addListener('pushNotificationReceived', (notification) => {
            windowObject.dispatchEvent(new CustomEvent('nocturnal:push-received', {
                detail: notification
            }));
        });
        await pushNotifications.addListener('pushNotificationActionPerformed', (action) => {
            windowObject.dispatchEvent(new CustomEvent('nocturnal:push-action', {
                detail: action
            }));
        });

        await pushNotifications.register();
    };

    const initializeAuthenticatedSession = async () => {
        if (!isNative || sessionStorage.getItem('nocturnal.nativeSessionInitialized') === 'true') {
            return;
        }
        if (!await getStoredValue(ACCESS_TOKEN_KEY)) {
            return;
        }

        await authenticate('Unlock Nocturnal');
        sessionStorage.setItem('nocturnal.nativeSessionInitialized', 'true');

        try {
            await registerPushNotifications();
        } catch (error) {
            await logError('push-registration-failed', error);
        }
    };

    windowObject.NocturnalNative = Object.freeze({
        isNative,
        authenticate,
        capturePhoto,
        captureAndUpload,
        getCurrentLocation,
        startBackgroundLocation,
        stopBackgroundLocation,
        revokeBackgroundLocationConsent,
        registerPushNotifications,
        initializeAuthenticatedSession,
        saveAuthResponse,
        clearAuth,
        logEvent,
        logError,
        getDiagnosticLogs,
        clearDiagnosticLogs,
        getAccessToken: () => getStoredValue(ACCESS_TOKEN_KEY),
        getRefreshToken: () => getStoredValue(REFRESH_TOKEN_KEY)
    });

    windowObject.addEventListener('DOMContentLoaded', () => {
        logEvent('info', 'native-startup', {
            platform: capacitor && typeof capacitor.getPlatform === 'function'
                ? capacitor.getPlatform()
                : 'unknown'
        });
        initializeAuthenticatedSession().catch(async (error) => {
            await logError('native-session-initialization-failed', error);
            await clearAuth();
            sessionStorage.removeItem('nocturnal.nativeSessionInitialized');
        });
    });
})(window);
