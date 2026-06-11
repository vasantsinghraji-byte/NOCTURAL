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

function getSafeStatusClass(status) {
  return getStatusKey(status).replace(/[^a-z0-9_-]/g, '') || 'unknown';
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
  container.replaceChildren();

  var filteredApps = currentFilter === 'all'
    ? allApplications
    : allApplications.filter(function (app) { return getStatusKey(app.status) === currentFilter; });

  if (filteredApps.length === 0) {
    container.appendChild(createEmptyState(
      'No Applications Found',
      currentFilter === 'all' ? 'No applications received yet.' : 'No ' + currentFilter + ' applications.'
    ));
    return;
  }

  var grid = document.createElement('div');
  grid.className = 'applications-grid';
  filteredApps.forEach(function (app) {
    grid.appendChild(createApplicationCard(app));
  });
  container.appendChild(grid);

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

function appendDetailRow(container, label, value) {
  var row = document.createElement('div');
  row.className = 'detail-row';

  var labelSpan = document.createElement('span');
  labelSpan.className = 'detail-label';
  labelSpan.textContent = label;

  var valueSpan = document.createElement('span');
  valueSpan.textContent = value;

  row.append(labelSpan, valueSpan);
  container.appendChild(row);
}

function createEmptyState(title, message) {
  var wrapper = document.createElement('div');
  wrapper.className = 'no-applications';

  var heading = document.createElement('h3');
  heading.textContent = title;

  var paragraph = document.createElement('p');
  paragraph.textContent = message;

  wrapper.append(heading, paragraph);
  return wrapper;
}

function createApplicationCard(app) {
  var statusKey = getStatusKey(app.status);
  var isPending = statusKey === 'pending';
  var applicant = app.applicant || {};
  var duty = app.duty || {};
  var dutyDate = AppFormat.date(duty.date, 'en-US', {
    weekday: 'short',
    year: 'numeric',
    month: 'short',
    day: 'numeric'
  });

  var card = document.createElement('div');
  card.className = 'application-card';

  var header = document.createElement('div');
  header.className = 'card-header';

  var applicantInfo = document.createElement('div');
  applicantInfo.className = 'applicant-info';

  var applicantName = document.createElement('h3');
  applicantName.textContent = applicant.name || 'Doctor';

  var applicantMeta = document.createElement('p');
  applicantMeta.textContent = applicant.email || applicant.specialty || 'Professional';

  applicantInfo.append(applicantName, applicantMeta);

  var statusBadge = document.createElement('span');
  statusBadge.className = 'status-badge ' + getSafeStatusClass(app.status);
  statusBadge.textContent = formatStatus(app.status);

  header.append(applicantInfo, statusBadge);

  var dutyDetails = document.createElement('div');
  dutyDetails.className = 'duty-details';

  var title = document.createElement('h4');
  title.textContent = duty.title || 'Untitled duty';
  dutyDetails.appendChild(title);

  appendDetailRow(dutyDetails, 'Date:', dutyDate);
  appendDetailRow(dutyDetails, 'Time:', getDutyTimeLabel(duty));
  appendDetailRow(dutyDetails, 'Salary:', 'Rs ' + getDutyCompensation(duty));
  appendDetailRow(dutyDetails, 'Applied:', AppFormat.date(app.createdAt));

  card.append(header, dutyDetails);

  if (isPending) {
    var actions = document.createElement('div');
    actions.className = 'card-actions';

    var acceptButton = document.createElement('button');
    acceptButton.id = 'accept-' + app._id;
    acceptButton.className = 'action-btn accept-btn';
    acceptButton.textContent = 'Accept';

    var rejectButton = document.createElement('button');
    rejectButton.id = 'reject-' + app._id;
    rejectButton.className = 'action-btn reject-btn';
    rejectButton.textContent = 'Reject';

    actions.append(acceptButton, rejectButton);
    card.appendChild(actions);
  }

  return card;
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
  container.replaceChildren(createEmptyState('Error', message));
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
