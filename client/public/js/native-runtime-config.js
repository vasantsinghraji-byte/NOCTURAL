(function configureNativeRuntime(windowObject) {
    const capacitor = windowObject.Capacitor;
    const isNative = capacitor && typeof capacitor.isNativePlatform === 'function'
        ? capacitor.isNativePlatform()
        : false;

    if (isNative && !windowObject.__NOCTURNAL_API_ORIGIN__) {
        Object.defineProperty(windowObject, '__NOCTURNAL_API_ORIGIN__', {
            configurable: true,
            writable: true,
            value: 'https://nocturnal-api.onrender.com'
        });
    }
})(window);
