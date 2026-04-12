        let reportId = null;
        let reportData = null;

        document.addEventListener('DOMContentLoaded', () => {
            checkAuth();
            const params = new URLSearchParams(window.location.search);
            reportId = params.get('id');

            if (!reportId) {
                showToast('Report ID not provided', 'error');
                setTimeout(() => window.location.href = AppConfig.routes.page('patient.analytics'), 2000);
                return;
            }

            loadReport();
            loadSpecializations();
        });

        function checkAuth() {
            if (!PatientSession.requireAuthenticatedPage({
                redirectUrl: AppConfig.routes.page('patient.login')
            })) window.location.href = AppConfig.routes.page('patient.login');
        }

        function logout() {
            PatientSession.logout({
                redirectUrl: AppConfig.routes.page('home')
            });
        }

        function showToast(message, type = 'info') {
            const container = document.getElementById('toastContainer');
            const toast = document.createElement('div');
            toast.className = `toast ${type}`;
            toast.innerHTML = `<i class="fas fa-${type === 'success' ? 'check-circle' : 'exclamation-circle'}"></i> ${message}`;
            container.appendChild(toast);
            setTimeout(() => toast.remove(), 4000);
        }

        function getToken() {
            return PatientSession.getToken();
        }

        async function apiCall(endpoint, options = {}) {
            const token = getToken();
            const baseUrl = AppConfig.api(endpoint);

            const response = await fetch(baseUrl, {
                ...options,
                headers: {
                    'Content-Type': 'application/json',
                    'Authorization': `Bearer ${token}`,
                    ...options.headers
                }
            });

            if (response.status === 401) { logout(); return null; }
            return response.json();
        }

        async function loadReport() {
            try {
                const result = await apiCall(`/patient-analytics/reports/${reportId}`);

                if (result?.success) {
                    reportData = result.report;
                    renderReport(reportData);
                } else {
                    showToast(result?.message || 'Failed to load report', 'error');
                }
            } catch (error) {
                console.error('Error:', error);
                showToast('Failed to load report', 'error');
            } finally {
                document.getElementById('loadingContainer').style.display = 'none';
                document.getElementById('reportContent').style.display = 'block';
            }
        }

        function renderReport(report) {
            // Header
            document.getElementById('reportTitle').textContent = report.title;
            document.getElementById('reportType').textContent = report.reportType.replace(/_/g, ' ');
            document.getElementById('reportDate').textContent = new Date(report.reportDate).toLocaleDateString();
            document.getElementById('reportNumber').textContent = report.reportNumber;

            if (report.description) {
                document.getElementById('reportDescription').textContent = report.description;
            }

            // Status Badge
            const statusBadge = document.getElementById('statusBadge');
            const statusMap = {
                'UPLOADED': { class: 'uploaded', text: 'Uploaded' },
                'AI_ANALYZING': { class: 'analyzing', text: 'AI Analyzing...' },
                'AI_ANALYZED': { class: 'analyzed', text: 'AI Analyzed' },
                'AI_FAILED': { class: 'failed', text: 'Analysis Failed' },
                'PENDING_DOCTOR_REVIEW': { class: 'pending-review', text: 'Awaiting Doctor Review' },
                'DOCTOR_REVIEWING': { class: 'pending-review', text: 'Doctor Reviewing' },
                'REVIEWED': { class: 'reviewed', text: 'Reviewed' }
            };
            const status = statusMap[report.status] || { class: '', text: report.status };
            statusBadge.className = `status-badge ${status.class}`;
            statusBadge.textContent = status.text;

            // Files
            const filesGrid = document.getElementById('filesGrid');
            filesGrid.innerHTML = report.files.map(file => `
                <div class="file-card" data-file-url="${file.url}">
                    <i class="fas ${file.mimeType === 'application/pdf' ? 'fa-file-pdf' : 'fa-file-image'}"></i>
                    <div class="file-name">${file.originalName}</div>
                    <div class="file-size">${(file.size / 1024 / 1024).toFixed(2)} MB</div>
                </div>
            `).join('');

            // AI Analysis
            renderAIAnalysis(report);

            // Doctor Review
            renderDoctorReview(report);
        }

        function renderAIAnalysis(report) {
            const card = document.getElementById('aiAnalysisCard');
            const content = document.getElementById('aiAnalysisContent');
            const confidence = document.getElementById('aiConfidence');

            if (!report.aiAnalysis || report.aiAnalysis.status === 'PENDING') {
                card.style.display = report.status === 'UPLOADED' || report.status === 'AI_ANALYZING' ? 'block' : 'none';
                content.innerHTML = `
                    <div style="text-align: center; padding: 2rem;">
                        <i class="fas fa-spinner fa-spin" style="font-size: 2rem; color: var(--primary); margin-bottom: 1rem;"></i>
                        <h4>AI Analysis in Progress</h4>
                        <p style="color: var(--text-light);">Please wait while our AI analyzes your report...</p>
                    </div>
                `;
                return;
            }

            if (report.aiAnalysis.status === 'FAILED') {
                const isRetryable = report.aiAnalysis.error?.retryable !== false;
                const isNotConfigured = report.aiAnalysis.error?.code === 'AI_NOT_CONFIGURED';

                content.innerHTML = `
                    <div style="text-align: center; padding: 2rem;">
                        <i class="fas fa-exclamation-triangle" style="font-size: 2rem; color: var(--danger); margin-bottom: 1rem;"></i>
                        <h4>Analysis ${isNotConfigured ? 'Unavailable' : 'Failed'}</h4>
                        <p style="color: var(--text-light); margin-bottom: 1rem;">${report.aiAnalysis.error?.message || 'An error occurred during analysis'}</p>
                        <div style="display: flex; gap: 1rem; justify-content: center; flex-wrap: wrap;">
                            ${isRetryable ? `
                                <button class="btn btn-primary" data-action="retry-analysis">
                                    <i class="fas fa-redo"></i> Retry Analysis
                                </button>
                            ` : ''}
                            <button class="btn btn-secondary" data-action="open-review-modal">
                                <i class="fas fa-user-md"></i> Request Doctor Review
                            </button>
                        </div>
                    </div>
                `;
                return;
            }

            // Show confidence score
            if (report.aiAnalysis.confidenceScore) {
                confidence.innerHTML = `<i class="fas fa-chart-pie"></i> ${report.aiAnalysis.confidenceScore}% confidence`;
            }

            let html = '';

            // Summary
            if (report.aiAnalysis.summary) {
                html += `
                    <div class="ai-summary">
                        <h4><i class="fas fa-lightbulb"></i> Summary</h4>
                        <p>${report.aiAnalysis.summary}</p>
                    </div>
                `;
            }

            // Key Observations
            if (report.aiAnalysis.keyObservations?.length > 0) {
                html += `
                    <h4 style="margin-bottom: 1rem;"><i class="fas fa-eye"></i> Key Observations</h4>
                    <ul style="margin-bottom: 1.5rem; padding-left: 1.5rem;">
                        ${report.aiAnalysis.keyObservations.map(obs => `<li style="margin-bottom: 0.5rem;">${obs}</li>`).join('')}
                    </ul>
                `;
            }

            // Findings Table
            if (report.aiAnalysis.extractedData?.findings?.length > 0) {
                html += `
                    <h4 style="margin-bottom: 1rem;"><i class="fas fa-list"></i> Test Results</h4>
                    <div style="overflow-x: auto;">
                        <table class="findings-table">
                            <thead>
                                <tr>
                                    <th>Parameter</th>
                                    <th>Value</th>
                                    <th>Normal Range</th>
                                    <th>Status</th>
                                </tr>
                            </thead>
                            <tbody>
                                ${report.aiAnalysis.extractedData.findings.map(f => `
                                    <tr>
                                        <td><strong>${f.parameter}</strong></td>
                                        <td>${f.value} ${f.unit || ''}</td>
                                        <td>${f.normalRange || '-'}</td>
                                        <td>
                                            <span class="value-status ${getStatusClass(f.status)}">
                                                <i class="fas fa-${getStatusIcon(f.status)}"></i>
                                                ${f.status || 'N/A'}
                                            </span>
                                        </td>
                                    </tr>
                                `).join('')}
                            </tbody>
                        </table>
                    </div>
                `;
            }

            // Concerns
            if (report.aiAnalysis.concerns?.length > 0) {
                html += `
                    <h4 style="margin: 1.5rem 0 1rem;"><i class="fas fa-exclamation-triangle"></i> Areas of Concern</h4>
                    <ul class="concerns-list">
                        ${report.aiAnalysis.concerns.map(c => `
                            <li class="concern-item ${c.severity?.toLowerCase()}">
                                <div class="concern-icon">
                                    <i class="fas fa-${c.severity === 'CRITICAL' ? 'times-circle' : c.severity === 'HIGH' ? 'exclamation-circle' : 'info-circle'}"
                                       style="color: ${c.severity === 'CRITICAL' ? '#8b0000' : c.severity === 'HIGH' ? 'var(--danger)' : 'var(--warning)'}"></i>
                                </div>
                                <div class="concern-content">
                                    <h5>${c.description}</h5>
                                    <p><strong>Recommendation:</strong> ${c.recommendation || 'Consult with your doctor'}</p>
                                </div>
                            </li>
                        `).join('')}
                    </ul>
                `;
            }

            content.innerHTML = html || '<p style="color: var(--text-light);">No detailed analysis available.</p>';
        }

        function renderDoctorReview(report) {
            const card = document.getElementById('doctorReviewCard');
            const content = document.getElementById('doctorReviewContent');
            const dateEl = document.getElementById('reviewDate');

            // Show request review section if not reviewed yet
            if (!report.doctorReview || report.doctorReview.status === 'PENDING' || !report.doctorReview.assignedTo) {
                if (report.status === 'AI_ANALYZED' || report.status === 'AI_FAILED') {
                    content.innerHTML = `
                        <div class="request-review-section">
                            <i class="fas fa-user-md" style="font-size: 3rem; color: var(--primary); margin-bottom: 1rem;"></i>
                            <h4>Get Expert Review</h4>
                            <p>Have a specialist doctor review your report and provide professional insights.</p>
                            <div class="review-options">
                                <button class="btn btn-primary" data-action="open-review-modal">
                                    <i class="fas fa-paper-plane"></i> Request Doctor Review
                                </button>
                            </div>
                        </div>
                    `;
                } else if (report.status === 'PENDING_DOCTOR_REVIEW') {
                    content.innerHTML = `
                        <div style="text-align: center; padding: 2rem;">
                            <i class="fas fa-clock" style="font-size: 2rem; color: var(--warning); margin-bottom: 1rem;"></i>
                            <h4>Awaiting Doctor Review</h4>
                            <p style="color: var(--text-light);">Your report is in the queue for review. You'll be notified when complete.</p>
                        </div>
                    `;
                } else {
                    card.style.display = 'none';
                }
                return;
            }

            // Doctor info
            const review = report.doctorReview;
            const doctor = review.assignedTo;

            if (review.completedAt) {
                dateEl.innerHTML = `<i class="fas fa-calendar-check"></i> ${new Date(review.completedAt).toLocaleDateString()}`;
            }

            let html = '';

            // Doctor Info
            if (doctor) {
                html += `
                    <div class="doctor-info">
                        <div class="doctor-avatar">
                            ${doctor.profilePhoto ? `<img src="${doctor.profilePhoto}" alt="${doctor.name}" style="width:100%;height:100%;border-radius:50%;object-fit:cover;">` : `<i class="fas fa-user-md"></i>`}
                        </div>
                        <div class="doctor-details">
                            <h4>Dr. ${doctor.name}</h4>
                            <p>${doctor.specialization || 'Specialist'}</p>
                        </div>
                    </div>
                `;
            }

            // Interpretation
            if (review.interpretation) {
                html += `
                    <div class="review-section">
                        <h4><i class="fas fa-stethoscope"></i> Doctor's Interpretation</h4>
                        <p>${review.interpretation}</p>
                    </div>
                `;
            }

            // Findings
            if (review.findings?.length > 0) {
                html += `
                    <div class="review-section">
                        <h4><i class="fas fa-clipboard-list"></i> Clinical Findings</h4>
                        ${review.findings.map(f => `
                            <div style="padding: 0.75rem; background: var(--bg-light); border-radius: 8px; margin-bottom: 0.5rem; border-left: 4px solid ${getSignificanceColor(f.significance)};">
                                <strong>${f.category || 'Finding'}:</strong> ${f.observation}
                            </div>
                        `).join('')}
                    </div>
                `;
            }

            // Recommendations
            if (review.recommendations?.length > 0) {
                html += `
                    <div class="review-section">
                        <h4><i class="fas fa-tasks"></i> Recommendations</h4>
                        <ul class="recommendations-list">
                            ${review.recommendations.map(r => `
                                <li><i class="fas fa-check-circle"></i> ${r}</li>
                            `).join('')}
                        </ul>
                    </div>
                `;
            }

            // Notes for patient
            if (review.patientNotes) {
                html += `
                    <div class="review-section">
                        <h4><i class="fas fa-comment-medical"></i> Notes for You</h4>
                        <p>${review.patientNotes}</p>
                    </div>
                `;
            }

            // Follow-up
            if (review.followUpRequired) {
                html += `
                    <div class="followup-alert">
                        <i class="fas fa-calendar-alt"></i>
                        <div>
                            <strong>Follow-up Required</strong>
                            <p style="margin: 0; font-size: 0.9rem;">${review.followUpNotes || 'Please schedule a follow-up appointment.'}</p>
                            ${review.followUpDate ? `<small>Recommended by: ${new Date(review.followUpDate).toLocaleDateString()}</small>` : ''}
                        </div>
                    </div>
                `;
            }

            // Questions Section
            html += renderQuestionsSection(report);

            // Acknowledge button if not acknowledged
            if (!report.patientAcknowledged && review.status === 'COMPLETED') {
                html += `
                    <div style="text-align: center; margin-top: 2rem;">
                        <button class="btn btn-success" data-action="acknowledge-report">
                            <i class="fas fa-check"></i> I've Read This Review
                        </button>
                    </div>
                `;
            }

            content.innerHTML = html;
        }

        function renderQuestionsSection(report) {
            let html = `
                <div class="questions-section">
                    <h4><i class="fas fa-question-circle"></i> Questions & Answers</h4>
            `;

            if (report.patientQuestions?.length > 0) {
                html += report.patientQuestions.map(q => `
                    <div class="question-item">
                        <div class="question"><i class="fas fa-user"></i> ${q.question}</div>
                        ${q.answer ? `
                            <div class="answer"><i class="fas fa-user-md"></i> ${q.answer}</div>
                            <div class="meta">Answered on ${new Date(q.answeredAt).toLocaleDateString()}</div>
                        ` : `
                            <div style="color: var(--text-light); font-style: italic;">Awaiting response...</div>
                        `}
                    </div>
                `).join('');
            } else {
                html += `<p style="color: var(--text-light);">No questions asked yet.</p>`;
            }

            html += `
                <button class="btn btn-outline" data-action="open-question-modal" style="margin-top: 1rem;">
                    <i class="fas fa-plus"></i> Ask a Question
                </button>
            </div>
            `;

            return html;
        }

        function getStatusClass(status) {
            const map = { 'NORMAL': 'normal', 'LOW': 'low', 'HIGH': 'high', 'CRITICAL_LOW': 'critical', 'CRITICAL_HIGH': 'critical' };
            return map[status] || '';
        }

        function getStatusIcon(status) {
            const map = { 'NORMAL': 'check', 'LOW': 'arrow-down', 'HIGH': 'arrow-up', 'CRITICAL_LOW': 'exclamation', 'CRITICAL_HIGH': 'exclamation' };
            return map[status] || 'minus';
        }

        function getSignificanceColor(sig) {
            const map = { 'NORMAL': 'var(--success)', 'MONITOR': 'var(--info)', 'CONCERN': 'var(--warning)', 'URGENT': 'var(--danger)' };
            return map[sig] || 'var(--border-color)';
        }

        // Modals
        function openReviewModal() {
            document.getElementById('reviewModal').classList.add('active');
        }

        function closeReviewModal() {
            document.getElementById('reviewModal').classList.remove('active');
        }

        function openQuestionModal() {
            document.getElementById('questionModal').classList.add('active');
        }

        function closeQuestionModal() {
            document.getElementById('questionModal').classList.remove('active');
            document.getElementById('questionText').value = '';
        }

        function toggleDoctorSelection() {
            const type = document.getElementById('assignmentType').value;
            document.getElementById('specializationGroup').style.display = type === 'AUTO_QUEUE' ? 'block' : 'none';
            document.getElementById('doctorGroup').style.display = type === 'PATIENT_CHOICE' ? 'block' : 'none';

            if (type === 'PATIENT_CHOICE') {
                loadDoctors();
            }
        }

        async function loadSpecializations() {
            try {
                const result = await apiCall('/patient-analytics/specializations');
                if (result?.success) {
                    const select = document.getElementById('specialization');
                    select.innerHTML = '<option value="">Select Specialization</option>' +
                        result.specializations.map(s => `<option value="${s}">${s}</option>`).join('');
                }
            } catch (e) { console.error(e); }
        }

        async function loadDoctors(specialization = '') {
            try {
                const result = await apiCall(`/patient-analytics/available-doctors?specialization=${specialization}`);
                if (result?.success) {
                    const select = document.getElementById('doctorSelect');
                    select.innerHTML = '<option value="">Select Doctor</option>' +
                        result.doctors.map(d => `<option value="${d._id}">Dr. ${d.name} - ${d.specialization || 'General'}</option>`).join('');
                }
            } catch (e) { console.error(e); }
        }

        async function submitReviewRequest() {
            const btn = document.getElementById('submitReviewBtn');
            const type = document.getElementById('assignmentType').value;

            let body = { assignmentType: type };

            if (type === 'AUTO_QUEUE') {
                body.specialization = document.getElementById('specialization').value;
                if (!body.specialization) {
                    showToast('Please select a specialization', 'error');
                    return;
                }
            } else {
                body.doctorId = document.getElementById('doctorSelect').value;
                if (!body.doctorId) {
                    showToast('Please select a doctor', 'error');
                    return;
                }
            }

            btn.disabled = true;
            btn.innerHTML = '<i class="fas fa-spinner fa-spin"></i> Submitting...';

            try {
                const result = await apiCall(`/patient-analytics/reports/${reportId}/request-review`, {
                    method: 'POST',
                    body: JSON.stringify(body)
                });

                if (result?.success) {
                    showToast('Review requested successfully!', 'success');
                    closeReviewModal();
                    loadReport();
                } else {
                    showToast(result?.message || 'Failed to request review', 'error');
                }
            } catch (e) {
                showToast('Failed to request review', 'error');
            } finally {
                btn.disabled = false;
                btn.innerHTML = '<i class="fas fa-paper-plane"></i> Request Review';
            }
        }

        async function submitQuestion() {
            const btn = document.getElementById('submitQuestionBtn');
            const question = document.getElementById('questionText').value.trim();

            if (!question) {
                showToast('Please enter a question', 'error');
                return;
            }

            btn.disabled = true;
            btn.innerHTML = '<i class="fas fa-spinner fa-spin"></i> Submitting...';

            try {
                const result = await apiCall(`/patient-analytics/reports/${reportId}/questions`, {
                    method: 'POST',
                    body: JSON.stringify({ question })
                });

                if (result?.success) {
                    showToast('Question submitted!', 'success');
                    closeQuestionModal();
                    loadReport();
                } else {
                    showToast(result?.message || 'Failed to submit question', 'error');
                }
            } catch (e) {
                showToast('Failed to submit question', 'error');
            } finally {
                btn.disabled = false;
                btn.innerHTML = '<i class="fas fa-paper-plane"></i> Submit Question';
            }
        }

        async function acknowledgeReport() {
            try {
                const result = await apiCall(`/patient-analytics/reports/${reportId}/acknowledge`, { method: 'POST' });
                if (result?.success) {
                    showToast('Report acknowledged', 'success');
                    loadReport();
                }
            } catch (e) {
                showToast('Failed to acknowledge', 'error');
            }
        }

        async function retryAnalysis() {
            try {
                const result = await apiCall(`/patient-analytics/reports/${reportId}/retry-analysis`, { method: 'POST' });
                if (result?.success) {
                    showToast('Analysis restarted', 'success');
                    loadReport();
                }
            } catch (e) {
                showToast('Failed to retry', 'error');
            }
        }

        function confirmDelete() {
            if (confirm('Are you sure you want to delete this report? This action cannot be undone.')) {
                deleteReport();
            }
        }

        async function deleteReport() {
            try {
                const result = await apiCall(`/patient-analytics/reports/${reportId}`, { method: 'DELETE' });
                if (result?.success) {
                    showToast('Report deleted', 'success');
                    setTimeout(() => window.location.href = AppConfig.routes.page('patient.analytics'), 1500);
                }
            } catch (e) {
                showToast('Failed to delete', 'error');
            }
        }

        function bindUiEvents() {
            document.getElementById('logoutBtn')?.addEventListener('click', logout);
            document.getElementById('printBtn')?.addEventListener('click', function() {
                window.print();
            });
            document.getElementById('deleteReportBtn')?.addEventListener('click', confirmDelete);
            document.getElementById('closeReviewModalBtn')?.addEventListener('click', closeReviewModal);
            document.getElementById('cancelReviewBtn')?.addEventListener('click', closeReviewModal);
            document.getElementById('submitReviewBtn')?.addEventListener('click', submitReviewRequest);
            document.getElementById('closeQuestionModalBtn')?.addEventListener('click', closeQuestionModal);
            document.getElementById('cancelQuestionBtn')?.addEventListener('click', closeQuestionModal);
            document.getElementById('submitQuestionBtn')?.addEventListener('click', submitQuestion);
            document.getElementById('assignmentType')?.addEventListener('change', toggleDoctorSelection);

            document.getElementById('reportContent')?.addEventListener('click', function(event) {
                const fileCard = event.target.closest('.file-card[data-file-url]');
                if (fileCard) {
                    window.open(fileCard.dataset.fileUrl, '_blank');
                    return;
                }

                const actionElement = event.target.closest('[data-action]');
                if (!actionElement) {
                    return;
                }

                const action = actionElement.dataset.action;
                if (action === 'retry-analysis') {
                    retryAnalysis();
                } else if (action === 'open-review-modal') {
                    openReviewModal();
                } else if (action === 'acknowledge-report') {
                    acknowledgeReport();
                } else if (action === 'open-question-modal') {
                    openQuestionModal();
                }
            });
        }

        bindUiEvents();
