/**
 * Admin Profile JavaScript
 * Extracted from inline script in admin-profile.html for CSP compliance.
 * Handles profile loading, editing, and saving.
 */

if (typeof AppConfig === 'undefined') {
  console.error('admin-profile.js: AppConfig not loaded - ensure config.js is included before this script');
}

var isEditing = false;
var originalData = {};

function formatLocationValue(location) {
  if (!location) {
    return '';
  }

  if (typeof location === 'string') {
    return location;
  }

  return [location.city, location.state].filter(Boolean).join(', ');
}

function buildLocationUpdatePayload(rawLocation) {
  var normalizedLocation = rawLocation.trim();
  var originalLocation = originalData.location;

  if (originalLocation && typeof originalLocation === 'object') {
    var originalDisplayValue = formatLocationValue(originalLocation);
    if (normalizedLocation === originalDisplayValue) {
      return originalLocation;
    }
  }

  return normalizedLocation;
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

async function loadProfile() {
  var token = checkAuth();
  if (!token) return;

  var userEmail = localStorage.getItem('userEmail');

  try {
    var data = NocturnalSession.expectJsonSuccess(await AppConfig.fetchRoute('auth.me', {
      parseJson: true
    }), 'Failed to load profile information', {
      isSuccess: function (payload) {
        return !!(payload && payload.success && payload.user);
      }
    });
    var user = data.user;
    originalData = Object.assign({}, user);

    document.getElementById('hospitalName').value = user.hospital || '';
    document.getElementById('location').value = formatLocationValue(user.location);
    document.getElementById('adminName').value = user.name || '';
    document.getElementById('phone').value = user.phone || '';

    document.getElementById('emailDisplay').textContent = userEmail || user.email || '-';
    document.getElementById('userIdDisplay').textContent = user._id || '-';
  } catch (error) {
    console.error('Error loading profile:', error);
    showMessage('Unable to connect to server. Please try again later.', 'error');
  }
}

function toggleEditMode(editing) {
  isEditing = editing;

  var formInputs = document.querySelectorAll('#profileForm input, #profileForm textarea');
  formInputs.forEach(function (input) {
    input.disabled = !editing;
  });

  document.getElementById('editBtn').classList.toggle('is-hidden', editing);
  document.getElementById('cancelBtn').classList.toggle('is-hidden', !editing);
  document.getElementById('saveBtn').classList.toggle('is-hidden', !editing);
}

function cancelEdit() {
  document.getElementById('hospitalName').value = originalData.hospital || '';
  document.getElementById('location').value = formatLocationValue(originalData.location);
  document.getElementById('adminName').value = originalData.name || '';
  document.getElementById('phone').value = originalData.phone || '';

  toggleEditMode(false);
  clearMessage();
}

async function saveProfile(event) {
  event.preventDefault();

  var token = checkAuth();
  if (!token) return;

  var formData = {
    hospital: document.getElementById('hospitalName').value.trim(),
    location: buildLocationUpdatePayload(document.getElementById('location').value),
    name: document.getElementById('adminName').value.trim(),
    phone: document.getElementById('phone').value.trim()
  };

  if (!formData.hospital || !formData.location || !formData.name) {
    showMessage('Please fill in all required fields (Hospital Name, Location, Administrator Name)', 'error');
    return;
  }

  var saveBtn = document.getElementById('saveBtn');
  saveBtn.disabled = true;
  saveBtn.textContent = 'Saving...';

  try {
    NocturnalSession.expectJsonSuccess(await AppConfig.fetchRoute('auth.me', {
      method: 'PUT',
      parseJson: true,
      body: JSON.stringify(formData)
    }), 'Failed to update profile');
    originalData = Object.assign({}, formData);

    localStorage.setItem('userName', formData.name);
    loadUserInfo();

    showMessage('Profile updated successfully!', 'success');
    toggleEditMode(false);
  } catch (error) {
    console.error('Error updating profile:', error);
    showMessage('Unable to update profile. Please try again.', 'error');
  } finally {
    saveBtn.disabled = false;
    saveBtn.textContent = 'Save Changes';
  }
}

function showMessage(text, type) {
  var container = document.getElementById('messageContainer');
  var div = document.createElement('div');
  div.className = 'message ' + type;
  div.textContent = text;
  container.innerHTML = '';
  container.appendChild(div);

  if (type === 'success') {
    setTimeout(clearMessage, 5000);
  }
}

function clearMessage() {
  document.getElementById('messageContainer').innerHTML = '';
}

window.addEventListener('DOMContentLoaded', function () {
  checkAuth();
  loadUserInfo();
  loadProfile();

  document.getElementById('logout-btn').addEventListener('click', logout);
  document.getElementById('editBtn').addEventListener('click', function () {
    toggleEditMode(true);
    clearMessage();
  });
  document.getElementById('cancelBtn').addEventListener('click', cancelEdit);
  document.getElementById('profileForm').addEventListener('submit', saveProfile);
});
