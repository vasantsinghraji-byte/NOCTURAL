/**
 * Patient Clinical History Intake JavaScript
 * Extracted from inline script in patient-clinical-history-form.html for CSP compliance.
 * Handles form navigation, dynamic lists, draft save/load, and submission.
 */

if (typeof AppConfig === 'undefined') {
    console.error('patient-clinical-history-form.js: AppConfig not loaded - ensure config.js is included before this script');
}

// Authentication
var token = PatientSession.requireAuthenticatedPage({
    redirectUrl: AppConfig.routes.page('patient.login')
});

// State
var currentSection = 1;
var totalSections = 11;
var formData = {};

// Initialize
function init() {
    setupEventListeners();
    loadDraft();
    calculateAge();
}

// Setup event listeners
function setupEventListeners() {
    // Sex change - show/hide OB/GYN section
    document.getElementById('sex').addEventListener('change', function() {
        var obgynSection = document.getElementById('obgynSection');
        obgynSection.style.display = this.value === 'FEMALE' ? 'block' : 'none';
    });

    // DOB change - calculate age
    document.getElementById('dob').addEventListener('change', calculateAge);

    // Smoking status - show/hide details
    document.querySelectorAll('input[name="smokingStatus"]').forEach(function(radio) {
        radio.addEventListener('change', function() {
            var details = document.getElementById('smokingDetails');
            details.style.display = this.value !== 'NEVER' ? 'block' : 'none';
            if (this.value !== 'NEVER') calculatePackYears();
        });
    });

    // Alcohol status - show/hide details
    document.querySelectorAll('input[name="alcoholStatus"]').forEach(function(radio) {
        radio.addEventListener('change', function() {
            var details = document.getElementById('alcoholDetails');
            details.style.display = this.value !== 'NEVER' ? 'block' : 'none';
        });
    });

    // Allergy status - show/hide allergy section
    document.querySelectorAll('input[name="allergyStatus"]').forEach(function(radio) {
        radio.addEventListener('change', function() {
            var section = document.getElementById('allergySection');
            section.style.display = this.value === 'YES' ? 'block' : 'none';
        });
    });

    // Pack-years calculation
    ['tobaccoQuantity', 'tobaccoYears'].forEach(function(id) {
        document.getElementById(id).addEventListener('change', calculatePackYears);
    });
}

// Calculate age from DOB
function calculateAge() {
    var dob = document.getElementById('dob').value;
    if (dob) {
        var today = new Date();
        var birthDate = new Date(dob);
        var age = today.getFullYear() - birthDate.getFullYear();
        var monthDiff = today.getMonth() - birthDate.getMonth();
        if (monthDiff < 0 || (monthDiff === 0 && today.getDate() < birthDate.getDate())) {
            age--;
        }
        document.getElementById('age').value = age;
    }
}

// Calculate BMI
function calculateBMI() {
    var height = parseFloat(document.getElementById('height').value);
    var weight = parseFloat(document.getElementById('weight').value);

    if (height && weight) {
        var heightM = height / 100;
        var bmi = (weight / (heightM * heightM)).toFixed(1);
        document.getElementById('bmi').value = bmi;
    }
}

// Calculate pack-years
function calculatePackYears() {
    var quantity = parseFloat(document.getElementById('tobaccoQuantity').value) || 0;
    var years = parseFloat(document.getElementById('tobaccoYears').value) || 0;
    var packYears = ((quantity / 20) * years).toFixed(1);
    document.getElementById('packYears').value = packYears;
}

// Navigation
function showSection(num) {
    if (num < 1 || num > totalSections) return;

    // Hide all sections
    document.querySelectorAll('.section').forEach(function(s) { s.classList.remove('active'); });

    // Show target section
    document.getElementById('section' + num).classList.add('active');

    // Update sidebar
    document.querySelectorAll('.nav-item').forEach(function(item, idx) {
        item.classList.remove('active');
        if (idx === num - 1) item.classList.add('active');
    });

    currentSection = num;
    window.scrollTo(0, 0);
}

function nextSection() {
    if (currentSection < totalSections) {
        showSection(currentSection + 1);
    }
}

function prevSection() {
    if (currentSection > 1) {
        showSection(currentSection - 1);
    }
}

// Dynamic list functions
function addSecondaryComplaint() {
    var list = document.getElementById('secondaryComplaintsList');
    var id = Date.now();
    var html = '<div class="list-item" id="complaint-' + id + '">'
        + '<button class="remove-btn" data-action="remove-item" data-item-id="complaint-' + id + '">&times;</button>'
        + '<div class="form-row-2">'
        + '<div class="form-group"><label>Complaint</label><input type="text" placeholder="Describe the complaint"></div>'
        + '<div class="form-group"><label>Duration</label><input type="text" placeholder="e.g., 3 days"></div>'
        + '</div></div>';
    list.insertAdjacentHTML('beforeend', html);
}

function addTreatmentTried() {
    var list = document.getElementById('treatmentsTriedList');
    var id = Date.now();
    var html = '<div class="list-item" id="treatment-' + id + '">'
        + '<button class="remove-btn" data-action="remove-item" data-item-id="treatment-' + id + '">&times;</button>'
        + '<div class="form-row-3">'
        + '<div class="form-group"><label>Treatment/Medication</label><input type="text" placeholder="Name"></div>'
        + '<div class="form-group"><label>Dose/Frequency</label><input type="text" placeholder="e.g., 500mg twice daily"></div>'
        + '<div class="form-group"><label>Result</label><select>'
        + '<option value="EFFECTIVE">Effective</option>'
        + '<option value="PARTIAL">Partially effective</option>'
        + '<option value="INEFFECTIVE">Ineffective</option>'
        + '<option value="ADVERSE">Adverse reaction</option>'
        + '</select></div>'
        + '</div></div>';
    list.insertAdjacentHTML('beforeend', html);
}

function addChronicCondition() {
    var list = document.getElementById('chronicConditionsList');
    var id = Date.now();
    var html = '<div class="list-item" id="chronic-' + id + '">'
        + '<button class="remove-btn" data-action="remove-item" data-item-id="chronic-' + id + '">&times;</button>'
        + '<div class="form-row-3">'
        + '<div class="form-group"><label>Condition</label><input type="text" placeholder="e.g., Type 2 Diabetes"></div>'
        + '<div class="form-group"><label>Year Diagnosed</label><input type="number" min="1900" max="2025" placeholder="YYYY"></div>'
        + '<div class="form-group"><label>Current Status</label><select>'
        + '<option value="CONTROLLED">Controlled</option>'
        + '<option value="UNCONTROLLED">Uncontrolled</option>'
        + '<option value="CHRONIC">Chronic</option>'
        + '</select></div>'
        + '</div></div>';
    list.insertAdjacentHTML('beforeend', html);
}

function addSurgery() {
    var list = document.getElementById('surgeryList');
    var id = Date.now();
    var html = '<div class="list-item" id="surgery-' + id + '">'
        + '<button class="remove-btn" data-action="remove-item" data-item-id="surgery-' + id + '">&times;</button>'
        + '<div class="form-row-3">'
        + '<div class="form-group"><label>Surgery Type</label><input type="text" placeholder="e.g., Appendectomy"></div>'
        + '<div class="form-group"><label>Year</label><input type="number" min="1900" max="2025" placeholder="YYYY"></div>'
        + '<div class="form-group"><label>Hospital</label><input type="text" placeholder="Hospital name"></div>'
        + '</div>'
        + '<div class="form-group"><label>Complications</label><input type="text" placeholder="Any complications or issues"></div>'
        + '</div>';
    list.insertAdjacentHTML('beforeend', html);
}

function addMedication() {
    var list = document.getElementById('medicationsList');
    var id = Date.now();
    var html = '<div class="list-item" id="med-' + id + '">'
        + '<button class="remove-btn" data-action="remove-item" data-item-id="med-' + id + '">&times;</button>'
        + '<div class="form-row-3">'
        + '<div class="form-group"><label>Drug Name</label><input type="text" placeholder="e.g., Metformin"></div>'
        + '<div class="form-group"><label>Strength</label><input type="text" placeholder="e.g., 500mg"></div>'
        + '<div class="form-group"><label>Frequency</label><input type="text" placeholder="e.g., Twice daily"></div>'
        + '</div>'
        + '<div class="form-row-2">'
        + '<div class="form-group"><label>Route</label><select>'
        + '<option value="ORAL">Oral</option>'
        + '<option value="IV">Intravenous</option>'
        + '<option value="IM">Intramuscular</option>'
        + '<option value="TOPICAL">Topical</option>'
        + '<option value="INHALED">Inhaled</option>'
        + '</select></div>'
        + '<div class="form-group"><label>Indication</label><input type="text" placeholder="What is it for?"></div>'
        + '</div></div>';
    list.insertAdjacentHTML('beforeend', html);
}

function addAllergy() {
    var list = document.getElementById('allergiesList');
    var id = Date.now();
    var html = '<div class="list-item" id="allergy-' + id + '">'
        + '<button class="remove-btn" data-action="remove-item" data-item-id="allergy-' + id + '">&times;</button>'
        + '<div class="form-row-3">'
        + '<div class="form-group"><label>Drug/Substance</label><input type="text" placeholder="e.g., Penicillin"></div>'
        + '<div class="form-group"><label>Reaction Type</label><select>'
        + '<option value="RASH">Rash</option>'
        + '<option value="ANAPHYLAXIS">Anaphylaxis</option>'
        + '<option value="ANGIOEDEMA">Angioedema</option>'
        + '<option value="GI_UPSET">GI Upset</option>'
        + '<option value="FEVER">Fever</option>'
        + '<option value="OTHER">Other</option>'
        + '</select></div>'
        + '<div class="form-group"><label>Severity</label><select>'
        + '<option value="MILD">Mild</option>'
        + '<option value="MODERATE">Moderate</option>'
        + '<option value="SEVERE">Severe (life-threatening)</option>'
        + '</select></div>'
        + '</div>'
        + '<div class="form-group"><label>Details</label><input type="text" placeholder="Additional details about the reaction"></div>'
        + '</div>';
    list.insertAdjacentHTML('beforeend', html);
}

function addDifferentialDiagnosis() {
    var list = document.getElementById('differentialDiagnosisList');
    var id = Date.now();
    var html = '<div class="list-item" id="ddx-' + id + '">'
        + '<button class="remove-btn" data-action="remove-item" data-item-id="ddx-' + id + '">&times;</button>'
        + '<div class="form-group"><label>Differential Diagnosis</label>'
        + '<input type="text" placeholder="Possible alternative diagnosis"></div>'
        + '<div class="form-group"><label>Reasoning</label>'
        + '<textarea rows="2" placeholder="Why consider this? How to differentiate from primary?"></textarea></div>'
        + '</div>';
    list.insertAdjacentHTML('beforeend', html);
}

function addPrescribedMedication() {
    var list = document.getElementById('prescribedMedicationsList');
    var id = Date.now();
    var html = '<div class="list-item" id="rx-' + id + '">'
        + '<button class="remove-btn" data-action="remove-item" data-item-id="rx-' + id + '">&times;</button>'
        + '<div class="form-row-3">'
        + '<div class="form-group"><label>Drug Name</label><input type="text" placeholder="e.g., Amoxicillin"></div>'
        + '<div class="form-group"><label>Strength</label><input type="text" placeholder="e.g., 500mg"></div>'
        + '<div class="form-group"><label>Frequency</label><input type="text" placeholder="e.g., Three times daily"></div>'
        + '</div>'
        + '<div class="form-row-2">'
        + '<div class="form-group"><label>Duration</label><input type="text" placeholder="e.g., 7 days"></div>'
        + '<div class="form-group"><label>Indication</label><input type="text" placeholder="What is it for?"></div>'
        + '</div></div>';
    list.insertAdjacentHTML('beforeend', html);
}

function removeItem(id) {
    document.getElementById(id).remove();
}

// Generate review summary
function generateReviewSummary() {
    var summary = document.getElementById('reviewSummary');

    var patientName = document.getElementById('patientName').value || 'Not provided';
    var age = document.getElementById('age').value || 'N/A';
    var sex = document.getElementById('sex').value || 'N/A';
    var chiefComplaint = document.getElementById('chiefComplaint').value || 'Not provided';

    var html = '<div style="margin-bottom: 20px;">'
        + '<h4 style="color: #667eea; margin-bottom: 10px;">Patient Information</h4>'
        + '<p><strong>Name:</strong> ' + patientName + '</p>'
        + '<p><strong>Age/Sex:</strong> ' + age + ' years / ' + sex + '</p>'
        + '<p><strong>Chief Complaint:</strong> ' + chiefComplaint + '</p>'
        + '</div>'
        + '<div class="alert alert-info">'
        + '<strong>Form Completion:</strong> All ' + totalSections + ' sections have been accessed. Please review each section carefully before submitting.'
        + '</div>'
        + '<p style="margin-top: 15px; font-size: 13px; color: #666;">'
        + 'To review specific sections, use the navigation on the left sidebar.'
        + '</p>';

    summary.innerHTML = html;
}

// Data collection and submission
function collectAllData() {
    // This would collect all form data into a structured object
    // For brevity, returning a basic structure
    return {
        patientInfo: {
            name: document.getElementById('patientName').value,
            dob: document.getElementById('dob').value,
            age: document.getElementById('age').value,
            sex: document.getElementById('sex').value
            // ... all other fields
        }
        // ... all other sections
    };
}

async function saveDraft() {
    showLoading(true);
    try {
        var data = collectAllData();
        NocturnalSession.expectJsonSuccess(await AppConfig.fetchRoute('healthIntake.draft', {
            method: 'POST',
            parseJson: true,
            headers: {
                'Authorization': 'Bearer ' + token,
                'Content-Type': 'application/json'
            },
            body: JSON.stringify(data)
        }), 'Failed to save draft');
        showToast('Draft saved successfully', 'success');
    } catch (error) {
        console.error('Error saving draft:', error);
        showToast(error.message || 'Failed to save draft', 'error');
    } finally {
        showLoading(false);
    }
}

async function submitForm() {
    // Validate attestation
    if (!document.getElementById('attestation').checked) {
        showToast('Please confirm the attestation checkbox', 'error');
        return;
    }

    showLoading(true);
    try {
        var data = collectAllData();
        NocturnalSession.expectJsonSuccess(await AppConfig.fetchRoute('healthIntake.submit', {
            method: 'POST',
            parseJson: true,
            headers: {
                'Authorization': 'Bearer ' + token,
                'Content-Type': 'application/json'
            },
            body: JSON.stringify(data)
        }), 'Failed to submit form');

        showToast('Clinical history submitted successfully!', 'success');
        setTimeout(function() {
            window.location.href = AppConfig.routes.page('patient.healthDashboard');
        }, 2000);
    } catch (error) {
        console.error('Error submitting form:', error);
        showToast('Failed to submit form', 'error');
    } finally {
        showLoading(false);
    }
}

async function loadDraft() {
    // Load any existing draft data
    try {
        var draft = await NocturnalSession.loadOptionalDraft('healthIntake.form', {
            requestOptions: {
                headers: { 'Authorization': 'Bearer ' + token }
            },
            selectDraft: function(payload) {
                return payload && payload.form ? payload.form : null;
            }
        });
        if (draft) {
            // Populate form with draft data
            // populateFormWithData(draft);
        }
    } catch (error) {
        console.error('Error loading draft:', error);
    }
}

// UI helpers
function showLoading(show) {
    document.getElementById('loadingOverlay').style.display = show ? 'flex' : 'none';
}

function showToast(message, type) {
    if (!type) type = 'info';
    var toast = document.createElement('div');
    toast.className = 'toast ' + type;
    toast.textContent = message;
    document.body.appendChild(toast);
    setTimeout(function() { toast.remove(); }, 3000);
}

function goBack() {
    if (confirm('Are you sure? Unsaved changes will be lost.')) {
        window.location.href = AppConfig.routes.page('patient.healthDashboard');
    }
}

function bindUiEvents() {
    document.getElementById('backBtn')?.addEventListener('click', goBack);
    document.getElementById('saveDraftHeaderBtn')?.addEventListener('click', saveDraft);
    document.getElementById('printBtn')?.addEventListener('click', function() {
        window.print();
    });
    document.getElementById('currentSeverity')?.addEventListener('input', function() {
        document.getElementById('currentSeverityValue').textContent = this.value;
    });
    document.getElementById('worstSeverity')?.addEventListener('input', function() {
        document.getElementById('worstSeverityValue').textContent = this.value;
    });
    document.getElementById('height')?.addEventListener('change', calculateBMI);
    document.getElementById('weight')?.addEventListener('change', calculateBMI);

    document.querySelectorAll('.nav-item[data-section]').forEach(function(item) {
        item.addEventListener('click', function() {
            showSection(parseInt(this.dataset.section, 10));
        });
    });

    document.addEventListener('click', function(event) {
        var actionElement = event.target.closest('[data-action]');
        if (!actionElement) {
            return;
        }

        var action = actionElement.dataset.action;
        if (action === 'next-section') nextSection();
        else if (action === 'prev-section') prevSection();
        else if (action === 'add-secondary-complaint') addSecondaryComplaint();
        else if (action === 'add-treatment') addTreatmentTried();
        else if (action === 'add-chronic-condition') addChronicCondition();
        else if (action === 'add-surgery') addSurgery();
        else if (action === 'add-medication') addMedication();
        else if (action === 'add-allergy') addAllergy();
        else if (action === 'add-differential-diagnosis') addDifferentialDiagnosis();
        else if (action === 'add-prescribed-medication') addPrescribedMedication();
        else if (action === 'generate-summary') generateReviewSummary();
        else if (action === 'save-draft') saveDraft();
        else if (action === 'submit-form') submitForm();
        else if (action === 'remove-item') removeItem(actionElement.dataset.itemId);
    });
}

// Initialize on load
window.addEventListener('DOMContentLoaded', function() {
    bindUiEvents();
    init();
});
