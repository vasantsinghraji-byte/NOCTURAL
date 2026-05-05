/* global AppConfig, AdminSession, Chart */

const state = {
    leads: [],
    funnelChart: null
};

const getFilters = () => ({
    status: document.getElementById('statusFilter').value,
    facilityType: document.getElementById('facilityTypeFilter').value,
    city: document.getElementById('cityFilter').value.trim()
});

const renderError = (message) => {
    document.getElementById('error').textContent = message || '';
};

const appendText = (parent, tagName, text) => {
    const element = document.createElement(tagName);
    element.textContent = text || '';
    parent.appendChild(element);
    return element;
};

const renderSummary = (summary = {}) => {
    const container = document.getElementById('summary');
    container.textContent = '';

    ['new', 'contacted', 'qualified', 'closed'].forEach((status) => {
        const metric = document.createElement('div');
        metric.className = 'metric';
        appendText(metric, 'span', status);
        appendText(metric, 'strong', String(summary[status] || 0));
        container.appendChild(metric);
    });
};

const renderRows = (leads) => {
    const tbody = document.getElementById('waitlistRows');
    tbody.textContent = '';

    leads.forEach((lead) => {
        const row = document.createElement('tr');
        appendText(row.insertCell(), 'strong', lead.facilityName);
        row.cells[0].appendChild(document.createElement('br'));
        appendText(row.cells[0], 'span', lead.facilityType);

        appendText(row.insertCell(), 'strong', lead.contactName);
        row.cells[1].appendChild(document.createElement('br'));
        appendText(row.cells[1], 'span', lead.email);
        row.cells[1].appendChild(document.createElement('br'));
        appendText(row.cells[1], 'span', lead.phone);

        appendText(row.insertCell(), 'span', [lead.city, lead.state].filter(Boolean).join(', '));
        appendText(row.insertCell(), 'span', lead.expectedNeed || 'Not provided');

        const statusCell = row.insertCell();
        const select = document.createElement('select');
        ['new', 'contacted', 'qualified', 'closed'].forEach((status) => {
            const option = document.createElement('option');
            option.value = status;
            option.textContent = status;
            option.selected = lead.status === status;
            select.appendChild(option);
        });
        select.addEventListener('change', () => updateStatus(lead._id, select.value));
        statusCell.appendChild(select);

        tbody.appendChild(row);
    });
};

const renderFunnelTotals = (totals = {}) => {
    const container = document.getElementById('funnelTotals');
    container.textContent = '';

    Object.keys(totals).sort().forEach((eventName) => {
        const metric = document.createElement('div');
        metric.className = 'metric';
        appendText(metric, 'span', eventName);
        appendText(metric, 'strong', String(totals[eventName]));
        container.appendChild(metric);
    });

    if (Object.keys(totals).length === 0) {
        appendText(container, 'p', 'No funnel events recorded yet.');
    }
};

const renderFunnelChart = (rows = []) => {
    const canvas = document.getElementById('funnelDailyChart');
    if (!canvas || typeof Chart === 'undefined') {
        return;
    }

    const days = Array.from(new Set(rows.map((row) => row.day))).sort();
    const events = Array.from(new Set(rows.map((row) => row.event))).sort();
    const palette = ['#123c69', '#22c55e', '#f59e0b', '#ef4444', '#6366f1', '#14b8a6'];
    const datasets = events.map((eventName, index) => ({
        label: eventName,
        data: days.map((day) => {
            const row = rows.find((item) => item.day === day && item.event === eventName);
            return row ? row.count : 0;
        }),
        borderColor: palette[index % palette.length],
        backgroundColor: palette[index % palette.length],
        tension: 0.3
    }));

    if (state.funnelChart) {
        state.funnelChart.destroy();
    }

    state.funnelChart = new Chart(canvas, {
        type: 'line',
        data: {
            labels: days,
            datasets
        },
        options: {
            responsive: true,
            maintainAspectRatio: false,
            scales: {
                y: {
                    beginAtZero: true,
                    ticks: { precision: 0 }
                }
            }
        }
    });
};

const loadFunnelAnalytics = async () => {
    try {
        const data = await AppConfig.fetchRoute('adminFunnel.dailyAnalytics', {
            parseJson: true
        }, {
            query: { days: 30 }
        });

        renderFunnelTotals(data.totals || {});
        renderFunnelChart(data.rows || []);
    } catch (error) {
        renderError(error.message || 'Unable to load funnel analytics');
    }
};

const loadWaitlist = async () => {
    renderError('');
    try {
        const data = await AppConfig.fetchRoute('adminFunnel.waitlist', {
            parseJson: true
        }, {
            query: getFilters()
        });
        state.leads = data.leads || [];
        renderSummary(data.summary || {});
        renderRows(state.leads);
    } catch (error) {
        renderError(error.message || 'Unable to load waitlist');
    }
};

async function updateStatus(leadId, status) {
    try {
        await AppConfig.fetchRoute('adminFunnel.waitlistStatus', {
            method: 'PATCH',
            parseJson: true,
            body: JSON.stringify({ status })
        }, {
            params: { leadId }
        });
        await loadWaitlist();
    } catch (error) {
        renderError(error.message || 'Unable to update status');
    }
}

const exportWaitlist = () => {
    const endpoint = AppConfig.endpoint('adminFunnel.waitlistExport', { query: getFilters() });
    window.location.href = AppConfig.api(endpoint);
};

document.getElementById('filterBtn').addEventListener('click', loadWaitlist);
document.getElementById('exportBtn').addEventListener('click', exportWaitlist);
window.addEventListener('DOMContentLoaded', () => {
    const isAuthenticated = AdminSession.requireAuthenticatedPage({
        redirectUrl: AppConfig.routes.page('home')
    });

    if (!isAuthenticated) {
        return;
    }

    loadWaitlist();
    loadFunnelAnalytics();
});
