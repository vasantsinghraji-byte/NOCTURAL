/**
 * Doctor profile interactions.
 * Kept external so production CSP can block inline scripts and handlers.
 */

function checkAuth() {
  const token = localStorage.getItem('token');
  const userType = localStorage.getItem('userType');

  if (!token || userType !== 'doctor') {
    window.location.href = '/index.html';
    return false;
  }
  return token;
}

async function logout() {
  try {
    localStorage.removeItem('token');
    localStorage.removeItem('user');
    localStorage.removeItem('userType');
    localStorage.removeItem('userId');
    localStorage.removeItem('userName');

    window.location.href = '/index.html';
  } catch (error) {
    console.error('Logout error:', error);
    window.location.href = '/index.html';
  }
}

function setElementValue(id, value) {
  const element = document.getElementById(id);
  if (element) {
    element.value = value || '';
  }
}

function setElementText(id, value) {
  const element = document.getElementById(id);
  if (element) {
    element.textContent = value || '';
  }
}

function loadUserInfo() {
  const userName = localStorage.getItem('userName') || 'Doctor';
  setElementText('userName', userName);
  setElementText('userAvatar', userName.charAt(0).toUpperCase());
  setElementText('profileAvatarLarge', userName.charAt(0).toUpperCase());
  setElementText('profileName', userName);
}

async function parseJsonResponse(response) {
  if (!response.ok) {
    throw new Error(`Request failed with status ${response.status}`);
  }
  return response.json();
}

async function fetchUserProfile() {
  const token = checkAuth();
  if (!token) return;

  try {
    const response = await fetch(AppConfig.api('users/profile'), {
      headers: {
        'Authorization': `Bearer ${token}`
      }
    });

    const data = await parseJsonResponse(response);

    if (data.success && data.user) {
      populateForm(data.user);
    }
  } catch (error) {
    console.error('Error fetching profile:', error);
  }
}

function populateForm(user) {
  setElementValue('fullName', user.fullName || user.name);
  setElementValue('email', user.email);
  setElementValue('phone', user.phone);
  setElementValue('dateOfBirth', user.dateOfBirth ? user.dateOfBirth.split('T')[0] : '');
  setElementValue('profession', user.profession || 'Doctor');
  setElementValue('specialization', user.specialization);
  setElementValue('licenseNumber', user.licenseNumber);
  setElementValue('experience', user.experience);
  setElementValue('city', user.city);
  setElementValue('state', user.state);
  setElementValue('bio', user.bio);
  setElementValue('certifications', user.certifications);

  if (user.preferredShifts) {
    const nightShift = document.getElementById('nightShift');
    const eveningShift = document.getElementById('eveningShift');
    const weekendShift = document.getElementById('weekendShift');

    if (nightShift) nightShift.checked = user.preferredShifts.includes('Night');
    if (eveningShift) eveningShift.checked = user.preferredShifts.includes('Evening');
    if (weekendShift) weekendShift.checked = user.preferredShifts.includes('Weekend');
  }

  setElementText('profileRole', user.profession || 'Healthcare Professional');
}

function collectPreferredShifts() {
  const preferredShifts = [];
  if (document.getElementById('nightShift')?.checked) preferredShifts.push('Night');
  if (document.getElementById('eveningShift')?.checked) preferredShifts.push('Evening');
  if (document.getElementById('weekendShift')?.checked) preferredShifts.push('Weekend');
  return preferredShifts;
}

async function handleProfileSubmit(event) {
  event.preventDefault();

  const token = checkAuth();
  if (!token) return;

  const submitBtn = document.getElementById('submitBtn');
  if (submitBtn) {
    submitBtn.disabled = true;
    submitBtn.textContent = 'Saving...';
  }

  const profileData = {
    fullName: document.getElementById('fullName').value,
    email: document.getElementById('email').value,
    phone: document.getElementById('phone').value,
    dateOfBirth: document.getElementById('dateOfBirth').value,
    profession: document.getElementById('profession').value,
    specialization: document.getElementById('specialization').value,
    licenseNumber: document.getElementById('licenseNumber').value,
    experience: document.getElementById('experience').value,
    city: document.getElementById('city').value,
    state: document.getElementById('state').value,
    bio: document.getElementById('bio').value,
    certifications: document.getElementById('certifications').value,
    preferredShifts: collectPreferredShifts()
  };

  try {
    const response = await fetch(AppConfig.api('users/profile'), {
      method: 'PUT',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${token}`
      },
      body: JSON.stringify(profileData)
    });

    const data = await parseJsonResponse(response);

    if (data.success) {
      localStorage.setItem('userName', profileData.fullName);

      const successMsg = document.getElementById('successMessage');
      if (successMsg) {
        successMsg.classList.add('show');
        setTimeout(() => successMsg.classList.remove('show'), 3000);
      }

      loadUserInfo();
    } else {
      alert(data.message || 'Failed to update profile');
    }
  } catch (error) {
    console.error('Error updating profile:', error);
    alert('Error updating profile. Please try again.');
  } finally {
    if (submitBtn) {
      submitBtn.disabled = false;
      submitBtn.textContent = 'Save Changes';
    }
  }
}

function resetForm() {
  fetchUserProfile();
}

window.addEventListener('DOMContentLoaded', () => {
  checkAuth();
  loadUserInfo();
  fetchUserProfile();

  const logoutBtn = document.getElementById('logout-btn');
  if (logoutBtn) {
    logoutBtn.addEventListener('click', logout);
  }

  const cancelBtn = document.getElementById('reset-profile-btn');
  if (cancelBtn) {
    cancelBtn.addEventListener('click', resetForm);
  }

  const profileForm = document.getElementById('profileForm');
  if (profileForm) {
    profileForm.addEventListener('submit', handleProfileSubmit);
  }
});
