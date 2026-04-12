/**
 * Admin Applications JavaScript
 * Extracted from inline script in admin-applications.html for CSP compliance.
 * Handles application listing, filtering, and status updates.
 */

if (typeof AppConfig === 'undefined') {
  console.error('admin-applications.js: AppConfig not loaded - ensure config.js is included before this script');
}

var allApplications = [];
var currentFilter = 'all';

function getStatusKey(status) {
  return String(status || '').toLowerCase();
}

function formatStatus(status) {
  var normalized = getStatusKey(status);
  return normalized ? normalized.charAt(0).toUpperCase() + normalized.slice(1) : 'Unknown';
}

function getDutyTimeLabel(duty) {
  if (duty.startTime && duty.endTime) {
    return duty.startTime + ' - ' + duty.endTime;
  }
  return duty.shift || 'Time not specified';
}

function getDutyCompensation(duty) {
  return duty.totalCompensation || duty.netPayment || duty.hourlyRate || duty.salary || 0;
}

function checkAuth() {
  return AdminSession.requireAuthenticatedPage({
    redirectUrl: AppConfig.routes.page('home')
  });
}

function logout() {
  AdminSession.logout({
    redirectUrl: AppConfig.routes.page('home')
  });
}

function loadUserInfo() {
  AdminSession.populateIdentity({
    nameElementId: 'userName',
    avatarElementId: 'userAvatar'
  });
}

async function loadApplications() {
  var token = checkAuth();
  if (!token) return;

  try {
    var data = NocturnalSession.expectJsonSuccess(await AppConfig.fetchRoute('applications.received', {
      parseJson: true
    }), 'Failed to load applications', {
      isSuccess: function (payload) {
        return !!(payload && payload.success && Array.isArray(payload.applications));
      }
    });

    allApplications = data.applications;
    updateStats();
    displayApplications();
  } catch (error) {
    console.error('Error loading applications:', error);
    showError('Unable to connect to server. Please try again later.');
  }
}

function updateStats() {
  var total = allApplications.length;
  var pending = allApplications.filter(function (a) { return getStatusKey(a.status) === 'pending'; }).length;
  var accepted = allApplications.filter(function (a) { return getStatusKey(a.status) === 'accepted'; }).length;
  var rejected = allApplications.filter(function (a) { return getStatusKey(a.status) === 'rejected'; }).length;

  document.getElementById('totalCount').textContent = total;
  document.getElementById('pendingCount').textContent = pending;
  document.getElementById('acceptedCount').textContent = accepted;
  document.getElementById('rejectedCount').textContent = rejected;
}

function displayApplications() {
  var container = document.getElementById('applicationsContainer');

  var filteredApps = currentFilter === 'all'
    ? allApplications
    : allApplications.filter(function (app) { return getStatusKey(app.status) === currentFilter; });

  if (filteredApps.length === 0) {
    container.innerHTML =
      '<div class="no-applications">' +
        '<h3>No Applications Found</h3>' +
        '<p>' + (currentFilter === 'all' ? 'No applications received yet.' : 'No ' + currentFilter + ' applications.') + '</p>' +
      '</div>';
    return;
  }

  container.innerHTML =
    '<div class="applications-grid">' +
      filteredApps.map(function (app) { return createApplicationCard(app); }).join('') +
    '</div>';

  // Add event listeners to action buttons
  filteredApps.forEach(function (app) {
    var acceptBtn = document.getElementById('accept-' + app._id);
    var rejectBtn = document.getElementById('reject-' + app._id);

    if (acceptBtn) {
      acceptBtn.addEventListener('click', function () { updateApplicationStatus(app._id, 'ACCEPTED'); });
    }
    if (rejectBtn) {
      rejectBtn.addEventListener('click', function () { updateApplicationStatus(app._id, 'REJECTED'); });
    }
  });
}

function createApplicationCard(app) {
  var statusKey = getStatusKey(app.status);
  var isPending = statusKey === 'pending';
  var dutyDate = new Date(app.duty.date).toLocaleDateString('en-US', {
    weekday: 'short',
    year: 'numeric',
    month: 'short',
    day: 'numeric'
  });

  var actionsHtml = isPending
    ? '<div class="card-actions">' +
        '<button id="accept-' + app._id + '" class="action-btn accept-btn">Accept</button>' +
        '<button id="reject-' + app._id + '" class="action-btn reject-btn">Reject</button>' +
      '</div>'
    : '';

  return '<div class="application-card">' +
    '<div class="card-header">' +
      '<div class="applicant-info">' +
        '<h3>' + (app.applicant.name || 'Doctor') + '</h3>' +
        '<p>' + (app.applicant.email || app.applicant.specialty || 'Professional') + '</p>' +
      '</div>' +
      '<span class="status-badge ' + statusKey + '">' + formatStatus(app.status) + '</span>' +
    '</div>' +
    '<div class="duty-details">' +
      '<h4>' + app.duty.title + '</h4>' +
      '<div class="detail-row"><span class="detail-label">Date:</span><span>' + dutyDate + '</span></div>' +
      '<div class="detail-row"><span class="detail-label">Time:</span><span>' + getDutyTimeLabel(app.duty) + '</span></div>' +
      '<div class="detail-row"><span class="detail-label">Salary:</span><span>Rs ' + getDutyCompensation(app.duty) + '</span></div>' +
      '<div class="detail-row"><span class="detail-label">Applied:</span><span>' + new Date(app.createdAt).toLocaleDateString() + '</span></div>' +
    '</div>' +
    actionsHtml +
  '</div>';
}

async function updateApplicationStatus(applicationId, newStatus) {
  var token = checkAuth();
  if (!token) return;

  var acceptBtn = document.getElementById('accept-' + applicationId);
  var rejectBtn = document.getElementById('reject-' + applicationId);

  if (acceptBtn) acceptBtn.disabled = true;
  if (rejectBtn) rejectBtn.disabled = true;

  try {
    NocturnalSession.expectJsonSuccess(await AppConfig.fetchRoute('applications.updateStatus', {
      method: 'PUT',
      parseJson: true,
      body: JSON.stringify({ status: newStatus })
    }, {
      params: { applicationId: applicationId }
    }), 'Failed to update application status');

    var appIndex = allApplications.findIndex(function (a) { return a._id === applicationId; });
    if (appIndex !== -1) {
      allApplications[appIndex].status = newStatus;
    }
    updateStats();
    displayApplications();
  } catch (error) {
    console.error('Error updating application:', error);
    alert('Unable to update application. Please try again.');
  }

  if (acceptBtn) acceptBtn.disabled = false;
  if (rejectBtn) rejectBtn.disabled = false;
}

function showError(message) {
  var container = document.getElementById('applicationsContainer');
  container.innerHTML =
    '<div class="no-applications">' +
      '<h3>Error</h3>' +
      '<p>' + message + '</p>' +
    '</div>';
}

function setupFilters() {
  var filterBtns = document.querySelectorAll('.filter-btn');
  filterBtns.forEach(function (btn) {
    btn.addEventListener('click', function () {
      filterBtns.forEach(function (b) { b.classList.remove('active'); });
      btn.classList.add('active');
      currentFilter = btn.dataset.status;
      displayApplications();
    });
  });
}

window.addEventListener('DOMContentLoaded', function () {
  checkAuth();
  loadUserInfo();
  loadApplications();
  setupFilters();

  var logoutBtn = document.getElementById('logout-btn');
  if (logoutBtn) {
    logoutBtn.addEventListener('click', logout);
  }
});
