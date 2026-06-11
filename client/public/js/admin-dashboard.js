/**
 * Admin Dashboard JavaScript
 * Extracted from inline script in admin-dashboard.html for CSP compliance.
 * Handles auth, hospital info display, and stats loading.
 */

if (typeof AppConfig === 'undefined') {
  console.error('admin-dashboard.js: AppConfig not loaded - ensure config.js is included before this script');
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
    welcomeElementId: 'welcomeName',
    avatarElementId: 'userAvatar'
  });

  loadHospitalInfo();
  loadStats();
  loadBookingAssignments();
}

function formatLocation(location) {
  if (!location) {
    return '';
  }

  if (typeof location === 'string') {
    return location;
  }

  var parts = [location.city, location.state].filter(Boolean);
  return parts.join(', ');
}

async function loadHospitalInfo() {
  try {
    var data = NocturnalSession.expectJsonSuccess(await AppConfig.fetchRoute('auth.me', {
      parseJson: true
    }), 'Failed to load hospital info', {
      isSuccess: function (payload) {
        return !!(payload && payload.success && payload.user);
      }
    });
    document.getElementById('hospitalInfo').textContent =
      (data.user.hospital || '') + ' \u2022 ' + (formatLocation(data.user.location) || '');
  } catch (error) {
    console.error('Error loading hospital info:', error);
  }
}

function getBookingLocationLabel(booking) {
  var address = booking && booking.serviceLocation && booking.serviceLocation.address;
  if (!address) {
    return 'Location not provided';
  }

  var parts = [address.street, address.city, address.state, address.pincode].filter(Boolean);
  return parts.join(', ') || 'Location not provided';
}

function getProviderLabel(provider) {
  var specialization = provider.specialty || (provider.professional && provider.professional.primarySpecialization) || 'General';
  var experience = provider.professional && provider.professional.yearsOfExperience;
  var experienceLabel = experience || experience === 0 ? ' • ' + experience + ' yrs' : '';
  return provider.name + ' (' + specialization + experienceLabel + ')';
}

function renderAssignmentEmpty(list, message) {
  var empty = document.createElement('div');
  empty.className = 'assignment-empty';
  empty.textContent = message;
  list.replaceChildren(empty);
}

function appendAssignmentMeta(container, label, value) {
  var row = document.createElement('div');
  var strong = document.createElement('strong');
  strong.textContent = label;
  row.append(strong, document.createTextNode(' ' + value));
  container.appendChild(row);
}

async function loadBookingAssignments() {
  var summary = document.getElementById('bookingAssignmentSummary');
  var list = document.getElementById('bookingAssignmentList');

  if (!summary || !list) {
    return;
  }

  try {
    var bookingsResponse = NocturnalSession.expectJsonSuccess(await AppConfig.fetchRoute('bookings.list', {
      parseJson: true
    }, {
      query: {
        status: 'REQUESTED',
        limit: 5
      }
    }), 'Failed to load pending bookings', {
      isSuccess: function (payload) {
        return !!(payload && payload.success && Array.isArray(payload.data));
      }
    });

    var providersResponse = NocturnalSession.expectJsonSuccess(await AppConfig.fetchRoute('bookings.providers', {
      parseJson: true
    }), 'Failed to load providers', {
      isSuccess: function (payload) {
        return !!(payload && payload.success && Array.isArray(payload.providers));
      }
    });

    renderBookingAssignments(bookingsResponse.data, providersResponse.providers);
  } catch (error) {
    console.error('Error loading booking assignments:', error);
    summary.textContent = 'Unable to load booking assignment data right now.';
    renderAssignmentEmpty(list, 'Please refresh the page and try again.');
  }
}

function renderBookingAssignments(bookings, providers) {
  var summary = document.getElementById('bookingAssignmentSummary');
  var list = document.getElementById('bookingAssignmentList');

  if (!bookings || bookings.length === 0) {
    summary.textContent = 'No unassigned bookings need action right now.';
    renderAssignmentEmpty(list, 'All current patient bookings are assigned.');
    return;
  }

  if (!providers || providers.length === 0) {
    summary.textContent = 'Pending bookings found, but no active providers are available for assignment.';
    renderAssignmentEmpty(list, 'Create or activate a nurse or physiotherapist account to assign these bookings.');
    return;
  }

  summary.textContent = 'Assign an active provider to the newest requested bookings.';
  list.replaceChildren();

  bookings.forEach(function (booking) {
    var card = document.createElement('div');
    card.className = 'assignment-card';

    var heading = document.createElement('h3');
    heading.textContent = booking.serviceType || 'Booking';

    var meta = document.createElement('div');
    meta.className = 'assignment-meta';
    appendAssignmentMeta(meta, 'Patient:', (booking.patientDetails && booking.patientDetails.name) || 'Patient');
    appendAssignmentMeta(
      meta,
      'When:',
      `${AppFormat.date(booking.scheduledDate)} at ${AppFormat.timeInZone(
        booking.scheduledDate,
        booking.scheduledTime || '',
        booking.scheduledTimezone,
        booking.scheduledTimezoneOffsetMinutes
      ) || 'Time not specified'}`
    );
    appendAssignmentMeta(meta, 'Where:', getBookingLocationLabel(booking));

    var row = document.createElement('div');
    row.className = 'assignment-row';

    var select = document.createElement('select');
    select.className = 'assignment-select';
    select.dataset.providerSelect = booking._id;

    var placeholder = document.createElement('option');
    placeholder.value = '';
    placeholder.textContent = 'Select provider';
    select.appendChild(placeholder);

    providers.forEach(function (provider) {
      var option = document.createElement('option');
      option.value = provider._id;
      option.textContent = getProviderLabel(provider);
      select.appendChild(option);
    });

    var button = document.createElement('button');
    button.className = 'btn';
    button.type = 'button';
    button.dataset.action = 'assign-booking';
    button.dataset.bookingId = booking._id;
    button.textContent = 'Assign';

    row.append(select, button);
    card.append(heading, meta, row);
    list.appendChild(card);
  });
}

async function assignBooking(bookingId) {
  var select = document.querySelector('[data-provider-select="' + bookingId + '"]');
  if (!select || !select.value) {
    alert('Please choose a provider before assigning the booking.');
    return;
  }

  try {
    NocturnalSession.expectJsonSuccess(await AppConfig.fetchRoute('bookings.assign', {
      method: 'PUT',
      parseJson: true,
      body: JSON.stringify({ providerId: select.value })
    }, {
      params: { bookingId: bookingId }
    }), 'Failed to assign provider');

    await loadBookingAssignments();
  } catch (error) {
    console.error('Error assigning booking:', error);
    alert(error.message || 'Unable to assign provider right now.');
  }
}

async function loadStats() {
  var token = checkAuth();
  if (!token) return;

  try {
    var dutiesData = NocturnalSession.expectJsonSuccess(await AppConfig.fetchRoute('duties.myDuties', {
      parseJson: true
    }), 'Failed to load duty stats', {
      isSuccess: function (payload) {
        return !!(payload && payload.success && Array.isArray(payload.duties));
      }
    });
    var openDuties = dutiesData.duties.filter(function (d) { return d.status === 'OPEN'; }).length;
    document.getElementById('openDuties').textContent = openDuties;
    document.getElementById('totalDuties').textContent = dutiesData.duties.length;

    var appsData = NocturnalSession.expectJsonSuccess(await AppConfig.fetchRoute('applications.received', {
      parseJson: true
    }), 'Failed to load application stats', {
      isSuccess: function (payload) {
        return !!(payload && payload.success && Array.isArray(payload.applications));
      }
    });
    var pending = appsData.applications.filter(function (a) { return String(a.status || '').toUpperCase() === 'PENDING'; }).length;
    document.getElementById('pendingApps').textContent = pending;
    document.getElementById('totalApps').textContent = appsData.applications.length;
  } catch (error) {
    console.error('Error loading stats:', error);
    document.getElementById('openDuties').textContent = '0';
    document.getElementById('pendingApps').textContent = '0';
    document.getElementById('totalDuties').textContent = '0';
    document.getElementById('totalApps').textContent = '0';
  }
}

window.addEventListener('DOMContentLoaded', function () {
  checkAuth();
  loadUserInfo();

  var assignmentList = document.getElementById('bookingAssignmentList');
  if (assignmentList) {
    assignmentList.addEventListener('click', function (event) {
      var assignButton = event.target.closest('[data-action="assign-booking"]');
      if (!assignButton) {
        return;
      }

      assignBooking(assignButton.dataset.bookingId);
    });
  }

  var logoutBtn = document.getElementById('logout-btn');
  if (logoutBtn) {
    logoutBtn.addEventListener('click', logout);
  }
});
