/**
 * Doctor/provider onboarding interactions.
 * Extracted from doctor-onboarding.html for production CSP compliance.
 */

let currentStep = 1;
const providerFormData = {};
const uploadedFiles = {};

function normalizePhoneNumber(phone) {
  const trimmed = (phone || '').trim();
  if (!trimmed) {
    return '';
  }

  const compact = trimmed.replace(/[\s()-]/g, '');
  if (compact.startsWith('+')) {
    return compact;
  }

  const digits = compact.replace(/\D/g, '');
  if (digits.length === 10) {
    return `+91${digits}`;
  }

  if (digits.length === 12 && digits.startsWith('91')) {
    return `+${digits}`;
  }

  return compact;
}

function isValidE164Phone(phone) {
  return /^\+?[1-9]\d{1,14}$/.test(phone);
}

function getApiErrorMessage(data, fallbackMessage) {
  if (data && Array.isArray(data.errors) && data.errors.length > 0) {
    return data.errors.map((error) => error.message).filter(Boolean).join(', ') || fallbackMessage;
  }

  return (data && (data.message || data.error)) || fallbackMessage;
}

function buildProfileUpdatePayload() {
  return {
    name: providerFormData.name,
    phone: providerFormData.phone,
    professional: providerFormData.professional,
    location: providerFormData.location,
    bankDetails: providerFormData.bankDetails,
    onboardingCompleted: true
  };
}

function showAlert(message, type) {
  const alert = document.getElementById('alert');
  alert.className = `alert alert-${type} show`;
  alert.textContent = message;
  setTimeout(() => {
    alert.classList.remove('show');
  }, 5000);
}

function prefillExistingUser() {
  const existingUser = localStorage.getItem('user');
  const existingToken = localStorage.getItem('token');

  if (!existingUser || !existingToken) {
    return;
  }

  try {
    const userData = JSON.parse(existingUser);
    const emailField = document.getElementById('email');
    const phoneField = document.getElementById('phone');
    const nameField = document.getElementById('fullName');
    const passwordField = document.getElementById('password');
    const confirmPasswordField = document.getElementById('confirmPassword');

    if (emailField && userData.email) {
      emailField.value = userData.email;
      emailField.readOnly = true;
      emailField.style.backgroundColor = '#e9ecef';
    }

    if (phoneField && userData.phone) {
      phoneField.value = userData.phone;
      phoneField.readOnly = true;
      phoneField.style.backgroundColor = '#e9ecef';
    }

    if (nameField && userData.name) {
      nameField.value = userData.name;
    }

    if (passwordField && confirmPasswordField) {
      passwordField.closest('.form-group').style.display = 'none';
      confirmPasswordField.closest('.form-group').style.display = 'none';
      passwordField.value = 'already-registered';
      confirmPasswordField.value = 'already-registered';
    }
  } catch (_error) {
    showAlert('Unable to load saved profile details. Please continue manually.', 'warning');
  }
}

function populateSkills() {
  const skills = [
    'CPR', 'ACLS', 'BLS', 'Intubation', 'Central Line Insertion',
    'Arterial Line', 'Chest Tube Insertion', 'Lumbar Puncture',
    'Ventilator Management', 'ECG Interpretation', 'Ultrasound (POCUS)',
    'Suturing', 'Wound Management', 'IV Cannulation'
  ];

  const skillsSelection = document.getElementById('skillsSelection');
  skills.forEach((skill) => {
    const id = `skill-${skill.replace(/\s+/g, '-')}`;
    const item = document.createElement('div');
    item.className = 'skill-item';
    item.innerHTML = `
      <input type="checkbox" id="${id}" value="${skill}">
      <label for="${id}">${skill}</label>
    `;
    skillsSelection.appendChild(item);
  });
}

function populateShiftPreferences() {
  const shiftTimes = ['Morning', 'Evening', 'Night', 'Weekend', '24hr'];
  const shiftPreferences = document.getElementById('shiftPreferences');

  shiftTimes.forEach((time) => {
    const btn = document.createElement('button');
    btn.type = 'button';
    btn.className = 'preference-btn';
    btn.textContent = time;
    btn.addEventListener('click', () => {
      btn.classList.toggle('active');
    });
    shiftPreferences.appendChild(btn);
  });
}

function removeFile(type) {
  const input = document.getElementById(type + 'File');
  const preview = document.getElementById(type + 'Preview');

  if (input) {
    input.value = '';
  }

  if (preview) {
    preview.classList.remove('show');
  }

  delete uploadedFiles[type];
}

function setupFileUploadHandlers() {
  ['mciCert', 'photoId', 'mbbsDegree', 'profilePhoto'].forEach((type) => {
    const input = document.getElementById(type + 'File');
    if (!input) {
      return;
    }

    input.addEventListener('change', (e) => {
      const file = e.target.files[0];
      if (!file) {
        return;
      }

      const preview = document.getElementById(type + 'Preview');
      const nameSpan = document.getElementById(type + 'Name');

      if (nameSpan) {
        nameSpan.textContent = file.name;
      }

      if (preview) {
        preview.classList.add('show');
      }

      uploadedFiles[type] = file;
    });
  });
}

function updateUI() {
  document.querySelectorAll('.form-step').forEach((step) => {
    step.classList.remove('active');
  });
  document.querySelector(`.form-step[data-step="${currentStep}"]`).classList.add('active');

  document.querySelectorAll('.step').forEach((step) => {
    const stepNum = parseInt(step.dataset.step, 10);
    step.classList.remove('active', 'completed');
    if (stepNum < currentStep) {
      step.classList.add('completed');
    } else if (stepNum === currentStep) {
      step.classList.add('active');
    }
  });

  window.scrollTo({ top: 0, behavior: 'smooth' });
}

function validateStep(step) {
  const currentFormStep = document.querySelector(`.form-step[data-step="${step}"]`);
  const inputs = currentFormStep.querySelectorAll('input[required], select[required]');
  let isValid = true;

  inputs.forEach((input) => {
    if (!input.value.trim()) {
      input.style.borderColor = 'var(--danger)';
      isValid = false;
    } else {
      input.style.borderColor = '#e0e0e0';
    }
  });

  if (step === 1) {
    const phone = normalizePhoneNumber(document.getElementById('phone').value);
    const password = document.getElementById('password').value;
    const confirmPassword = document.getElementById('confirmPassword').value;
    const existingToken = localStorage.getItem('token');

    if (phone && !isValidE164Phone(phone)) {
      showAlert('Please enter a valid phone number, for example +919876543210.', 'danger');
      return false;
    }

    if (!existingToken) {
      if (password !== confirmPassword) {
        showAlert('Passwords do not match', 'danger');
        return false;
      }
      if (password.length < 6) {
        showAlert('Password must be at least 6 characters', 'danger');
        return false;
      }
    }
  }

  if (step === 3) {
    if (!uploadedFiles.mciCert || !uploadedFiles.photoId || !uploadedFiles.mbbsDegree || !uploadedFiles.profilePhoto) {
      showAlert('Please upload all required documents', 'danger');
      return false;
    }
  }

  if (!isValid) {
    showAlert('Please fill in all required fields', 'danger');
  }

  return isValid;
}

function saveStepData(step) {
  if (step === 1) {
    const existingToken = localStorage.getItem('token');

    providerFormData.name = document.getElementById('fullName').value;
    providerFormData.phone = normalizePhoneNumber(document.getElementById('phone').value);

    if (!existingToken) {
      providerFormData.email = document.getElementById('email').value;
      providerFormData.password = document.getElementById('password').value;
      providerFormData.confirmPassword = document.getElementById('confirmPassword').value;
      providerFormData.agreeToTerms = true;
    } else {
      delete providerFormData.email;
      delete providerFormData.password;
      delete providerFormData.confirmPassword;
      delete providerFormData.agreeToTerms;
    }
  } else if (step === 2) {
    providerFormData.professional = {
      mciNumber: document.getElementById('mciNumber').value,
      stateMedicalCouncil: document.getElementById('stateMedicalCouncil').value,
      primarySpecialization: document.getElementById('primarySpecialization').value,
      yearsOfExperience: parseInt(document.getElementById('yearsOfExperience').value, 10),
      currentEmploymentStatus: document.getElementById('employmentStatus').value,
      proceduralSkills: Array.from(document.querySelectorAll('#skillsSelection input:checked')).map((cb) => cb.value)
    };
  } else if (step === 4) {
    providerFormData.professional.preferredShiftTimes = Array.from(document.querySelectorAll('.preference-btn.active')).map((btn) => btn.textContent);
    providerFormData.professional.serviceRadius = parseInt(document.getElementById('serviceRadius').value, 10);
    providerFormData.professional.minimumRate = parseInt(document.getElementById('minimumRate').value, 10);
    providerFormData.location = {
      city: document.getElementById('city').value
    };
    providerFormData.bankDetails = {
      accountNumber: document.getElementById('accountNumber').value,
      ifscCode: document.getElementById('ifscCode').value,
      bankName: document.getElementById('bankName').value,
      accountHolderName: document.getElementById('accountHolderName').value
    };
  }
}

function nextStep() {
  if (validateStep(currentStep)) {
    saveStepData(currentStep);
    currentStep += 1;
    updateUI();
  }
}

function prevStep() {
  currentStep -= 1;
  updateUI();
}

async function uploadDocuments(token) {
  const uploadMap = {
    profilePhoto: { fieldName: 'profilePhoto', endpoint: '/uploads/profile-photo' },
    mciCert: { fieldName: 'mciCertificate', endpoint: '/uploads/mci-certificate' },
    photoId: { fieldName: 'photoId', endpoint: '/uploads/photo-id' },
    mbbsDegree: { fieldName: 'mbbsDegree', endpoint: '/uploads/mbbs-degree' }
  };

  for (const [type, file] of Object.entries(uploadedFiles)) {
    const uploadConfig = uploadMap[type];
    if (!uploadConfig) {
      continue;
    }

    const documentFormData = new FormData();
    documentFormData.append(uploadConfig.fieldName, file);

    const response = await fetch(AppConfig.api(uploadConfig.endpoint), {
      method: 'POST',
      headers: { Authorization: `Bearer ${token}` },
      body: documentFormData
    });

    const result = await response.json();

    if (!response.ok || !result.success) {
      throw new Error(`Failed to upload ${type}: ${result.message || 'Upload failed'}`);
    }
  }
}

async function handleOnboardingSubmit(e) {
  e.preventDefault();

  if (!validateStep(4)) {
    showAlert('Please fill in all required fields', 'danger');
    return;
  }
  saveStepData(4);

  const submitBtn = e.target.querySelector('button[type="submit"]');
  const originalBtnText = submitBtn.innerHTML;
  submitBtn.disabled = true;
  submitBtn.innerHTML = '<i class="fas fa-spinner fa-spin"></i> Processing...';

  try {
    showAlert('Saving your profile...', 'success');

    const existingToken = localStorage.getItem('token');

    if (!existingToken) {
      providerFormData.role = 'doctor';

      const response = await fetch(AppConfig.api('auth/register'), {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json'
        },
        body: JSON.stringify(providerFormData)
      });

      const data = await response.json();

      if (data.success && data.token) {
        localStorage.setItem('token', data.token);
        localStorage.setItem('user', JSON.stringify(data.user));
      } else {
        throw new Error(getApiErrorMessage(data, 'Registration failed'));
      }
    } else {
      const updatePayload = buildProfileUpdatePayload();

      const response = await fetch(AppConfig.api('auth/me'), {
        method: 'PUT',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${existingToken}`
        },
        body: JSON.stringify(updatePayload)
      });

      const data = await response.json();

      if (!data.success) {
        throw new Error(getApiErrorMessage(data, 'Failed to update profile'));
      }

      localStorage.setItem('user', JSON.stringify(data.user));
    }

    const token = existingToken || localStorage.getItem('token');
    await uploadDocuments(token);

    showAlert('Onboarding completed successfully! Redirecting...', 'success');

    setTimeout(() => {
      window.location.href = 'doctor-dashboard.html';
    }, 2000);
  } catch (error) {
    showAlert(error.message || 'Onboarding failed. Please try again.', 'danger');
    submitBtn.disabled = false;
    submitBtn.innerHTML = originalBtnText;
  }
}

document.addEventListener('click', (event) => {
  const actionButton = event.target.closest('[data-action]');
  if (actionButton) {
    if (actionButton.dataset.action === 'next-step') {
      nextStep();
    } else if (actionButton.dataset.action === 'prev-step') {
      prevStep();
    }
    return;
  }

  const removeButton = event.target.closest('[data-remove-file]');
  if (removeButton) {
    removeFile(removeButton.dataset.removeFile);
    return;
  }

  const uploadTrigger = event.target.closest('[data-file-trigger]');
  if (uploadTrigger && !event.target.matches('input[type="file"]')) {
    const input = document.getElementById(uploadTrigger.dataset.fileTrigger);
    if (input) {
      input.click();
    }
  }
});

document.getElementById('onboardingForm').addEventListener('submit', handleOnboardingSubmit);

window.addEventListener('error', (event) => {
  if (event.error && event.error.message) {
    showAlert('An error occurred: ' + event.error.message, 'danger');
  }
  event.preventDefault();
});

window.addEventListener('unhandledrejection', (event) => {
  const reason = event.reason;
  showAlert('An error occurred: ' + ((reason && reason.message) || reason), 'danger');
  event.preventDefault();
});

prefillExistingUser();
populateSkills();
populateShiftPreferences();
setupFileUploadHandlers();
