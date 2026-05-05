// API_URL is provided by config.js
        let currentUser = null;

        // Check authentication
        function checkAuth() {
            return DoctorSession.requireAuthenticatedPage({
                redirectUrl: AppConfig.routes.page('home')
            });
        }

        // Load profile data
        async function loadProfile() {
            if (!checkAuth()) return;

            try {
                const data = NocturnalSession.expectJsonSuccess(await AppConfig.fetchRoute('auth.me', {
                    parseJson: true
                }), 'Failed to load profile', {
                    isSuccess: function (payload) {
                        return !!(payload && payload.success && payload.user);
                    }
                });
                currentUser = data.user;
                displayProfile(currentUser);
            } catch (error) {
                console.error('Error loading profile:', error);
                showAlert('Error loading profile', 'danger');
            }
        }

        // Display profile data
        function displayProfile(user) {
            // Profile photo
            if (user.profilePhoto && user.profilePhoto.url) {
                document.getElementById('profilePhoto').innerHTML = `<img class="profile-photo-image" src="${API_URL.replace('/api', '')}${user.profilePhoto.url}" alt="Profile photo">`;
            }

            // Basic info
            document.getElementById('profileName').textContent = user.name;
            document.getElementById('profileSpecialty').textContent = user.professional?.primarySpecialization || 'Medical Professional';

            // Profile strength
            const strength = user.profileStrength || 0;
            document.getElementById('strengthValue').textContent = AppFormat.percent(strength);
            AppUi.setPercentWidth(document.getElementById('strengthFill'), strength);

            // Stats
            document.getElementById('statRating').textContent = AppFormat.decimal(user.rating || 0, 1);
            document.getElementById('statShifts').textContent = user.completedDuties || 0;
            document.getElementById('statRate').textContent = AppFormat.percent(user.completionRate || 100);

            // Professional details
            if (user.professional) {
                document.getElementById('mciNumber').value = user.professional.mciNumber || '';
                document.getElementById('stateMedicalCouncil').value = user.professional.stateMedicalCouncil || '';
                document.getElementById('primarySpecialization').value = user.professional.primarySpecialization || '';
                document.getElementById('yearsOfExperience').value = user.professional.yearsOfExperience || '';
                document.getElementById('employmentStatus').value = user.professional.currentEmploymentStatus || '';
                document.getElementById('serviceRadius').value = user.professional.serviceRadius ? `${user.professional.serviceRadius} km` : '';
                document.getElementById('minimumRate').value = user.professional.minimumRate ? `₹${user.professional.minimumRate}` : '';

                // Skills
                const skillsGrid = document.getElementById('skillsGrid');
                skillsGrid.innerHTML = '';
                if (user.professional.proceduralSkills && user.professional.proceduralSkills.length > 0) {
                    user.professional.proceduralSkills.forEach(skill => {
                        skillsGrid.innerHTML += `
                            <div class="skill-tag">
                                <i class="fas fa-check-circle"></i>
                                ${skill}
                            </div>
                        `;
                    });
                } else {
                    skillsGrid.innerHTML = '<p class="muted-text">No skills added yet</p>';
                }

                // Preferences
                const preferencesGrid = document.getElementById('preferencesGrid');
                preferencesGrid.innerHTML = '';
                if (user.professional.preferredShiftTimes && user.professional.preferredShiftTimes.length > 0) {
                    user.professional.preferredShiftTimes.forEach(time => {
                        preferencesGrid.innerHTML += `<div class="preference-chip">${time}</div>`;
                    });
                } else {
                    preferencesGrid.innerHTML = '<p class="muted-text">No preferences set</p>';
                }
            }

            // Bank details
            if (user.bankDetails) {
                document.getElementById('accountHolderName').value = user.bankDetails.accountHolderName || '';
                document.getElementById('accountNumber').value = user.bankDetails.accountNumber || '';
                document.getElementById('ifscCode').value = user.bankDetails.ifscCode || '';
                document.getElementById('bankName').value = user.bankDetails.bankName || '';
            }

            // Documents
            displayDocuments(user);
        }

        // Display documents
        function displayDocuments(user) {
            const documentsList = document.getElementById('documentsList');
            const documents = [
                {
                    name: 'MCI Certificate',
                    key: 'mciCertificate',
                    icon: 'fa-certificate',
                    data: user.documents?.mciCertificate
                },
                {
                    name: 'Photo ID',
                    key: 'photoId',
                    icon: 'fa-id-card',
                    data: user.documents?.photoId
                },
                {
                    name: 'MBBS Degree',
                    key: 'mbbsDegree',
                    icon: 'fa-graduation-cap',
                    data: user.documents?.mbbsDegree
                }
            ];

            documentsList.innerHTML = '';
            documents.forEach(doc => {
                const hasDocument = doc.data && doc.data.url;
                const isVerified = doc.data && doc.data.verified;

                let statusHTML = '';
                let statusClass = '';
                if (hasDocument) {
                    if (isVerified) {
                        statusHTML = '<i class="fas fa-check-circle"></i> Verified';
                        statusClass = 'status-verified';
                    } else {
                        statusHTML = '<i class="fas fa-clock"></i> Pending Verification';
                        statusClass = 'status-pending';
                    }
                } else {
                    statusHTML = '<i class="fas fa-exclamation-circle"></i> Not Uploaded';
                    statusClass = 'status-missing';
                }

                documentsList.innerHTML += `
                    <div class="document-item">
                        <div class="document-info">
                            <div class="document-icon">
                                <i class="fas ${doc.icon}"></i>
                            </div>
                            <div class="document-details">
                                <div class="document-name">${doc.name}</div>
                                <div class="document-status ${statusClass}">${statusHTML}</div>
                            </div>
                        </div>
                        <div class="document-actions">
                            ${hasDocument ? `
                                <button class="btn-icon btn-view" data-action="view-document" data-document-url="${doc.data.url}" title="View">
                                    <i class="fas fa-eye"></i>
                                </button>
                            ` : ''}
                            <button class="btn-icon btn-upload" data-action="upload-document" data-document-key="${doc.key}" title="${hasDocument ? 'Replace' : 'Upload'}">
                                <i class="fas fa-upload"></i>
                            </button>
                        </div>
                    </div>
                `;
            });
        }

        // Upload profile photo
        document.getElementById('photoInput').addEventListener('change', async (e) => {
            const file = e.target.files[0];
            if (!file) return;

            if (!checkAuth()) return;
            const formData = new FormData();
            formData.append('profilePhoto', file);

            try {
                NocturnalSession.expectJsonSuccess(await AppConfig.fetchRoute('uploads.profilePhoto', {
                    method: 'POST',
                    parseJson: true,
                    body: formData
                }), 'Upload failed');
                showAlert('Profile photo updated successfully!', 'success');
                loadProfile();
            } catch (error) {
                console.error('Upload error:', error);
                showAlert('Error uploading photo', 'danger');
            }
        });

        // Upload document
        function uploadDocument(docType) {
            const input = document.createElement('input');
            input.type = 'file';
            input.accept = '.jpg,.jpeg,.png,.pdf';
            input.addEventListener('change', async (e) => {
                const file = e.target.files[0];
                if (!file) return;

                if (!checkAuth()) return;
                const formData = new FormData();
                formData.append(docType, file);

                try {
                    NocturnalSession.expectJsonSuccess(await AppConfig.fetchRoute('uploads.document', {
                        method: 'POST',
                        parseJson: true,
                        body: formData
                    }, {
                        params: { documentType: docType }
                    }), 'Upload failed');
                    showAlert('Document uploaded successfully!', 'success');
                    loadProfile();
                } catch (error) {
                    console.error('Upload error:', error);
                    showAlert('Error uploading document', 'danger');
                }
            });
            input.click();
        }

        // View document
        function viewDocument(url) {
            window.open(API_URL.replace('/api', '') + url, '_blank');
        }

        // Toggle edit mode
        function toggleEdit(section) {
            const form = document.getElementById(`${section}Form`);
            const inputs = form.querySelectorAll('.form-control');
            const saveBtn = form.querySelector('.btn-save');

            inputs.forEach(input => {
                input.disabled = !input.disabled;
            });

            saveBtn.classList.toggle('is-hidden');
        }

        // Show alert
        function showAlert(message, type) {
            const alert = document.getElementById('alert');
            alert.className = `alert alert-${type} show`;
            alert.innerHTML = `<i class="fas fa-${type === 'success' ? 'check-circle' : 'exclamation-circle'}"></i> ${message}`;
            setTimeout(() => {
                alert.classList.remove('show');
            }, 5000);
        }

        function bindUiEvents() {
            document.querySelectorAll('.btn-edit[data-section]').forEach(button => {
                button.addEventListener('click', function() {
                    toggleEdit(this.dataset.section);
                });
            });

            document.getElementById('documentsList')?.addEventListener('click', function(event) {
                const actionElement = event.target.closest('[data-action]');
                if (!actionElement) {
                    return;
                }

                if (actionElement.dataset.action === 'view-document') {
                    viewDocument(actionElement.dataset.documentUrl);
                } else if (actionElement.dataset.action === 'upload-document') {
                    uploadDocument(actionElement.dataset.documentKey);
                }
            });
        }

        // Initialize
        document.addEventListener('DOMContentLoaded', function() {
            bindUiEvents();
            loadProfile();
        });


