(function initOperatorAudit(window, document) {
    'use strict';

    var currentPage = 1;
    var currentEvents = [];
    var currentPagination = { page: 1, pages: 1, total: 0, limit: 50 };
    var currentExportJobs = [];
    var currentQuota;
    var currentApprovalQueue = false;
    var pendingQuarantineAction = null;

    function requireOperatorAuth() {
        return AdminSession.requireAuthenticatedPage({
            redirectUrl: AppConfig.routes.page('home')
        });
    }

    function setMessage(text) {
        var message = document.getElementById('operatorAuditMessage');
        if (message) message.textContent = text || '';
    }

    function valueOf(id) {
        var element = document.getElementById(id);
        return element ? element.value.trim() : '';
    }

    function checked(id) {
        var element = document.getElementById(id);
        return !!(element && element.checked);
    }

    function queryFor(page) {
        var query = {
            page: page,
            limit: valueOf('auditLimit') || '50'
        };
        var event = valueOf('auditEvent');
        var outcome = valueOf('auditOutcome');
        var actorId = valueOf('auditActorId');
        var targetId = valueOf('auditTargetId');
        if (event) query.event = event;
        if (outcome) query.outcome = outcome;
        if (actorId) query.actorId = actorId;
        if (targetId) query.targetId = targetId;
        return query;
    }

    function exportQuery() {
        var query = queryFor(1);
        delete query.page;
        return query;
    }

    function appendCell(row, text) {
        var cell = document.createElement('td');
        cell.textContent = text || '-';
        row.appendChild(cell);
    }

    function appendNodeCell(row, node) {
        var cell = document.createElement('td');
        if (node) cell.appendChild(node);
        else cell.textContent = '-';
        row.appendChild(cell);
    }

    function quarantineSlaBadge(job) {
        var badge = document.createElement('span');
        if (job.status !== 'quarantined') {
            badge.textContent = '-';
            return badge;
        }
        var age = Number(job.quarantineAgeHours || 0);
        var maxAge = Number(job.quarantineMaxAgeHours || 0);
        var label = 'Age ' + AppFormat.decimal(age, 1) + 'h';
        if (job.quarantineOverSla) label += ' | SLA breached';
        if (maxAge) label += ' | max ' + maxAge + 'h';
        badge.textContent = label;
        badge.className = job.quarantineOverSla ? 'status-danger' : 'status-warning';
        return badge;
    }

    function renderEvents(events) {
        var list = document.getElementById('operatorAuditList');
        list.textContent = '';

        if (!events || events.length === 0) {
            list.textContent = 'No matching security audit events.';
            return;
        }

        var table = document.createElement('table');
        table.className = 'audit-table';
        var header = document.createElement('tr');
        ['Time', 'Event', 'Actor', 'Target', 'Outcome', 'IP', 'Details'].forEach(function (label) {
            var th = document.createElement('th');
            th.textContent = label;
            header.appendChild(th);
        });
        table.appendChild(header);

        events.forEach(function (event) {
            var row = document.createElement('tr');
            appendCell(row, event.createdAt ? new Date(event.createdAt).toLocaleString() : '-');
            appendCell(row, event.event);
            appendCell(row, (event.actorType || '-') + ':' + (event.actorId || '-'));
            appendCell(row, (event.targetType || '-') + ':' + (event.targetId || '-'));
            appendCell(row, event.outcome);
            appendCell(row, event.ipAddress);
            appendCell(row, JSON.stringify(event.metadata || {}));
            table.appendChild(row);
        });

        list.appendChild(table);
    }

    function renderPagination(pagination) {
        var summary = document.getElementById('operatorAuditSummary');
        var pageLabel = document.getElementById('operatorAuditPage');
        var prev = document.getElementById('operatorAuditPrev');
        var next = document.getElementById('operatorAuditNext');
        var page = pagination.page || 1;
        var pages = Math.max(pagination.pages || 1, 1);

        summary.textContent = 'Showing page ' + page + ' of ' + pages + ' for ' + (pagination.total || 0) + ' matching events.';
        pageLabel.textContent = 'Page ' + page + ' / ' + pages;
        prev.disabled = page <= 1;
        next.disabled = page >= pages;
    }

    function renderExportJobs(jobs) {
        var container = document.getElementById('operatorAuditExportJobs');
        container.textContent = '';

        if (!jobs || jobs.length === 0) {
            container.textContent = 'No CSV export jobs yet.';
            return;
        }

        var table = document.createElement('table');
        table.className = 'audit-table';
        var header = document.createElement('tr');
        ['Created', 'Status', 'Progress', 'Rows', 'Storage', 'Encryption', 'Quarantine SLA', 'Expires', 'Actions'].forEach(function (label) {
            var th = document.createElement('th');
            th.textContent = label;
            header.appendChild(th);
        });
        table.appendChild(header);

        jobs.forEach(function (job) {
            var row = document.createElement('tr');
            appendCell(row, job.createdAt ? new Date(job.createdAt).toLocaleString() : '-');
            appendCell(row, job.status);
            appendCell(row, String(job.progressPercent || 0) + '%');
            appendCell(row, String(job.rowCount || 0) + ' / ' + String(job.estimatedRows || '?'));
            appendCell(row, job.storageProvider || 'local');
            appendCell(row, job.encryptionMode || '-');
            appendNodeCell(row, quarantineSlaBadge(job));
            appendCell(row, job.expiresAt ? new Date(job.expiresAt).toLocaleString() : '-');

            var actionCell = document.createElement('td');
            if (job.status === 'completed') {
                var download = document.createElement('a');
                download.href = AppConfig.api(AppConfig.endpoint('adminSecurityAudit.webauthnExportDownload', {
                    params: { jobId: job.id }
                }));
                download.textContent = 'Download';
                download.rel = 'noopener';
                actionCell.appendChild(download);
            }
            var detail = document.createElement('button');
            detail.type = 'button';
            detail.className = 'save-btn';
            detail.textContent = 'Details';
            detail.addEventListener('click', function () {
                loadExportAuditEvents(job.id).catch(function (error) {
                    setMessage(error.message || 'Export lifecycle could not be loaded.');
                });
            });
            actionCell.appendChild(detail);
            if (job.status === 'pending' || job.status === 'running') {
                var cancel = document.createElement('button');
                cancel.type = 'button';
                cancel.className = 'save-btn';
                cancel.textContent = 'Cancel';
                cancel.addEventListener('click', function () {
                    cancelExportJob(job.id).catch(function (error) {
                        setMessage(error.message || 'Export job could not be cancelled.');
                    });
                });
                actionCell.appendChild(cancel);
            }
            if (job.retryAllowed) {
                var retry = document.createElement('button');
                retry.type = 'button';
                retry.className = 'save-btn';
                retry.textContent = 'Retry';
                retry.addEventListener('click', function () {
                    retryExportJob(job.id).catch(function (error) {
                        setMessage(error.message || 'Export job could not be retried.');
                    });
                });
                actionCell.appendChild(retry);
            }
            if (job.status === 'quarantined') {
                if (currentApprovalQueue) {
                    var approveRelease = document.createElement('button');
                    approveRelease.type = 'button';
                    approveRelease.className = 'save-btn';
                    approveRelease.textContent = 'Approve Release';
                    approveRelease.addEventListener('click', function () {
                        openQuarantineActionModal(job.id, 'approve_release');
                    });
                    actionCell.appendChild(approveRelease);
                } else if (job.quarantineInvestigation && job.quarantineInvestigation.releaseRequestedBy) {
                    var pending = document.createElement('span');
                    pending.textContent = 'Release requested';
                    actionCell.appendChild(pending);
                } else {
                    var release = document.createElement('button');
                    release.type = 'button';
                    release.className = 'save-btn';
                    release.textContent = 'Request Release';
                    release.addEventListener('click', function () {
                        openQuarantineActionModal(job.id, 'release');
                    });
                    actionCell.appendChild(release);
                }

                var deleteButton = document.createElement('button');
                deleteButton.type = 'button';
                deleteButton.className = 'save-btn';
                deleteButton.textContent = 'Delete';
                deleteButton.addEventListener('click', function () {
                    openQuarantineActionModal(job.id, 'delete');
                });
                actionCell.appendChild(deleteButton);
            }
            if (!actionCell.hasChildNodes()) {
                actionCell.textContent = '-';
            }
            row.appendChild(actionCell);
            table.appendChild(row);
        });

        container.appendChild(table);
    }

    function openQuarantineActionModal(jobId, action) {
        var modal = document.getElementById('quarantineActionModal');
        var title = document.getElementById('quarantineActionTitle');
        var message = document.getElementById('quarantineActionMessage');
        var note = document.getElementById('quarantineInvestigationNote');
        pendingQuarantineAction = { jobId: jobId, action: action };
        if (action === 'approve_release') {
            title.textContent = 'Approve Quarantined Export Release';
            message.textContent = 'Confirm you are a second operator approving this export for download.';
        } else if (action === 'release') {
            title.textContent = 'Request Quarantined Export Release';
            message.textContent = 'Request second-operator approval for this export to become downloadable.';
        } else if (action === 'bulk_delete_stale') {
            title.textContent = 'Bulk Delete Stale Quarantined Exports';
            message.textContent = 'Delete all of your unreleased quarantined exports older than the investigation SLA. Job history is retained.';
        } else if (action === 'bulk_delete_stale_dry_run') {
            title.textContent = 'Dry Run Stale Quarantined Export Deletion';
            message.textContent = 'Preview unreleased quarantined exports older than the investigation SLA. No jobs or files will be changed.';
        } else {
            title.textContent = 'Delete Quarantined Export';
            message.textContent = 'Confirm that investigation determined this export must be deleted.';
        }
        note.value = '';
        modal.hidden = false;
        note.focus();
    }

    function closeQuarantineActionModal() {
        var modal = document.getElementById('quarantineActionModal');
        var note = document.getElementById('quarantineInvestigationNote');
        pendingQuarantineAction = null;
        if (note) note.value = '';
        if (modal) modal.hidden = true;
    }

    function renderQuotaUsage(quota) {
        var container = document.getElementById('operatorAuditQuota');
        if (!container) return;
        container.textContent = '';
        if (!quota) {
            container.textContent = 'Export quota usage unavailable.';
            return;
        }

        var active = quota.active || {};
        var daily = quota.daily || {};
        var text = document.createElement('p');
        text.textContent = 'Quota usage: active exports '
            + String(active.used || 0) + ' / ' + String(active.limit || 0)
            + ' (' + String(active.remaining || 0) + ' remaining)'
            + ' | daily exports '
            + String(daily.used || 0) + ' / ' + String(daily.limit || 0)
            + ' (' + String(daily.remaining || 0) + ' remaining)'
            + (daily.resetsAt ? ' | daily reset: ' + new Date(daily.resetsAt).toLocaleString() : '');
        container.appendChild(text);
    }

    function renderRetentionSummary(retention) {
        var container = document.getElementById('operatorAuditRetentionSummary');
        if (!container) return;
        container.textContent = '';
        if (!retention || !retention.statuses) {
            container.textContent = 'Retention summary unavailable.';
            return;
        }

        var heading = document.createElement('h3');
        heading.textContent = 'Retention Policy Summary';
        container.appendChild(heading);

        var table = document.createElement('table');
        table.className = 'audit-table';
        var header = document.createElement('tr');
        ['Status', '<1h', '1h-24h', '1d-7d', '>7d'].forEach(function (label) {
            var th = document.createElement('th');
            th.textContent = label;
            header.appendChild(th);
        });
        table.appendChild(header);

        ['pending', 'quarantined', 'deleted'].forEach(function (status) {
            var row = document.createElement('tr');
            appendCell(row, status);
            (retention.statuses[status] || []).forEach(function (bucket) {
                appendCell(row, String(bucket.count || 0));
            });
            table.appendChild(row);
        });
        container.appendChild(table);
    }

    async function loadRetentionSummary() {
        var response = await AppConfig.fetchRoute('adminSecurityAudit.webauthnExportRetentionSummary', {
            parseJson: true
        });
        var data = NocturnalSession.expectJsonSuccess(response, 'Failed to load export retention summary');
        renderRetentionSummary(data.retention);
    }

    async function loadQuotaUsage() {
        var response = await AppConfig.fetchRoute('adminSecurityAudit.webauthnExportQuota', {
            parseJson: true
        });
        var data = NocturnalSession.expectJsonSuccess(response, 'Failed to load export quota');
        currentQuota = data.quota;
        renderQuotaUsage(currentQuota);
        return currentQuota;
    }

    async function loadExportJobs() {
        if (!requireOperatorAuth()) return;
        var query = { limit: 25 };
        var status = valueOf('exportStatusFilter');
        var storageProvider = valueOf('exportStorageFilter');
        currentApprovalQueue = checked('exportApprovalQueueFilter');
        if (status) query.status = status;
        if (storageProvider) query.storageProvider = storageProvider;
        if (checked('exportMissingInvestigationFilter')) query.missingInvestigationNote = 'true';
        if (currentApprovalQueue) query.approvalQueue = 'true';
        var response = await AppConfig.fetchRoute('adminSecurityAudit.webauthnExports', {
            parseJson: true
        }, { query: query });
        var data = NocturnalSession.expectJsonSuccess(response, 'Failed to load export jobs');
        currentExportJobs = data.exports || [];
        renderExportJobs(currentExportJobs);
        await loadQuotaUsage().catch(function () {
            renderQuotaUsage(currentQuota);
        });
        await loadRetentionSummary().catch(function () {});
    }

    function renderExportAuditEvents(exportJob, events) {
        var container = document.getElementById('operatorAuditExportDetail');
        container.textContent = '';

        var heading = document.createElement('h3');
        heading.textContent = 'Export Lifecycle: ' + exportJob.id;
        container.appendChild(heading);

        var summary = document.createElement('p');
        summary.textContent = 'Status: ' + exportJob.status
            + ' | Attempts: ' + String(exportJob.attemptCount || 0)
            + ' / ' + String(exportJob.maxRetryAttempts || '?')
            + ' | Retry allowed: ' + (exportJob.retryAllowed ? 'yes' : 'no');
        container.appendChild(summary);

        if (exportJob.quarantineInvestigation) {
            var investigation = document.createElement('p');
            var history = exportJob.quarantineInvestigation.history || [];
            var lastEntry = history.length ? history[history.length - 1] : null;
            investigation.textContent = 'Quarantine investigation: '
                + (exportJob.quarantineInvestigation.status || exportJob.quarantineInvestigation.resolution || '-')
                + ' | Last note: '
                + (lastEntry && lastEntry.note ? lastEntry.note : '-');
            container.appendChild(investigation);

            var historyHeading = document.createElement('h4');
            historyHeading.textContent = 'Approval History';
            container.appendChild(historyHeading);
            renderApprovalHistory(container, history);
        }

        var download = document.createElement('a');
        download.href = AppConfig.api(AppConfig.endpoint('adminSecurityAudit.webauthnExportAuditEventsCsv', {
            params: { jobId: exportJob.id }
        }));
        download.textContent = 'Download lifecycle CSV';
        download.rel = 'noopener';
        container.appendChild(download);

        if (exportJob.quarantineInvestigation) {
            var approvalHistoryDownload = document.createElement('a');
            approvalHistoryDownload.href = AppConfig.api(AppConfig.endpoint('adminSecurityAudit.webauthnExportQuarantineApprovalHistoryCsv', {
                params: { jobId: exportJob.id }
            }));
            approvalHistoryDownload.textContent = 'Download approval-history CSV';
            approvalHistoryDownload.rel = 'noopener';
            container.appendChild(document.createTextNode(' '));
            container.appendChild(approvalHistoryDownload);

            var approvalHistoryReportButton = document.createElement('button');
            approvalHistoryReportButton.type = 'button';
            approvalHistoryReportButton.className = 'save-btn';
            approvalHistoryReportButton.textContent = 'Prepare signed approval-history CSV';
            approvalHistoryReportButton.addEventListener('click', function () {
                createApprovalHistoryReport(exportJob.id).catch(function (error) {
                    setMessage(error.message || 'Signed approval-history report could not be created.');
                });
            });
            container.appendChild(approvalHistoryReportButton);
        }

        var reportButton = document.createElement('button');
        reportButton.type = 'button';
        reportButton.className = 'save-btn';
        reportButton.textContent = 'Prepare signed lifecycle CSV';
        reportButton.addEventListener('click', function () {
            createLifecycleReport(exportJob.id).catch(function (error) {
                setMessage(error.message || 'Signed lifecycle report could not be created.');
            });
        });
        container.appendChild(reportButton);

        if (!events || events.length === 0) {
            var empty = document.createElement('p');
            empty.textContent = 'No lifecycle audit events recorded for this export.';
            container.appendChild(empty);
            return;
        }

        var table = document.createElement('table');
        table.className = 'audit-table';
        var header = document.createElement('tr');
        ['Time', 'Event', 'Actor', 'Outcome', 'Details'].forEach(function (label) {
            var th = document.createElement('th');
            th.textContent = label;
            header.appendChild(th);
        });
        table.appendChild(header);

        events.forEach(function (event) {
            var row = document.createElement('tr');
            appendCell(row, event.createdAt ? new Date(event.createdAt).toLocaleString() : '-');
            appendCell(row, event.event);
            appendCell(row, (event.actorType || '-') + ':' + (event.actorId || '-'));
            appendCell(row, event.outcome);
            appendCell(row, JSON.stringify(event.metadata || {}));
            table.appendChild(row);
        });
        container.appendChild(table);
    }

    function renderApprovalHistory(container, history) {
        var table = document.createElement('table');
        table.className = 'audit-table';
        var header = document.createElement('tr');
        ['Time', 'Action', 'Actor', 'Note'].forEach(function (label) {
            var th = document.createElement('th');
            th.textContent = label;
            header.appendChild(th);
        });
        table.appendChild(header);

        if (!history || history.length === 0) {
            var empty = document.createElement('tr');
            var emptyCell = document.createElement('td');
            emptyCell.colSpan = 4;
            emptyCell.textContent = 'No quarantine approval history recorded.';
            empty.appendChild(emptyCell);
            table.appendChild(empty);
            container.appendChild(table);
            return;
        }

        history.forEach(function (entry) {
            var row = document.createElement('tr');
            appendCell(row, entry.createdAt ? new Date(entry.createdAt).toLocaleString() : '-');
            appendCell(row, entry.action || '-');
            appendCell(row, (entry.actorType || 'user') + ':' + (entry.actor || '-'));
            appendCell(row, entry.note || '-');
            table.appendChild(row);
        });
        container.appendChild(table);
    }

    async function loadExportAuditEvents(jobId) {
        var response = await AppConfig.fetchRoute('adminSecurityAudit.webauthnExportAuditEvents', {
            parseJson: true
        }, { params: { jobId: jobId }, query: { limit: 50 } });
        var data = NocturnalSession.expectJsonSuccess(response, 'Failed to load export lifecycle');
        renderExportAuditEvents(data.export, data.events || []);
    }

    async function loadAudit(page) {
        if (!requireOperatorAuth()) return;
        currentPage = page || 1;
        setMessage('Loading audit events...');

        try {
            var response = await AppConfig.fetchRoute('adminSecurityAudit.webauthn', {
                parseJson: true
            }, { query: queryFor(currentPage) });
            var data = NocturnalSession.expectJsonSuccess(response, 'Failed to load audit events');
            currentEvents = data.events || [];
            currentPagination = data.pagination || { page: currentPage, pages: 1, total: currentEvents.length };
            renderEvents(currentEvents);
            renderPagination(currentPagination);
            setMessage('');
        } catch (error) {
            currentEvents = [];
            renderEvents(currentEvents);
            setMessage(error.status === 403
                ? 'Operator audit requires platform operator access.'
                : (error.message || 'Audit events could not be loaded.'));
        }
    }

    async function pollExport(jobId) {
        for (var attempt = 0; attempt < 30; attempt += 1) {
            var response = await AppConfig.fetchRoute('adminSecurityAudit.webauthnExportJob', {
                parseJson: true
            }, { params: { jobId: jobId } });
            var data = NocturnalSession.expectJsonSuccess(response, 'Failed to check export status');
            var job = data.export;
            if (job.status === 'completed') return job;
            if (job.status === 'failed') throw new Error(job.error || 'Audit export failed');
            if (job.status === 'cancelled') throw new Error(job.error || 'Audit export cancelled');
            setMessage('Preparing CSV export... status: ' + job.status);
            await new Promise(function (resolve) { setTimeout(resolve, 1000); });
        }
        throw new Error('Audit export is still running. Try downloading again shortly.');
    }

    async function pollLifecycleReport(jobId, reportJobId) {
        for (var attempt = 0; attempt < 30; attempt += 1) {
            var response = await AppConfig.fetchRoute('adminSecurityAudit.webauthnExportAuditReportJob', {
                parseJson: true
            }, { params: { jobId: jobId, reportJobId: reportJobId } });
            var data = NocturnalSession.expectJsonSuccess(response, 'Failed to check lifecycle report status');
            var report = data.report;
            if (report.status === 'completed') return report;
            if (report.status === 'failed') throw new Error(report.error || 'Lifecycle report failed');
            setMessage('Preparing signed lifecycle CSV... status: ' + report.status);
            await new Promise(function (resolve) { setTimeout(resolve, 1000); });
        }
        throw new Error('Lifecycle report is still running. Try downloading again shortly.');
    }

    async function pollApprovalHistoryReport(jobId, reportJobId) {
        for (var attempt = 0; attempt < 30; attempt += 1) {
            var response = await AppConfig.fetchRoute('adminSecurityAudit.webauthnExportQuarantineApprovalHistoryReportJob', {
                parseJson: true
            }, { params: { jobId: jobId, reportJobId: reportJobId } });
            var data = NocturnalSession.expectJsonSuccess(response, 'Failed to check approval-history report status');
            var report = data.report;
            if (report.status === 'completed') return report;
            if (report.status === 'failed') throw new Error(report.error || 'Approval-history report failed');
            setMessage('Preparing signed approval-history CSV... status: ' + report.status);
            await new Promise(function (resolve) { setTimeout(resolve, 1000); });
        }
        throw new Error('Approval-history report is still running. Try downloading again shortly.');
    }

    async function exportCsv() {
        await loadQuotaUsage().catch(function () {
            currentQuota = null;
        });
        if (
            currentQuota
            && (
                (currentQuota.active && currentQuota.active.remaining <= 0)
                || (currentQuota.daily && currentQuota.daily.remaining <= 0)
            )
        ) {
            setMessage('Export quota is exhausted. Wait for active jobs to finish or for the daily window to reset.');
            return;
        }
        setMessage('Creating CSV export job...');
        var createResponse = await AppConfig.fetchRoute('adminSecurityAudit.webauthnExports', {
            method: 'POST',
            parseJson: true
        }, { query: exportQuery() });
        var createData = NocturnalSession.expectJsonSuccess(createResponse, 'Failed to create audit export');
        await loadExportJobs();
        var job = await pollExport(createData.export.id);
        await loadExportJobs();
        var link = document.createElement('a');
        link.href = AppConfig.api(AppConfig.endpoint('adminSecurityAudit.webauthnExportDownload', {
            params: { jobId: job.id }
        }));
        link.download = 'operator-security-audit.csv';
        link.click();
        setMessage('CSV export ready. Rows: ' + job.rowCount + '.');
    }

    async function createLifecycleReport(jobId) {
        setMessage('Creating signed lifecycle report job...');
        var response = await AppConfig.fetchRoute('adminSecurityAudit.webauthnExportAuditReport', {
            method: 'POST',
            parseJson: true
        }, { params: { jobId: jobId } });
        var data = NocturnalSession.expectJsonSuccess(response, 'Failed to create lifecycle report');
        var report = await pollLifecycleReport(jobId, data.report.id);
        var link = document.createElement('a');
        link.href = AppConfig.api(AppConfig.endpoint('adminSecurityAudit.webauthnExportAuditReportDownload', {
            params: { jobId: jobId, reportJobId: report.id }
        }));
        link.download = report.downloadFileName || 'security-audit-export-lifecycle.csv';
        link.click();
        setMessage('Signed lifecycle report ready. Rows: ' + String(report.rowCount || 0) + '.');
    }

    async function createApprovalHistoryReport(jobId) {
        setMessage('Creating signed approval-history report job...');
        var response = await AppConfig.fetchRoute('adminSecurityAudit.webauthnExportQuarantineApprovalHistoryReport', {
            method: 'POST',
            parseJson: true
        }, { params: { jobId: jobId } });
        var data = NocturnalSession.expectJsonSuccess(response, 'Failed to create approval-history report');
        var report = await pollApprovalHistoryReport(jobId, data.report.id);
        var link = document.createElement('a');
        link.href = AppConfig.api(AppConfig.endpoint('adminSecurityAudit.webauthnExportQuarantineApprovalHistoryReportDownload', {
            params: { jobId: jobId, reportJobId: report.id }
        }));
        link.download = report.downloadFileName || 'security-audit-export-quarantine-approval-history.csv';
        link.click();
        setMessage('Signed approval-history report ready. Rows: ' + String(report.rowCount || 0) + '.');
    }

    async function cancelExportJob(jobId) {
        var response = await AppConfig.fetchRoute('adminSecurityAudit.webauthnExportCancel', {
            method: 'POST',
            parseJson: true
        }, { params: { jobId: jobId } });
        NocturnalSession.expectJsonSuccess(response, 'Failed to cancel export job');
        await loadExportJobs();
        setMessage('CSV export job cancelled.');
    }

    async function retryExportJob(jobId) {
        var response = await AppConfig.fetchRoute('adminSecurityAudit.webauthnExportRetry', {
            method: 'POST',
            parseJson: true
        }, { params: { jobId: jobId } });
        NocturnalSession.expectJsonSuccess(response, 'Failed to retry export job');
        await loadExportJobs();
        setMessage('CSV export job retry started.');
    }

    async function releaseQuarantinedExport(jobId, investigationNote) {
        var response = await AppConfig.fetchRoute('adminSecurityAudit.webauthnExportQuarantineRelease', {
            method: 'POST',
            body: JSON.stringify({ investigationNote: investigationNote || '' }),
            parseJson: true
        }, { params: { jobId: jobId } });
        NocturnalSession.expectJsonSuccess(response, 'Failed to release quarantined export job');
        await loadExportJobs();
        setMessage('Quarantined export release requested. A second operator must approve before download is enabled.');
    }

    async function approveQuarantinedExportRelease(jobId, investigationNote) {
        var response = await AppConfig.fetchRoute('adminSecurityAudit.webauthnExportQuarantineReleaseApprove', {
            method: 'POST',
            body: JSON.stringify({ investigationNote: investigationNote || '' }),
            parseJson: true
        }, { params: { jobId: jobId } });
        NocturnalSession.expectJsonSuccess(response, 'Failed to approve quarantined export release');
        await loadExportJobs();
        setMessage('Quarantined export release approved.');
    }

    async function deleteQuarantinedExport(jobId, investigationNote) {
        var response = await AppConfig.fetchRoute('adminSecurityAudit.webauthnExportQuarantineDelete', {
            method: 'DELETE',
            body: JSON.stringify({ investigationNote: investigationNote || '' }),
            parseJson: true
        }, { params: { jobId: jobId } });
        NocturnalSession.expectJsonSuccess(response, 'Failed to delete quarantined export job');
        await loadExportJobs();
        setMessage('Quarantined export deleted.');
    }

    async function bulkDeleteStaleQuarantinedExports(investigationNote, dryRun) {
        var response = await AppConfig.fetchRoute('adminSecurityAudit.webauthnExportBulkDeleteStaleQuarantine', {
            method: 'POST',
            body: JSON.stringify({ investigationNote: investigationNote || '', dryRun: dryRun === true }),
            parseJson: true
        });
        var data = NocturnalSession.expectJsonSuccess(response, 'Failed to bulk delete stale quarantined exports');
        await loadExportJobs();
        if (data.dryRun) {
            setMessage('Dry run found ' + String(data.candidateCount || 0) + ' stale quarantined export jobs eligible for deletion.');
            return;
        }
        setMessage('Bulk deleted ' + String(data.deletedCount || 0) + ' stale quarantined export jobs.');
    }

    async function confirmQuarantineAction() {
        if (!pendingQuarantineAction) return;
        var note = valueOf('quarantineInvestigationNote');
        var action = pendingQuarantineAction.action;
        var jobId = pendingQuarantineAction.jobId;
        closeQuarantineActionModal();
        if (action === 'release') {
            await releaseQuarantinedExport(jobId, note);
            return;
        }
        if (action === 'approve_release') {
            await approveQuarantinedExportRelease(jobId, note);
            return;
        }
        if (action === 'bulk_delete_stale') {
            await bulkDeleteStaleQuarantinedExports(note, false);
            return;
        }
        if (action === 'bulk_delete_stale_dry_run') {
            await bulkDeleteStaleQuarantinedExports(note, true);
            return;
        }
        await deleteQuarantinedExport(jobId, note);
    }

    async function cleanupExportJobs() {
        var response = await AppConfig.fetchRoute('adminSecurityAudit.webauthnExportCleanup', {
            method: 'POST',
            parseJson: true
        });
        var data = NocturnalSession.expectJsonSuccess(response, 'Failed to cleanup export jobs');
        await loadExportJobs();
        setMessage('Cleaned up ' + String(data.deletedCount || 0) + ' expired/cancelled export jobs.');
    }

    document.addEventListener('DOMContentLoaded', function () {
        requireOperatorAuth();
        AdminSession.populateIdentity({
            nameElementId: 'userName',
            avatarElementId: 'userAvatar'
        });

        document.getElementById('logout-btn').addEventListener('click', function () {
            AdminSession.logout({ redirectUrl: AppConfig.routes.page('home') });
        });
        document.getElementById('operatorAuditFilters').addEventListener('submit', function (event) {
            event.preventDefault();
            loadAudit(1);
        });
        document.getElementById('operatorAuditPrev').addEventListener('click', function () {
            loadAudit(Math.max(currentPage - 1, 1));
        });
        document.getElementById('operatorAuditNext').addEventListener('click', function () {
            loadAudit(Math.min(currentPage + 1, currentPagination.pages || currentPage + 1));
        });
        document.getElementById('exportOperatorAuditCsv').addEventListener('click', function () {
            exportCsv().catch(function (error) {
                setMessage(error.message || 'Audit export could not be created.');
            });
        });
        document.getElementById('refreshOperatorAuditExports').addEventListener('click', function () {
            loadExportJobs().catch(function (error) {
                setMessage(error.message || 'Export jobs could not be loaded.');
            });
        });
        document.getElementById('cleanupOperatorAuditExports').addEventListener('click', function () {
            cleanupExportJobs().catch(function (error) {
                setMessage(error.message || 'Export jobs could not be cleaned up.');
            });
        });
        document.getElementById('dryRunBulkDeleteStaleQuarantinedExports').addEventListener('click', function () {
            openQuarantineActionModal(null, 'bulk_delete_stale_dry_run');
        });
        document.getElementById('bulkDeleteStaleQuarantinedExports').addEventListener('click', function () {
            openQuarantineActionModal(null, 'bulk_delete_stale');
        });
        document.getElementById('confirmQuarantineAction').addEventListener('click', function () {
            confirmQuarantineAction().catch(function (error) {
                closeQuarantineActionModal();
                setMessage(error.message || 'Quarantine action could not be completed.');
            });
        });
        document.getElementById('cancelQuarantineAction').addEventListener('click', closeQuarantineActionModal);
        document.getElementById('exportStatusFilter').addEventListener('change', function () {
            loadExportJobs().catch(function (error) {
                setMessage(error.message || 'Export jobs could not be loaded.');
            });
        });
        document.getElementById('exportStorageFilter').addEventListener('change', function () {
            loadExportJobs().catch(function (error) {
                setMessage(error.message || 'Export jobs could not be loaded.');
            });
        });
        document.getElementById('exportMissingInvestigationFilter').addEventListener('change', function () {
            loadExportJobs().catch(function (error) {
                setMessage(error.message || 'Export jobs could not be loaded.');
            });
        });
        document.getElementById('exportApprovalQueueFilter').addEventListener('change', function () {
            loadExportJobs().catch(function (error) {
                setMessage(error.message || 'Export jobs could not be loaded.');
            });
        });
        loadAudit(1);
        loadExportJobs().catch(function () {});
        loadQuotaUsage().catch(function () {});
        loadRetentionSummary().catch(function () {});
    });
})(window, document);
