        // API_URL is provided by config.js
        const token = PatientSession.requireAuthenticatedPage({
            redirectUrl: AppConfig.routes.page('patient.login')
        });
        let currentBooking = null;
        let selectedRating = 0;

        // Get booking ID from URL
        const urlParams = new URLSearchParams(window.location.search);
        const bookingId = urlParams.get('id');

        if (!bookingId) {
            window.location.href = AppConfig.routes.page('patient.dashboard');
        }

        // Load booking details
        async function loadBooking() {
            try {
                const data = NocturnalSession.expectJsonSuccess(await AppConfig.fetchRoute('bookings.detail', {
                    parseJson: true,
                    headers: { 'Authorization': `Bearer ${token}` }
                }, {
                    params: { bookingId: bookingId }
                }), 'Failed to load booking', {
                    isSuccess: function (payload) {
                        return !!(payload && payload.success && (payload.data || payload.booking));
                    }
                });
                currentBooking = data.data || data.booking;
                displayBooking(currentBooking);
            } catch (error) {
                console.error('Error loading booking:', error);
                document.getElementById('loadingDiv').innerHTML =
                    '<div class="message error">Failed to load booking. Please try again.</div>';
            }
        }

        function displayBooking(booking) {
            const location = booking.serviceLocation?.address || {};
            const paymentStatus = booking.payment?.status || 'PENDING';
            const provider = booking.serviceProvider || null;
            const serviceReport = booking.actualService?.serviceReport || null;

            document.getElementById('loadingDiv').style.display = 'none';
            document.getElementById('bookingContent').style.display = 'block';

            // Update status tracker
            updateStatusTracker(booking.status);

            // Service details
            document.getElementById('serviceType').textContent = formatServiceType(booking.serviceType);
            document.getElementById('bookingId').textContent = booking._id;
            document.getElementById('statusBadge').innerHTML =
                `<span class="status-badge ${booking.status.toLowerCase()}">${booking.status}</span>`;
            document.getElementById('scheduledDate').textContent =
                new Date(booking.scheduledDate).toLocaleDateString('en-IN', {
                    weekday: 'long', year: 'numeric', month: 'long', day: 'numeric'
                });
            document.getElementById('scheduledTime').textContent = booking.scheduledTime;

            document.getElementById('serviceLocation').textContent =
                [location.street, location.city, location.state, location.pincode]
                    .filter(Boolean)
                    .join(', ') || 'Location not provided';

            // Patient details
            document.getElementById('patientName').textContent = booking.patientDetails.name;
            document.getElementById('patientAge').textContent = `${booking.patientDetails.age} years`;
            document.getElementById('patientGender').textContent = booking.patientDetails.gender;

            if (booking.specialRequirements) {
                document.getElementById('specialReqRow').style.display = 'flex';
                document.getElementById('specialReq').textContent = booking.specialRequirements;
            }

            // Pricing
            const pricing = booking.pricing;
            document.getElementById('basePrice').textContent = `₹${pricing.basePrice.toFixed(2)}`;
            document.getElementById('platformFee').textContent = `₹${pricing.platformFee.toFixed(2)}`;
            document.getElementById('gst').textContent = `₹${pricing.gst.toFixed(2)}`;
            document.getElementById('totalPrice').textContent = `₹${pricing.payableAmount.toFixed(2)}`;
            document.getElementById('paymentStatus').innerHTML =
                `<span class="status-badge ${paymentStatus.toLowerCase()}">${paymentStatus}</span>`;

            // Provider details (if assigned)
            if (provider) {
                document.getElementById('providerCard').style.display = 'block';
                document.getElementById('providerName').textContent = provider.name || 'Provider';
                document.getElementById('providerRole').textContent = provider.role || 'Healthcare Professional';
                document.getElementById('providerPhone').textContent = provider.phone || 'Not available';
                document.getElementById('providerRating').textContent =
                    provider.rating ? `${provider.rating}` : 'N/A';
                document.getElementById('providerExperience').textContent =
                    provider.professional?.yearsOfExperience ? `${provider.professional.yearsOfExperience} years` : 'Not specified';
            }

            // Show cancel button if booking can be cancelled
            if (['REQUESTED', 'SEARCHING', 'ASSIGNED', 'CONFIRMED'].includes(booking.status)) {
                document.getElementById('cancelBtn').style.display = 'block';
            }

            // Show rating section if completed and not rated
            if (booking.status === 'COMPLETED' && !booking.rating?.ratedAt) {
                document.getElementById('ratingCard').style.display = 'block';
            }

            // Show service report if completed
            if (booking.status === 'COMPLETED' && serviceReport) {
                displayServiceReport(serviceReport);
            }
        }

        function updateStatusTracker(currentStatus) {
            const statusOrder = ['REQUESTED', 'SEARCHING', 'ASSIGNED', 'CONFIRMED', 'EN_ROUTE', 'IN_PROGRESS', 'COMPLETED'];
            const currentIndex = statusOrder.indexOf(currentStatus);

            document.querySelectorAll('.status-step').forEach((step, index) => {
                if (index < currentIndex) {
                    step.classList.add('completed');
                } else if (index === currentIndex) {
                    step.classList.add('active');
                } else {
                    step.classList.remove('completed', 'active');
                }
            });
        }

        function formatServiceType(type) {
            return type.split('_').map(word =>
                word.charAt(0).toUpperCase() + word.slice(1).toLowerCase()
            ).join(' ');
        }

        function displayServiceReport(report) {
            document.getElementById('reportCard').style.display = 'block';
            let html = '';

            if (report.vitalsChecked) {
                html += '<div class="detail-row"><span class="detail-label">Vitals</span><span class="detail-value">' +
                    JSON.stringify(report.vitalsChecked) + '</span></div>';
            }

            if (report.proceduresDone && report.proceduresDone.length > 0) {
                html += '<div class="detail-row"><span class="detail-label">Procedures</span><span class="detail-value">' +
                    report.proceduresDone.join(', ') + '</span></div>';
            }

            if (report.medicinesAdministered && report.medicinesAdministered.length > 0) {
                html += '<div class="detail-row"><span class="detail-label">Medicines</span><span class="detail-value">' +
                    report.medicinesAdministered.map(function(medicine) {
                        return medicine.name || 'Medicine';
                    }).join(', ') + '</span></div>';
            }

            if (report.observations) {
                html += '<div class="detail-row"><span class="detail-label">Observations</span><span class="detail-value">' +
                    report.observations + '</span></div>';
            }

            if (report.recommendations) {
                html += '<div class="detail-row"><span class="detail-label">Recommendations</span><span class="detail-value">' +
                    report.recommendations + '</span></div>';
            }

            document.getElementById('serviceReport').innerHTML = html;
        }

        // Rating stars interaction
        document.querySelectorAll('.star').forEach(star => {
            star.addEventListener('click', function() {
                selectedRating = parseInt(this.dataset.rating);
                updateStars(selectedRating);
            });
        });

        document.getElementById('backToDashboardBtn')?.addEventListener('click', function() {
            window.location.href = AppConfig.routes.page('patient.dashboard');
        });
        document.getElementById('submitReviewBtn')?.addEventListener('click', submitReview);
        document.getElementById('refreshBookingBtn')?.addEventListener('click', refreshBooking);
        document.getElementById('cancelBtn')?.addEventListener('click', cancelBooking);

        function updateStars(rating) {
            document.querySelectorAll('.star').forEach(star => {
                const starRating = parseInt(star.dataset.rating);
                if (starRating <= rating) {
                    star.classList.add('filled');
                } else {
                    star.classList.remove('filled');
                }
            });
        }

        async function submitReview() {
            if (selectedRating === 0) {
                showMessage('Please select a rating', 'error');
                return;
            }

            const comment = document.getElementById('reviewText').value.trim();

            try {
                NocturnalSession.expectJsonSuccess(await AppConfig.fetchRoute('bookings.review', {
                    method: 'POST',
                    parseJson: true,
                    headers: {
                        'Content-Type': 'application/json',
                        'Authorization': `Bearer ${token}`
                    },
                    body: JSON.stringify({ stars: selectedRating, comment })
                }, {
                    params: { bookingId: bookingId }
                }), 'Failed to submit review');
                showMessage('Thank you for your review!', 'success');
                document.getElementById('ratingCard').style.display = 'none';
            } catch (error) {
                console.error('Error submitting review:', error);
                showMessage(error.message, 'error');
            }
        }

        async function cancelBooking() {
            if (!confirm('Are you sure you want to cancel this booking?')) {
                return;
            }

            try {
                NocturnalSession.expectJsonSuccess(await AppConfig.fetchRoute('bookings.cancel', {
                    method: 'PUT',
                    parseJson: true,
                    headers: {
                        'Content-Type': 'application/json',
                        'Authorization': `Bearer ${token}`
                    },
                    body: JSON.stringify({ reason: 'Cancelled by patient request' })
                }, {
                    params: { bookingId: bookingId }
                }), 'Failed to cancel booking');
                showMessage('Booking cancelled successfully', 'success');
                setTimeout(() => refreshBooking(), 1500);
            } catch (error) {
                console.error('Error cancelling booking:', error);
                showMessage(error.message, 'error');
            }
        }

        function refreshBooking() {
            document.getElementById('loadingDiv').style.display = 'block';
            document.getElementById('bookingContent').style.display = 'none';
            loadBooking();
        }

        function showMessage(text, type) {
            const messageDiv = document.getElementById('messageDiv');
            messageDiv.innerHTML = `<div class="message ${type}">${text}</div>`;
            setTimeout(() => {
                messageDiv.innerHTML = '';
            }, 5000);
        }

        // Auto-refresh every 30 seconds
        setInterval(() => {
            if (currentBooking && !['COMPLETED', 'CANCELLED'].includes(currentBooking.status)) {
                loadBooking();
            }
        }, 30000);

        // Initialize
        loadBooking();
