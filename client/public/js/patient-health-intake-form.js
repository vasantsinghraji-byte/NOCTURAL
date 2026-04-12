        // Check authentication
        const token = PatientSession.requireAuthenticatedPage({
            redirectUrl: AppConfig.routes.page('patient.login')
        });

        let currentStep = 1;
        const totalSteps = 5;

        // Form data
        let formData = {
            habits: {},
            conditions: [],
            allergies: [],
            currentMedications: []
        };

        // Initialize
        async function init() {
            await loadDraft();
        }

        // Load existing draft
        async function loadDraft() {
            try {
                const draft = await NocturnalSession.loadOptionalDraft('healthIntake.form', {
                    requestOptions: {
                        headers: { 'Authorization': `Bearer ${token}` }
                    }
                });
                if (draft) {
                    formData = { ...formData, ...draft };
                    populateForm();
                }
            } catch (error) {
                console.error('Error loading draft:', error);
            }
        }

        // Populate form with existing data
        function populateForm() {
            // Habits
            if (formData.habits) {
                Object.keys(formData.habits).forEach(key => {
                    const radio = document.querySelector(`input[name="${key}"][value="${formData.habits[key]}"]`);
                    if (radio) radio.checked = true;
                });
            }

            // Conditions
            formData.conditions.forEach(c => addCondition(c));

            // Allergies
            formData.allergies.forEach(a => addAllergy(a));

            // Medications
            formData.currentMedications.forEach(m => addMedication(m));
        }

        // Navigation
        function nextStep(step) {
            collectStepData(step);
            if (step < totalSteps) {
                showStep(step + 1);
            }
        }

        function prevStep(step) {
            if (step > 1) {
                showStep(step - 1);
            }
        }

        function showStep(step) {
            // Hide all sections
            document.querySelectorAll('.form-section').forEach(s => s.classList.remove('active'));

            // Show current section
            document.getElementById(`step${step}`).classList.add('active');

            // Update progress
            for (let i = 1; i <= totalSteps; i++) {
                const circle = document.getElementById(`step${i}Circle`);
                circle.classList.remove('active', 'completed');
                if (i < step) {
                    circle.classList.add('completed');
                    circle.innerHTML = '&#10003;';
                } else if (i === step) {
                    circle.classList.add('active');
                    circle.innerHTML = i;
                } else {
                    circle.innerHTML = i;
                }
            }

            currentStep = step;

            // If review step, populate review
            if (step === 5) {
                populateReview();
            }
        }

        // Collect data from current step
        function collectStepData(step) {
            if (step === 1) {
                formData.habits = {
                    smokingStatus: document.querySelector('input[name="smokingStatus"]:checked')?.value || 'NEVER',
                    alcoholConsumption: document.querySelector('input[name="alcoholConsumption"]:checked')?.value || 'NONE',
                    exerciseFrequency: document.querySelector('input[name="exerciseFrequency"]:checked')?.value || 'WEEKLY',
                    dietType: document.querySelector('input[name="dietType"]:checked')?.value || 'NON_VEGETARIAN'
                };
            }
        }

        // Add condition
        function addCondition(data = {}) {
            const list = document.getElementById('conditionsList');
            const id = Date.now();

            const html = `
                <div class="list-item" id="condition-${id}">
                    <button class="remove-btn" data-action="remove-item" data-element-id="condition-${id}" data-list-name="conditions">&times;</button>
                    <div class="form-row">
                        <div class="form-group">
                            <label>Condition Name</label>
                            <input type="text" placeholder="e.g., Diabetes, Hypertension"
                                   value="${data.name || ''}"
                                   data-action="update-condition"
                                   data-id="${id}"
                                   data-field="name">
                        </div>
                        <div class="form-group">
                            <label>Severity</label>
                            <select data-action="update-condition" data-id="${id}" data-field="severity">
                                <option value="MILD" ${data.severity === 'MILD' ? 'selected' : ''}>Mild</option>
                                <option value="MODERATE" ${data.severity === 'MODERATE' ? 'selected' : ''}>Moderate</option>
                                <option value="SEVERE" ${data.severity === 'SEVERE' ? 'selected' : ''}>Severe</option>
                                <option value="CHRONIC" ${data.severity === 'CHRONIC' ? 'selected' : ''}>Chronic</option>
                                <option value="CONTROLLED" ${data.severity === 'CONTROLLED' ? 'selected' : ''}>Controlled</option>
                            </select>
                        </div>
                    </div>
                </div>
            `;

            list.insertAdjacentHTML('beforeend', html);
            formData.conditions.push({ id, name: data.name || '', severity: data.severity || 'MILD' });
        }

        function updateCondition(id, field, value) {
            const condition = formData.conditions.find(c => c.id === id);
            if (condition) condition[field] = value;
        }

        // Add allergy
        function addAllergy(data = {}) {
            const list = document.getElementById('allergiesList');
            const id = Date.now();

            const html = `
                <div class="list-item" id="allergy-${id}">
                    <button class="remove-btn" data-action="remove-item" data-element-id="allergy-${id}" data-list-name="allergies">&times;</button>
                    <div class="form-row">
                        <div class="form-group">
                            <label>Allergen</label>
                            <input type="text" placeholder="e.g., Penicillin, Peanuts"
                                   value="${data.allergen || ''}"
                                   data-action="update-allergy"
                                   data-id="${id}"
                                   data-field="allergen">
                        </div>
                        <div class="form-group">
                            <label>Reaction Type</label>
                            <input type="text" placeholder="e.g., Rash, Swelling"
                                   value="${data.reactionType || ''}"
                                   data-action="update-allergy"
                                   data-id="${id}"
                                   data-field="reactionType">
                        </div>
                        <div class="form-group">
                            <label>Severity</label>
                            <select data-action="update-allergy" data-id="${id}" data-field="severity">
                                <option value="MILD" ${data.severity === 'MILD' ? 'selected' : ''}>Mild</option>
                                <option value="MODERATE" ${data.severity === 'MODERATE' ? 'selected' : ''}>Moderate</option>
                                <option value="SEVERE" ${data.severity === 'SEVERE' ? 'selected' : ''}>Severe</option>
                                <option value="LIFE_THREATENING" ${data.severity === 'LIFE_THREATENING' ? 'selected' : ''}>Life Threatening</option>
                            </select>
                        </div>
                    </div>
                </div>
            `;

            list.insertAdjacentHTML('beforeend', html);
            formData.allergies.push({ id, allergen: data.allergen || '', reactionType: data.reactionType || '', severity: data.severity || 'MILD' });
        }

        function updateAllergy(id, field, value) {
            const allergy = formData.allergies.find(a => a.id === id);
            if (allergy) allergy[field] = value;
        }

        // Add medication
        function addMedication(data = {}) {
            const list = document.getElementById('medicationsList');
            const id = Date.now();

            const html = `
                <div class="list-item" id="medication-${id}">
                    <button class="remove-btn" data-action="remove-item" data-element-id="medication-${id}" data-list-name="currentMedications">&times;</button>
                    <div class="form-row">
                        <div class="form-group">
                            <label>Medication Name</label>
                            <input type="text" placeholder="e.g., Metformin, Aspirin"
                                   value="${data.name || ''}"
                                   data-action="update-medication"
                                   data-id="${id}"
                                   data-field="name">
                        </div>
                        <div class="form-group">
                            <label>Dosage</label>
                            <input type="text" placeholder="e.g., 500mg"
                                   value="${data.dosage || ''}"
                                   data-action="update-medication"
                                   data-id="${id}"
                                   data-field="dosage">
                        </div>
                        <div class="form-group">
                            <label>Frequency</label>
                            <input type="text" placeholder="e.g., Twice daily"
                                   value="${data.frequency || ''}"
                                   data-action="update-medication"
                                   data-id="${id}"
                                   data-field="frequency">
                        </div>
                    </div>
                </div>
            `;

            list.insertAdjacentHTML('beforeend', html);
            formData.currentMedications.push({ id, name: data.name || '', dosage: data.dosage || '', frequency: data.frequency || '' });
        }

        function updateMedication(id, field, value) {
            const medication = formData.currentMedications.find(m => m.id === id);
            if (medication) medication[field] = value;
        }

        // Remove item
        function removeItem(elementId, listName) {
            document.getElementById(elementId).remove();
            const id = parseInt(elementId.split('-')[1]);
            formData[listName] = formData[listName].filter(item => item.id !== id);
        }

        // Populate review
        function populateReview() {
            collectStepData(currentStep);

            const review = document.getElementById('reviewContent');

            const habitsLabels = {
                smokingStatus: 'Smoking',
                alcoholConsumption: 'Alcohol',
                exerciseFrequency: 'Exercise',
                dietType: 'Diet'
            };

            let html = `
                <div class="list-item">
                    <h4 style="margin-bottom: 15px;">Lifestyle & Habits</h4>
                    ${Object.entries(formData.habits).map(([key, value]) => `
                        <p><strong>${habitsLabels[key]}:</strong> ${value.replace('_', ' ')}</p>
                    `).join('')}
                </div>

                <div class="list-item">
                    <h4 style="margin-bottom: 15px;">Medical Conditions (${formData.conditions.filter(c => c.name).length})</h4>
                    ${formData.conditions.filter(c => c.name).map(c => `
                        <p>${c.name} - <em>${c.severity}</em></p>
                    `).join('') || '<p style="color: #666;">No conditions added</p>'}
                </div>

                <div class="list-item">
                    <h4 style="margin-bottom: 15px;">Allergies (${formData.allergies.filter(a => a.allergen).length})</h4>
                    ${formData.allergies.filter(a => a.allergen).map(a => `
                        <p>${a.allergen} - ${a.reactionType || 'N/A'} - <em>${a.severity}</em></p>
                    `).join('') || '<p style="color: #666;">No allergies added</p>'}
                </div>

                <div class="list-item">
                    <h4 style="margin-bottom: 15px;">Current Medications (${formData.currentMedications.filter(m => m.name).length})</h4>
                    ${formData.currentMedications.filter(m => m.name).map(m => `
                        <p>${m.name} ${m.dosage ? `(${m.dosage})` : ''} ${m.frequency ? `- ${m.frequency}` : ''}</p>
                    `).join('') || '<p style="color: #666;">No medications added</p>'}
                </div>
            `;

            review.innerHTML = html;
        }

        // Save draft
        async function saveDraft() {
            collectStepData(currentStep);
            showLoading(true);

            try {
                // Clean data (remove internal ids)
                const cleanData = {
                    ...formData,
                    conditions: formData.conditions.filter(c => c.name).map(({ id, ...rest }) => rest),
                    allergies: formData.allergies.filter(a => a.allergen).map(({ id, ...rest }) => rest),
                    currentMedications: formData.currentMedications.filter(m => m.name).map(({ id, ...rest }) => rest)
                };

                NocturnalSession.expectJsonSuccess(await AppConfig.fetchRoute('healthIntake.draft', {
                    method: 'POST',
                    parseJson: true,
                    headers: {
                        'Authorization': `Bearer ${token}`,
                        'Content-Type': 'application/json'
                    },
                    body: JSON.stringify(cleanData)
                }), 'Failed to save draft');

                showToast('Draft saved successfully', 'success');
            } catch (error) {
                console.error('Error saving draft:', error);
                showToast(error.message || 'Failed to save draft', 'error');
            } finally {
                showLoading(false);
            }
        }

        // Submit form
        async function submitForm() {
            collectStepData(currentStep);
            showLoading(true);

            try {
                // Clean data
                const cleanData = {
                    ...formData,
                    conditions: formData.conditions.filter(c => c.name).map(({ id, ...rest }) => rest),
                    allergies: formData.allergies.filter(a => a.allergen).map(({ id, ...rest }) => rest),
                    currentMedications: formData.currentMedications.filter(m => m.name).map(({ id, ...rest }) => rest)
                };

                NocturnalSession.expectJsonSuccess(await AppConfig.fetchRoute('healthIntake.submit', {
                    method: 'POST',
                    parseJson: true,
                    headers: {
                        'Authorization': `Bearer ${token}`,
                        'Content-Type': 'application/json'
                    },
                    body: JSON.stringify(cleanData)
                }), 'Failed to submit');

                showToast('Health profile submitted for review!', 'success');
                setTimeout(() => {
                    window.location.href = AppConfig.routes.page('patient.healthDashboard');
                }, 2000);
            } catch (error) {
                console.error('Error submitting form:', error);
                showToast(error.message || 'Failed to submit', 'error');
            } finally {
                showLoading(false);
            }
        }

        // UI Helpers
        function showLoading(show) {
            document.getElementById('loadingOverlay').style.display = show ? 'flex' : 'none';
        }

        function showToast(message, type = 'info') {
            const toast = document.createElement('div');
            toast.className = `toast ${type}`;
            toast.textContent = message;
            document.body.appendChild(toast);
            setTimeout(() => toast.remove(), 3000);
        }

        function goBack() {
            window.location.href = AppConfig.routes.page('patient.healthDashboard');
        }

        function bindUiEvents() {
            document.getElementById('backBtn')?.addEventListener('click', goBack);

            document.addEventListener('click', function(event) {
                const actionElement = event.target.closest('[data-action]');
                if (!actionElement) {
                    return;
                }

                const action = actionElement.dataset.action;

                if (action === 'next-step') {
                    nextStep(parseInt(actionElement.dataset.step, 10));
                } else if (action === 'prev-step') {
                    prevStep(parseInt(actionElement.dataset.step, 10));
                } else if (action === 'add-condition') {
                    addCondition();
                } else if (action === 'add-allergy') {
                    addAllergy();
                } else if (action === 'add-medication') {
                    addMedication();
                } else if (action === 'save-draft') {
                    saveDraft();
                } else if (action === 'submit-form') {
                    submitForm();
                } else if (action === 'remove-item') {
                    removeItem(actionElement.dataset.elementId, actionElement.dataset.listName);
                }
            });

            document.addEventListener('change', function(event) {
                const actionElement = event.target.closest('[data-action]');
                if (!actionElement) {
                    return;
                }

                const itemId = parseInt(actionElement.dataset.id, 10);
                const field = actionElement.dataset.field;

                if (actionElement.dataset.action === 'update-condition') {
                    updateCondition(itemId, field, event.target.value);
                } else if (actionElement.dataset.action === 'update-allergy') {
                    updateAllergy(itemId, field, event.target.value);
                } else if (actionElement.dataset.action === 'update-medication') {
                    updateMedication(itemId, field, event.target.value);
                }
            });
        }

        // Initialize
        bindUiEvents();
        init();
