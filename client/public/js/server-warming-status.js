(function initializeServerWarmingStatus(windowObject, documentObject) {
    if (!windowObject || !documentObject || typeof windowObject.addEventListener !== 'function') {
        return;
    }

    let statusElement = null;

    const ensureStatusElement = () => {
        if (statusElement && statusElement.isConnected) {
            return statusElement;
        }

        statusElement = documentObject.createElement('div');
        statusElement.className = 'server-warming-status';
        statusElement.setAttribute('role', 'status');
        statusElement.setAttribute('aria-live', 'polite');
        statusElement.hidden = true;
        documentObject.body.appendChild(statusElement);
        return statusElement;
    };

    windowObject.addEventListener('nocturnal:server-warming', (event) => {
        const element = ensureStatusElement();
        const method = event && event.detail && event.detail.method;
        element.textContent = method === 'GET'
            ? 'Waking up server. Retrying your request...'
            : 'Reconnecting to server. Retrying safely...';
        element.hidden = false;
    });

    windowObject.addEventListener('nocturnal:server-warming-complete', () => {
        const element = ensureStatusElement();
        element.hidden = true;
    });
})(window, document);
