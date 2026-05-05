(function () {
  var statusElement = document.getElementById('status');
  var retryButton = document.getElementById('retryButton');
  var redirectTimeout = null;
  var statusPollInterval = null;

  if (!statusElement || !retryButton) {
    return;
  }

  function clearRedirectTimeout() {
    if (redirectTimeout) {
      window.clearTimeout(redirectTimeout);
      redirectTimeout = null;
    }
  }

  function updateConnectionStatus() {
    clearRedirectTimeout();

    if (navigator.onLine) {
      statusElement.textContent = 'Connection restored. Redirecting...';
      statusElement.className = 'status online';
      redirectTimeout = window.setTimeout(function () {
        window.location.href = AppConfig.routes.page('home');
      }, 2000);
      return;
    }

    statusElement.textContent = 'Still offline. Waiting for connection...';
    statusElement.className = 'status checking';
  }

  retryButton.addEventListener('click', function () {
    window.location.reload();
  });

  window.addEventListener('online', updateConnectionStatus);
  window.addEventListener('offline', updateConnectionStatus);

  statusPollInterval = window.setInterval(updateConnectionStatus, 2000);
  updateConnectionStatus();

  window.addEventListener('beforeunload', function () {
    clearRedirectTimeout();
    if (statusPollInterval) {
      window.clearInterval(statusPollInterval);
      statusPollInterval = null;
    }
  });
}());
