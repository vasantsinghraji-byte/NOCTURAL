(function initRateLimitDashboard(window, document) {
    'use strict';

    var requestChart;
    var blockRateChart;
    var auditExportFailureRatioChart;
    var approvalNotificationFailureRateChart;
    var approvalNotificationFailureRateHistory = [];
    var refreshInterval = 30;

    function setText(id, text) {
        var element = document.getElementById(id);
        if (element) element.textContent = text;
    }

    function appendCell(row, text) {
        var cell = document.createElement('td');
        cell.textContent = text === undefined || text === null ? '-' : String(text);
        row.appendChild(cell);
    }

    function appendStatusCell(row, blockRate) {
        var cell = document.createElement('td');
        var status = document.createElement('span');
        status.className = 'status-indicator ' + (
            blockRate > 0.2 ? 'status-danger' :
                blockRate > 0.1 ? 'status-warning' :
                    'status-normal'
        );
        cell.appendChild(status);
        row.appendChild(cell);
    }

    function replaceRows(tbody, rows, emptyMessage, colSpan) {
        var target = tbody;
        target.textContent = '';
        if (!rows || rows.length === 0) {
            var emptyRow = document.createElement('tr');
            var emptyCell = document.createElement('td');
            emptyCell.colSpan = colSpan;
            emptyCell.textContent = emptyMessage;
            emptyRow.appendChild(emptyCell);
            target.appendChild(emptyRow);
            return;
        }
        rows.forEach(function (row) {
            target.appendChild(row);
        });
    }

    function initCharts() {
        var requestCtx = document.getElementById('requestChart').getContext('2d');
        requestChart = new Chart(requestCtx, {
            type: 'pie',
            data: {
                labels: ['Successful', 'Blocked', 'Rate Limited'],
                datasets: [{
                    data: [0, 0, 0],
                    backgroundColor: ['#28a745', '#dc3545', '#ffc107']
                }]
            },
            options: {
                responsive: true,
                maintainAspectRatio: false
            }
        });

        var blockRateCtx = document.getElementById('blockRateChart').getContext('2d');
        blockRateChart = new Chart(blockRateCtx, {
            type: 'line',
            data: {
                labels: [],
                datasets: [{
                    label: 'Block Rate',
                    data: [],
                    borderColor: '#dc3545',
                    tension: 0.1
                }]
            },
            options: {
                responsive: true,
                maintainAspectRatio: false,
                scales: {
                    y: {
                        beginAtZero: true,
                        max: 1
                    }
                }
            }
        });

        var auditExportFailureRatioCtx = document.getElementById('auditExportFailureRatioChart').getContext('2d');
        auditExportFailureRatioChart = new Chart(auditExportFailureRatioCtx, {
            type: 'doughnut',
            data: {
                labels: ['Failed Attempts', 'Other Attempts'],
                datasets: [{
                    data: [0, 0],
                    backgroundColor: ['#dc3545', '#28a745']
                }]
            },
            options: {
                responsive: true,
                maintainAspectRatio: false
            }
        });

        var approvalNotificationFailureRateCtx = document.getElementById('approvalNotificationFailureRateChart').getContext('2d');
        approvalNotificationFailureRateChart = new Chart(approvalNotificationFailureRateCtx, {
            type: 'line',
            data: {
                labels: [],
                datasets: [{
                    label: 'Failure Rate',
                    data: [],
                    borderColor: '#dc3545',
                    tension: 0.1
                }]
            },
            options: {
                responsive: true,
                maintainAspectRatio: false,
                scales: {
                    y: {
                        beginAtZero: true,
                        max: 1
                    }
                }
            }
        });
    }

    function updateSystemStatus(data) {
        var statusIndicator = document.getElementById('systemStatus');
        var statusText = document.getElementById('systemStatusText');
        if (!statusIndicator || !statusText) return;

        if (data.metrics.auth.blockRate > 0.2) {
            statusIndicator.className = 'status-indicator status-danger';
            statusText.textContent = 'High Block Rate';
        } else if (data.blocked.length > 5) {
            statusIndicator.className = 'status-indicator status-warning';
            statusText.textContent = 'Multiple Blocks';
        } else {
            statusIndicator.className = 'status-indicator status-normal';
            statusText.textContent = 'Normal';
        }
    }

    function updateCharts(data) {
        requestChart.data.datasets[0].data = [
            data.metrics.api.total - data.metrics.api.blocked,
            data.metrics.api.blocked,
            data.metrics.auth.blocked
        ];
        requestChart.update();

        if (data.metrics.blockRateHistory) {
            blockRateChart.data.labels = data.metrics.blockRateHistory.map(function (item) { return item.time; });
            blockRateChart.data.datasets[0].data = data.metrics.blockRateHistory.map(function (item) { return item.rate; });
            blockRateChart.update();
        }
    }

    function renderRecoveryCodeIdentityRows(data) {
        var tbody = document.getElementById('recoveryCodeIdentityTypeTable');
        var rows = (data.metrics.recoveryCodeLimiterHitsByIdentityType || []).map(function (item) {
            var row = document.createElement('tr');
            appendCell(row, item.limiter);
            appendCell(row, item.identityType);
            appendCell(row, item.hits);
            return row;
        });
        replaceRows(tbody, rows, 'No recovery-code limiter hits', 3);
    }

    function renderEndpointRows(data) {
        var tbody = document.getElementById('endpointTable');
        var rows = (data.metrics.api.endpoints || [])
            .sort(function (left, right) { return right.hits - left.hits; })
            .slice(0, 10)
            .map(function (endpoint) {
                var row = document.createElement('tr');
                appendCell(row, endpoint.path);
                appendCell(row, endpoint.hits);
                appendCell(row, AppFormat.percent(endpoint.blockRate * 100, 1));
                appendStatusCell(row, endpoint.blockRate);
                return row;
            });
        replaceRows(tbody, rows, 'No endpoint metrics', 4);
    }

    function renderBlockedRows(data) {
        var tbody = document.getElementById('blockedTable');
        var rows = (data.blocked || []).map(function (entity) {
            var row = document.createElement('tr');
            appendCell(row, entity.id);
            appendCell(row, new Date(entity.until).toLocaleString());
            appendCell(row, entity.reason);
            return row;
        });
        replaceRows(tbody, rows, 'No blocked entities', 3);
    }

    function renderAuditExportMetrics(data) {
        var metrics = data.metrics.auditExports || {};
        setText('auditExportAverageDuration', String(metrics.averageDurationMs || 0));
        setText('auditExportBytes', String(metrics.bytesWritten || 0));
        setText('auditExportRetryBlocks', String((metrics.retryBlocked || 0) + (metrics.retryBackoffBlocked || 0)));
        setText('auditExportSignedDownloads', String(metrics.signedDownloads || 0));
        if (auditExportFailureRatioChart) {
            auditExportFailureRatioChart.data.datasets[0].data = [
                metrics.failed || 0,
                Math.max((metrics.attempts || 0) - (metrics.failed || 0), 0)
            ];
            auditExportFailureRatioChart.update();
        }

        if (approvalNotificationFailureRateChart) {
            var notificationAttempts = metrics.approvalNotifications || 0;
            var notificationFailures = metrics.approvalNotificationFailures || 0;
            var notificationFailureRate = notificationAttempts ? notificationFailures / notificationAttempts : 0;
            approvalNotificationFailureRateHistory.push({
                time: new Date().toLocaleTimeString(),
                rate: notificationFailureRate
            });
            if (approvalNotificationFailureRateHistory.length > 30) {
                approvalNotificationFailureRateHistory.shift();
            }
            approvalNotificationFailureRateChart.data.labels = approvalNotificationFailureRateHistory.map(function (item) {
                return item.time;
            });
            approvalNotificationFailureRateChart.data.datasets[0].data = approvalNotificationFailureRateHistory.map(function (item) {
                return item.rate;
            });
            approvalNotificationFailureRateChart.update();
        }

        var tbody = document.getElementById('auditExportLifecycleTable');
        var row = document.createElement('tr');
        [
            metrics.created,
            metrics.completed,
            metrics.failed,
            metrics.cancelled,
            metrics.deadLettered,
            metrics.retryStarted,
            metrics.autoRetryStarted,
            metrics.cleanupDeleted
        ].forEach(function (value) {
            appendCell(row, value || 0);
        });
        replaceRows(tbody, [row], 'No audit export metrics', 8);

        var notificationTbody = document.getElementById('auditExportApprovalNotificationTable');
        var notificationRow = document.createElement('tr');
        var attempts = metrics.approvalNotifications || 0;
        var failures = metrics.approvalNotificationFailures || 0;
        [
            attempts,
            metrics.approvalNotificationsSent || 0,
            failures,
            attempts ? AppFormat.percent((failures / attempts) * 100, 1) : '0.0%'
        ].forEach(function (value) {
            appendCell(notificationRow, value);
        });
        replaceRows(notificationTbody, [notificationRow], 'No approval notification metrics', 4);
    }

    async function fetchData() {
        try {
            var data = await AppConfig.fetchRoute('adminMetrics.rateLimits', { parseJson: true });

            setText('authBlockRate', AppFormat.percent(data.metrics.auth.blockRate * 100, 1));
            setText('apiTotal', data.metrics.api.total.toLocaleString());
            setText('blockedCount', data.blocked.length);
            updateSystemStatus(data);
            updateCharts(data);
            renderRecoveryCodeIdentityRows(data);
            renderAuditExportMetrics(data);
            renderEndpointRows(data);
            renderBlockedRows(data);
        } catch (error) {
            setText('systemStatusText', 'Metrics unavailable');
        }
    }

    function updateTimer() {
        setText('refreshTimer', refreshInterval);
        refreshInterval -= 1;
        if (refreshInterval < 0) {
            refreshInterval = 30;
            fetchData();
        }
    }

    document.addEventListener('DOMContentLoaded', function () {
        initCharts();
        fetchData();
        setInterval(updateTimer, 1000);
        document.getElementById('refreshRateLimitDashboard').addEventListener('click', fetchData);
    });
})(window, document);
