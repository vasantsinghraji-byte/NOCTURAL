        // Cookie-backed authentication
        let currentStep = 1;
        let formData = {};
        let uploadedFiles = {};

        // Check if user already registered and pre-fill data
        const existingUser = localStorage.getItem('user');
        const hasSessionProfile = !!localStorage.getItem('userId');

        if (existingUser && hasSessionProfile) {
            try {
                const userData = JSON.parse(existingUser);
                // Pre-fill and disable already registered fields
                setTimeout(() => {
                    const emailField = document.getElementById('email');
                    const phoneField = document.getElementById('phone');
                    const nameField = document.getElementById('fullName');
                    const passwordField = document.getElementById('password');
                    const confirmPasswordField = document.getElementById('confirmPassword');

                    if (emailField && userData.email) {
                        emailField.value = userData.email;
                        emailField.readOnly = true;
                        emailField.classList.add('readonly-field');
                    }
                    if (phoneField && userData.phone) {
                        phoneField.value = userData.phone;
                        phoneField.readOnly = true;
                        phoneField.classList.add('readonly-field');
                    }
                    if (nameField && userData.name) {
                        nameField.value = userData.name;
                    }
                    // Hide password fields since user already registered
                    if (passwordField && confirmPasswordField) {
                        AppUi.setDisplay(passwordField.closest('.form-group'), 'none');
                        AppUi.setDisplay(confirmPasswordField.closest('.form-group'), 'none');
                        // Set dummy values to pass validation
                        passwordField.value = 'already-registered';
                        confirmPasswordField.value = 'already-registered';
                    }
                }, 100);
            } catch (error) {
                console.error('Error loading user data:', error);
            }
        }

        // Common skills list
        const skills = [
            'CPR', 'ACLS', 'BLS', 'Intubation', 'Central Line Insertion',
            'Arterial Line', 'Chest Tube Insertion', 'Lumbar Puncture',
            'Ventilator Management', 'ECG Interpretation', 'Ultrasound (POCUS)',
            'Suturing', 'Wound Management', 'IV Cannulation'
        ];

        // Shift preferences
        const shiftTimes = ['Morning', 'Evening', 'Night', 'Weekend', '24hr'];

        // Populate skills
        const skillsSelection = document.getElementById('skillsSelection');
        skills.forEach(skill => {
            skillsSelection.innerHTML += `
                <div class="skill-item">
                    <input type="checkbox" id="skill-${skill.replace(/\s+/g, '-')}" value="${skill}">
                    <label for="skill-${skill.replace(/\s+/g, '-')}">${skill}</label>
                </div>
            `;
        });

        // Populate shift preferences
        const shiftPreferences = document.getElementById('shiftPreferences');
        shiftTimes.forEach(time => {
            const btn = document.createElement('button');
            btn.type = 'button';
            btn.className = 'preference-btn';
            btn.textContent = time;
            btn.addEventListener('click', () => {
                btn.classList.toggle('active');
            });
            shiftPreferences.appendChild(btn);
        });

        // File upload handlers
        ['mciCert', 'photoId', 'mbbsDegree', 'profilePhoto'].forEach(type => {
            const input = document.getElementById(type + 'File');
            if (input) {
                input.addEventListener('change', (e) => {
                    const file = e.target.files[0];
                    if (file) {
                        const preview = document.getElementById(type + 'Preview');
                        const nameSpan = document.getElementById(type + 'Name');
                        if (nameSpan) {
                            nameSpan.textContent = file.name;
                        }
                        if (preview) {
                            preview.classList.add('show');
                        }
                        uploadedFiles[type] = file;
                    }
                });
            }
        });

        function removeFile(type) {
            const input = document.getElementById(type + 'File');
            const preview = document.getElementById(type + 'Preview');
            input.value = '';
            preview.classList.remove('show');
            delete uploadedFiles[type];
        }

        function nextStep() {
            if (validateStep(currentStep)) {
                saveStepData(currentStep);
                currentStep++;
                updateUI();
            }
        }

        function prevStep() {
            currentStep--;
            updateUI();
        }

        function validateStep(step) {
            const currentFormStep = document.querySelector(`.form-step[data-step="${step}"]`);
            const inputs = currentFormStep.querySelectorAll('input[required], select[required]');
            let isValid = true;

            inputs.forEach(input => {
                if (!input.value.trim()) {
                    input.classList.add('field-error');
                    isValid = false;
                } else {
                    input.classList.remove('field-error');
                }
            });

            if (step === 1) {
                const password = document.getElementById('password').value;
                const confirmPassword = document.getElementById('confirmPassword').value;

                // Skip password validation if user already registered
                const hasRegisteredSession = !!localStorage.getItem('userId');
                if (!hasRegisteredSession) {
                    if (!NocturnalSession.validatePasswordStrength(password, null, {
                        onInvalid: (message) => showAlert(message, 'danger')
                    })) {
                        return false;
                    }

                    if (!NocturnalSession.validatePasswordMatch(password, confirmPassword, null, {
                        message: 'Passwords do not match',
                        onInvalid: (message) => showAlert(message, 'danger')
                    })) {
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
                formData.name = document.getElementById('fullName').value;
                formData.email = document.getElementById('email').value;
                formData.phone = document.getElementById('phone').value;

                // Only include password if user is registering (not already registered)
                const hasRegisteredSession = !!localStorage.getItem('userId');
                if (!hasRegisteredSession) {
                    formData.password = document.getElementById('password').value;
                }
            } else if (step === 2) {
                formData.professional = {
                    mciNumber: document.getElementById('mciNumber').value,
                    stateMedicalCouncil: document.getElementById('stateMedicalCouncil').value,
                    primarySpecialization: document.getElementById('primarySpecialization').value,
                    yearsOfExperience: parseInt(document.getElementById('yearsOfExperience').value),
                    currentEmploymentStatus: document.getElementById('employmentStatus').value,
                    proceduralSkills: Array.from(document.querySelectorAll('#skillsSelection input:checked')).map(cb => cb.value)
                };
            } else if (step === 4) {
                formData.professional.preferredShiftTimes = Array.from(document.querySelectorAll('.preference-btn.active')).map(btn => btn.textContent);
                formData.professional.serviceRadius = parseInt(document.getElementById('serviceRadius').value);
                formData.professional.minimumRate = parseInt(document.getElementById('minimumRate').value);
                formData.location = {
                    city: document.getElementById('city').value
                };
                formData.bankDetails = {
                    accountNumber: document.getElementById('accountNumber').value,
                    ifscCode: document.getElementById('ifscCode').value,
                    bankName: document.getElementById('bankName').value,
                    accountHolderName: document.getElementById('accountHolderName').value
                };
            }
        }

        function buildRegistrationPayload() {
            return {
                name: formData.name,
                email: formData.email,
                phone: formData.phone,
                password: formData.password,
                confirmPassword: formData.password,
                agreeToTerms: true,
                role: 'doctor',
                specialty: formData.professional?.primarySpecialization,
                location: formData.location
            };
        }

        function buildProfileUpdatePayload() {
            const payload = {
                name: formData.name,
                phone: formData.phone,
                specialty: formData.professional?.primarySpecialization,
                professional: formData.professional,
                onboardingCompleted: true
            };

            if (formData.location && (formData.location.city || formData.location.state)) {
                payload.location = formData.location;
            }

            if (formData.bankDetails) {
                payload.bankDetails = formData.bankDetails;
            }

            return payload;
        }

        async function updateOnboardingProfile(payload) {
            const data = await AppConfig.fetchRoute('auth.me', {
                method: 'PUT',
                parseJson: true,
                headers: {
                    'Content-Type': 'application/json'
                },
                body: JSON.stringify(payload)
            });

            return NocturnalSession.expectJsonSuccess(data, 'Failed to update profile', {
                isSuccess: function (responsePayload) {
                    return !!(responsePayload && responsePayload.success && responsePayload.user);
                }
            }).user;
        }

        function updateUI() {
            // Update form steps
            document.querySelectorAll('.form-step').forEach(step => {
                step.classList.remove('active');
            });
            document.querySelector(`.form-step[data-step="${currentStep}"]`).classList.add('active');

            // Update progress steps
            document.querySelectorAll('.step').forEach(step => {
                const stepNum = parseInt(step.dataset.step);
                step.classList.remove('active', 'completed');
                if (stepNum < currentStep) {
                    step.classList.add('completed');
                } else if (stepNum === currentStep) {
                    step.classList.add('active');
                }
            });

            // Scroll to top
            window.scrollTo({ top: 0, behavior: 'smooth' });
        }

        function showAlert(message, type) {
            const alert = document.getElementById('alert');
            alert.className = `alert alert-${type} show`;
            alert.textContent = message;
            setTimeout(() => {
                alert.classList.remove('show');
            }, 5000);
        }

        // Form submission
        document.getElementById('onboardingForm').addEventListener('submit', async (e) => {
            e.preventDefault();

            if (!validateStep(4)) {
                showAlert('Please fill in all required fields', 'danger');
                return;
            }
            saveStepData(4);

            // Disable submit button to prevent double submission
            const submitBtn = e.target.querySelector('button[type="submit"]');
            NocturnalSession.setButtonLoading(submitBtn, {
                loadingHtml: '<i class="fas fa-spinner fa-spin"></i> Processing...'
            });

            try {
                showAlert('Saving your profile...', 'success');

                // Get existing profile marker (user already registered from landing page)
                const hasRegisteredSession = !!localStorage.getItem('userId');
                const profileUpdatePayload = buildProfileUpdatePayload();

                if (!hasRegisteredSession) {
                    // If no token, register new user, then persist the onboarding fields
                    const data = await AppConfig.fetchRoute('auth.register', {
                        method: 'POST',
                        skipAuth: true,
                        parseJson: true,
                        body: JSON.stringify(buildRegistrationPayload())
                    });
                    var authData = NocturnalSession.expectJsonSuccess(data, 'Registration failed', {
                        isSuccess: function (payload) {
                            return !!(payload && payload.success && payload.user);
                        }
                    });
                    NocturnalSession.persistSession(authData.user, 'doctor');
                    const updatedUser = await updateOnboardingProfile(profileUpdatePayload);
                    NocturnalSession.persistSession(updatedUser, 'doctor');
                } else {
                    const updatedUser = await updateOnboardingProfile(profileUpdatePayload);
                    NocturnalSession.persistSession(updatedUser, 'doctor');
                }

                // Upload documents
                await uploadDocuments();

                showAlert('Onboarding completed successfully! Redirecting...', 'success');

                setTimeout(() => {
                    window.location.href = AppConfig.routes.page('doctor.dashboard');
                }, 2000);
            } catch (error) {
                console.error('Onboarding error:', error);
                showAlert(error.message || 'Onboarding failed. Please try again.', 'danger');
            } finally {
                NocturnalSession.resetButtonState(submitBtn);
            }
        });

        async function uploadDocuments() {
            for (const [type, file] of Object.entries(uploadedFiles)) {
                const formData = new FormData();

                // Map frontend field names to backend field names
                let fieldName = '';
                let requestOptions = {
                    method: 'POST',
                    parseJson: true,
                    body: formData
                };
                let result = null;

                if (type === 'profilePhoto') {
                    fieldName = 'profilePhoto';
                } else if (type === 'mciCert') {
                    fieldName = 'mciCertificate';
                } else if (type === 'photoId') {
                    fieldName = 'photoId';
                } else if (type === 'mbbsDegree') {
                    fieldName = 'mbbsDegree';
                }

                formData.append(fieldName, file);

                if (type === 'profilePhoto') {
                    result = await AppConfig.fetchRoute('uploads.profilePhoto', requestOptions);
                } else if (type === 'mciCert') {
                    result = await AppConfig.fetchRoute('uploads.document', requestOptions, {
                        params: { documentType: 'mciCertificate' }
                    });
                } else if (type === 'photoId') {
                    result = await AppConfig.fetchRoute('uploads.document', requestOptions, {
                        params: { documentType: 'photoId' }
                    });
                } else if (type === 'mbbsDegree') {
                    result = await AppConfig.fetchRoute('uploads.document', requestOptions, {
                        params: { documentType: 'mbbsDegree' }
                    });
                }

                NocturnalSession.expectJsonSuccess(result, `Failed to upload ${type}: Upload failed`);
            }
        }

        // Global error handler to catch all errors
        window.addEventListener('error', (event) => {
            console.error('Global error caught:', event.error);
            showAlert('An error occurred: ' + event.error.message, 'danger');
            event.preventDefault();
        });

        window.addEventListener('unhandledrejection', (event) => {
            console.error('Unhandled promise rejection:', event.reason);
            showAlert('An error occurred: ' + (event.reason?.message || event.reason), 'danger');
            event.preventDefault();
        });

        function bindUiEvents() {
            document.addEventListener('click', function(event) {
                const nextButton = event.target.closest('[data-action="next-step"]');
                if (nextButton) {
                    nextStep();
                    return;
                }

                const prevButton = event.target.closest('[data-action="prev-step"]');
                if (prevButton) {
                    prevStep();
                    return;
                }

                const uploadArea = event.target.closest('[data-file-trigger]');
                if (uploadArea) {
                    document.getElementById(uploadArea.dataset.fileTrigger)?.click();
                    return;
                }

                const removeButton = event.target.closest('[data-remove-file]');
                if (removeButton) {
                    removeFile(removeButton.dataset.removeFile);
                }
            });
        }

        bindUiEvents();
