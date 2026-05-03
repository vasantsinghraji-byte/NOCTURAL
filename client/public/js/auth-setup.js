(function () {
  var tokenStatus = document.getElementById('tokenStatus');
  var userTypeStatus = document.getElementById('userTypeStatus');
  var userNameStatus = document.getElementById('userNameStatus');
  var setupButton = document.getElementById('setupTestAuthBtn');
  var clearButton = document.getElementById('clearAuthBtn');
  var dashboardButton = document.getElementById('goToDashboardBtn');
  var doctorDashboardUrl = AppConfig.routes.page('doctor.dashboard');

  if (!tokenStatus || !userTypeStatus || !userNameStatus || !setupButton || !clearButton || !dashboardButton) {
    return;
  }

  function setStatus(element, text, isSuccess) {
    element.textContent = text;
    element.className = 'status-value ' + (isSuccess ? 'success' : 'error');
  }

  function checkAuthStatus() {
    var hasSessionProfile = !!localStorage.getItem('userId');
    var userType = localStorage.getItem('userType');
    var userName = localStorage.getItem('userName');

    setStatus(tokenStatus, hasSessionProfile ? 'Cookie session' : 'Missing', hasSessionProfile);
    setStatus(userTypeStatus, userType || 'Missing', userType === 'doctor');
    setStatus(userNameStatus, userName || 'Missing', !!userName);
  }

  function setupTestAuth() {
    localStorage.setItem('userType', 'doctor');
    localStorage.setItem('userId', 'test_user_123');
    localStorage.setItem('userName', 'Dr. Test User');

    window.alert('Test profile setup complete. API calls still require a real httpOnly backend session cookie.');
    checkAuthStatus();
  }

  function clearAuth() {
    localStorage.removeItem('token');
    localStorage.removeItem('patientToken');
    localStorage.removeItem('providerToken');
    localStorage.removeItem('userType');
    localStorage.removeItem('userId');
    localStorage.removeItem('userName');

    window.alert('Authentication cleared.');
    checkAuthStatus();
  }

  function goToDashboard() {
    var userType = localStorage.getItem('userType');

    if (userType !== 'doctor') {
      window.alert('Authentication is not set up. Click "Setup Test Login" first, or fix your login page.');
      return;
    }

    window.location.href = doctorDashboardUrl;
  }

  setupButton.addEventListener('click', setupTestAuth);
  clearButton.addEventListener('click', clearAuth);
  dashboardButton.addEventListener('click', goToDashboard);
  window.addEventListener('DOMContentLoaded', checkAuthStatus);
  checkAuthStatus();
}());
