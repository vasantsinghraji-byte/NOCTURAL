ProviderSession.requireAuthenticatedPage({
    redirectUrl: AppConfig.routes.page('provider.login')
});
var allBookings = [];
var currentStatus = 'ASSIGNED';

ProviderSession.populateIdentity({
    nameElementId: 'providerName',
    roleElementId: 'providerRole'
});

var logoutButton = document.getElementById('logoutButton');
if (logoutButton) {
    logoutButton.addEventListener('click', logout);
}

var statusTabs = document.querySelectorAll('.tab[data-status]');
for (var i = 0; i < statusTabs.length; i++) {
    statusTabs[i].addEventListener('click', function () {
        filterBookings(this.dataset.status);
    });
}

function getBookingLocationLabel(booking) {
    var address = booking && booking.serviceLocation && booking.serviceLocation.address;
    if (!address) {
        return 'Location not provided';
    }

    var parts = [address.street, address.city, address.state, address.pincode].filter(Boolean);
    return parts.join(', ') || 'Location not provided';
}

function loadBookings() {
    AppConfig.fetchRoute('bookings.providerMine', {
        parseJson: true
    }).then(function (response) {
        var data = NocturnalSession.expectJsonSuccess(response, 'Failed to load bookings', {
            isSuccess: function (payload) {
                return !!(payload && payload.success && Array.isArray(payload.data));
            }
        });
        allBookings = data.data;
        updateStats();
        displayBookings(currentStatus);
    }).catch(function (error) {
        console.error('Error loading bookings:', error);
        document.getElementById('bookingsList').innerHTML =
            '<div class="empty-state"><div class="empty-state-icon">😕</div>' +
            '<h3>Failed to load bookings</h3><p>Please try again later</p></div>';
    });
}

function updateStats() {
    var today = new Date().toDateString();
    var todayBookings = allBookings.filter(function (b) {
        return new Date(b.scheduledDate).toDateString() === today;
    });
    var completedToday = todayBookings.filter(function (b) {
        return b.status === 'COMPLETED';
    });
    var earnings = completedToday.reduce(function (sum, b) {
        return sum + (b.providerEarnings || b.pricing.basePrice * 0.7);
    }, 0);

    document.getElementById('todayBookings').textContent = todayBookings.length;
    document.getElementById('completedToday').textContent = completedToday.length;
    document.getElementById('todayEarnings').textContent = AppFormat.currency(earnings, 0);
}

function filterBookings(status) {
    currentStatus = status;
    var tabs = document.querySelectorAll('.tab');
    for (var i = 0; i < tabs.length; i++) {
        if (tabs[i].dataset.status === status) {
            tabs[i].classList.add('active');
        } else {
            tabs[i].classList.remove('active');
        }
    }
    displayBookings(status);
}

function displayBookings(status) {
    var filtered = allBookings.filter(function (b) { return b.status === status; });
    var list = document.getElementById('bookingsList');

    if (filtered.length === 0) {
        list.innerHTML =
            '<div class="empty-state">' +
            '<div class="empty-state-icon">📭</div>' +
            '<h3>No ' + status.toLowerCase().replace('_', ' ') + ' bookings</h3>' +
            '<p>You\'re all caught up!</p>' +
            '</div>';
        return;
    }

    var html = '';
    for (var i = 0; i < filtered.length; i++) {
        var booking = filtered[i];
        html +=
            '<div class="booking-card">' +
            '<div class="booking-header">' +
            '<div>' +
            '<div class="service-type">' + formatServiceType(booking.serviceType) + '</div>' +
            '<div class="booking-id">ID: ' + booking._id.substr(-8) + '</div>' +
            '</div>' +
            '<span class="status-badge ' + booking.status.toLowerCase() + '">' + booking.status + '</span>' +
            '</div>' +
            '<div class="booking-details">' +
            '<div class="detail-row">' +
            '<span class="detail-label">📅 Date</span>' +
            '<span class="detail-value">' + AppFormat.date(booking.scheduledDate) + '</span>' +
            '</div>' +
            '<div class="detail-row">' +
            '<span class="detail-label">⏰ Time</span>' +
            '<span class="detail-value">' + AppFormat.timeInZone(booking.scheduledDate, booking.scheduledTime, booking.scheduledTimezone, booking.scheduledTimezoneOffsetMinutes) + '</span>' +
            '</div>' +
            '<div class="detail-row">' +
            '<span class="detail-label">Timezone</span>' +
            '<span class="detail-value">' + (booking.scheduledTimezone || 'Not specified') + '</span>' +
            '</div>' +
            '<div class="detail-row">' +
            '<span class="detail-label">👤 Patient</span>' +
            '<span class="detail-value">' + booking.patientDetails.name + '</span>' +
            '</div>' +
            '<div class="detail-row">' +
            '<span class="detail-label">📍 Location</span>' +
            '<span class="detail-value">' + getBookingLocationLabel(booking) + '</span>' +
            '</div>' +
            '<div class="detail-row">' +
            '<span class="detail-label">💰 Amount</span>' +
            '<span class="detail-value">' + AppFormat.currency(booking.pricing.payableAmount, 2) + '</span>' +
            '</div>' +
            '</div>' +
            '<div class="booking-actions">' +
            getActionButtons(booking) +
            '</div>' +
            '</div>';
    }
    list.innerHTML = html;
}

function getActionButtons(booking) {
    var buttons = '';

    if (booking.status === 'ASSIGNED') {
        buttons +=
            '<button class="btn btn-success" data-action="confirm-booking" data-booking-id="' + booking._id + '">' +
            '✓ Accept</button>';
    }

    if (booking.status === 'CONFIRMED') {
        buttons +=
            '<button class="btn btn-info" data-action="mark-en-route" data-booking-id="' + booking._id + '">' +
            '🚗 Start Journey</button>';
    }

    if (booking.status === 'EN_ROUTE') {
        buttons +=
            '<button class="btn btn-primary" data-action="start-service" data-booking-id="' + booking._id + '">' +
            '▶️ Start Service</button>';
    }

    if (booking.status === 'IN_PROGRESS') {
        buttons +=
            '<button class="btn btn-success" data-action="complete-service" data-booking-id="' + booking._id + '">' +
            '✅ Complete</button>';
    }

    return buttons;
}

function formatServiceType(type) {
    return type.split('_').map(function (word) {
        return word.charAt(0) + word.slice(1).toLowerCase();
    }).join(' ');
}

function confirmBooking(bookingId) {
    if (!confirm('Accept this booking?')) return;

    AppConfig.fetchRoute('bookings.confirm', {
        method: 'PUT',
        parseJson: true,
        headers: {
            'Content-Type': 'application/json'
        }
    }, {
        params: { bookingId: bookingId }
    }).then(function (response) {
        NocturnalSession.expectJsonSuccess(response, 'Failed to confirm booking');
        showMessage('Booking confirmed!', 'success');
        loadBookings();
    }).catch(function (error) {
        showMessage(error.message, 'error');
    });
}

function markEnRoute(bookingId) {
    AppConfig.fetchRoute('bookings.enRoute', {
        method: 'PUT',
        parseJson: true,
        headers: {
            'Content-Type': 'application/json'
        }
    }, {
        params: { bookingId: bookingId }
    }).then(function (response) {
        NocturnalSession.expectJsonSuccess(response, 'Failed to update booking status');
        showMessage('Status updated to En Route', 'success');
        loadBookings();
    }).catch(function (error) {
        showMessage(error.message, 'error');
    });
}

function startService(bookingId) {
    AppConfig.fetchRoute('bookings.start', {
        method: 'PUT',
        parseJson: true,
        headers: {
            'Content-Type': 'application/json'
        }
    }, {
        params: { bookingId: bookingId }
    }).then(function (response) {
        NocturnalSession.expectJsonSuccess(response, 'Failed to start service');
        showMessage('Service started!', 'success');
        loadBookings();
    }).catch(function (error) {
        showMessage(error.message, 'error');
    });
}

function completeService(bookingId) {
    if (!confirm('Mark this service as completed?')) return;

    AppConfig.fetchRoute('bookings.complete', {
        method: 'PUT',
        parseJson: true,
        headers: {
            'Content-Type': 'application/json'
        }
    }, {
        params: { bookingId: bookingId }
    }).then(function (response) {
        NocturnalSession.expectJsonSuccess(response, 'Failed to complete service');
        showMessage('Service completed!', 'success');
        loadBookings();
    }).catch(function (error) {
        showMessage(error.message, 'error');
    });
}

function showMessage(text, type) {
    var messageDiv = document.getElementById('messageDiv');
    var div = document.createElement('div');
    div.className = 'message ' + type;
    div.textContent = text;
    messageDiv.innerHTML = '';
    messageDiv.appendChild(div);
    setTimeout(function () {
        messageDiv.innerHTML = '';
    }, 5000);
}

function logout() {
    ProviderSession.logout({
        redirectUrl: AppConfig.routes.page('provider.login')
    });
}

var bookingsList = document.getElementById('bookingsList');
if (bookingsList) {
    bookingsList.addEventListener('click', function (event) {
        var actionElement = event.target.closest('[data-action]');
        if (!actionElement) return;

        var bookingId = actionElement.dataset.bookingId;
        if (actionElement.dataset.action === 'confirm-booking') {
            confirmBooking(bookingId);
        } else if (actionElement.dataset.action === 'mark-en-route') {
            markEnRoute(bookingId);
        } else if (actionElement.dataset.action === 'start-service') {
            startService(bookingId);
        } else if (actionElement.dataset.action === 'complete-service') {
            completeService(bookingId);
        }
    });
}

// Auto-refresh every 30 seconds
setInterval(loadBookings, 30000);

// Initialize
loadBookings();


