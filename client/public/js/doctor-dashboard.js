/**
 * Doctor dashboard interactions.
 * Kept external so production CSP can block inline scripts.
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
    localStorage.removeItem('userType');
    localStorage.removeItem('userId');
    localStorage.removeItem('userName');
    localStorage.removeItem('user');

    window.location.href = '/index.html';
  } catch (error) {
    console.error('Logout error:', error);
    window.location.href = '/index.html';
  }
}

function setText(id, value) {
  const element = document.getElementById(id);
  if (element) {
    element.textContent = value;
  }
}

function loadUserInfo() {
  const userName = localStorage.getItem('userName') || 'Doctor';
  setText('userName', userName);
  setText('welcomeName', userName);
  setText('userAvatar', userName.charAt(0).toUpperCase());
}

function formatLocation(location) {
  if (!location) return 'Not specified';
  if (typeof location === 'string') return location;

  const parts = [
    location.address,
    location.city,
    location.state
  ].filter(Boolean);

  return parts.length > 0 ? parts.join(', ') : 'Not specified';
}

function getProfilePreferences(user) {
  const prefs = [];
  const professional = user.professional || {};

  if (professional.preferredShiftTimes && professional.preferredShiftTimes.length > 0) {
    prefs.push(`Shifts: ${professional.preferredShiftTimes.join(', ')}`);
  }
  if (professional.minimumRate) {
    prefs.push(`Min Rate: INR ${professional.minimumRate}/hr`);
  }
  if (professional.serviceRadius) {
    prefs.push(`Service Radius: ${professional.serviceRadius} km`);
  }

  return prefs.length > 0 ? prefs.join(' | ') : 'Not set';
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
    const response = await fetch(AppConfig.api('auth/me'), {
      headers: {
        'Authorization': `Bearer ${token}`
      }
    });
    const data = await parseJsonResponse(response);

    if (data.success && data.user) {
      const user = data.user;
      const professional = user.professional || {};
      const qualifications = professional.secondarySpecializations && professional.secondarySpecializations.length > 0
        ? professional.secondarySpecializations.join(', ')
        : 'Not specified';

      setText('userSpecialty', user.specialty || professional.primarySpecialization || 'Not specified');
      setText('userHospital', user.hospital || user.hospitalName || 'Not specified');
      setText('userLocation', formatLocation(user.location));
      setText('userExperience', professional.yearsOfExperience ? `${professional.yearsOfExperience} years` : 'Not specified');
      setText('userQualifications', qualifications);
      setText('userPhone', user.phone || 'Not specified');
      setText('userEmail', user.email || 'Not specified');
      setText('profileStrength', user.profileStrength ? `${user.profileStrength}%` : 'Not calculated');
      setText('userPreferences', getProfilePreferences(user));

      const profileInfo = document.getElementById('profileInfo');
      if (profileInfo) {
        profileInfo.style.display = 'block';
      }

      localStorage.setItem('userName', user.name);
      localStorage.setItem('user', JSON.stringify(user));
    }
  } catch (error) {
    console.error('Error fetching user profile:', error);
  }
}

async function fetchDashboardStats() {
  const token = checkAuth();
  if (!token) return;

  try {
    const dutiesResponse = await fetch(AppConfig.api('duties'), {
      headers: {
        'Authorization': `Bearer ${token}`
      }
    });
    const dutiesData = await parseJsonResponse(dutiesResponse);
    setText('availableDuties', dutiesData.success ? (dutiesData.count || 0) : 0);

    const appsResponse = await fetch(AppConfig.api('applications'), {
      headers: {
        'Authorization': `Bearer ${token}`
      }
    });
    const appsData = await parseJsonResponse(appsResponse);

    if (appsData.success && appsData.data) {
      const normalizedApplications = appsData.data.map(app => ({
        ...app,
        duty: app.duty ? {
          ...app.duty,
          compensation: {
            totalAmount: app.duty.totalCompensation || app.duty.netPayment || 0
          }
        } : app.duty
      }));

      const pending = appsData.data.filter(app => app.status === 'PENDING').length;
      const accepted = appsData.data.filter(app => app.status === 'ACCEPTED').length;

      setText('pendingApps', pending);
      setText('acceptedApps', accepted);

      const totalEarnings = appsData.data
        .filter(app => app.status === 'ACCEPTED')
        .reduce((sum, app) => sum + (app.duty?.totalCompensation || app.duty?.netPayment || 0), 0);
      setText('totalEarnings', `INR ${totalEarnings.toLocaleString()}`);

      displayRecentApplications(normalizedApplications.slice(0, 5));
    }
  } catch (error) {
    console.error('Error fetching dashboard data:', error);
    setText('availableDuties', '0');
    setText('pendingApps', '0');
    setText('acceptedApps', '0');
  }
}

function displayRecentApplications(applications) {
  const container = document.getElementById('recentApplications');
  if (!container) {
    return;
  }

  if (!applications || applications.length === 0) {
    container.innerHTML = '<div class="no-data">No applications yet. Start browsing available duties!</div>';
    return;
  }

  container.innerHTML = applications.map(app => `
    <div class="application-item">
      <div class="application-info">
        <h3>${app.duty?.hospitalName || 'Hospital'} - ${app.duty?.specialty || 'General'}</h3>
        <p>${app.duty?.date ? new Date(app.duty.date).toLocaleDateString() : 'TBD'} | ${app.duty?.startTime || 'TBD'} | INR ${app.duty?.compensation?.totalAmount || 0}</p>
      </div>
      <span class="status-badge ${app.status.toLowerCase()}">${app.status}</span>
    </div>
  `).join('');
}

window.addEventListener('DOMContentLoaded', () => {
  checkAuth();
  loadUserInfo();
  fetchUserProfile();
  fetchDashboardStats();

  const logoutBtn = document.getElementById('logout-btn');
  if (logoutBtn) {
    logoutBtn.addEventListener('click', async (event) => {
      event.preventDefault();
      await logout();
    });
  }
});
