        // API_URL is provided by config.js
        PatientSession.requireAuthenticatedPage({
            redirectUrl: AppConfig.routes.page('patient.login')
        });

        const patient = JSON.parse(localStorage.getItem('patient') || '{}');
        const selectedService = JSON.parse(localStorage.getItem('selectedService') || '{}');

        // Set minimum date to tomorrow
        const tomorrow = new Date();
        tomorrow.setDate(tomorrow.getDate() + 1);
        document.getElementById('date').min = tomorrow.toISOString().split('T')[0];

        // Display service info
        if (selectedService.serviceName) {
            document.getElementById('serviceName').textContent = selectedService.serviceName;
            document.getElementById('servicePrice').textContent = `Base Price: ₹${selectedService.price}`;
            updatePriceSummary(selectedService.price);
        } else {
            window.location.href = AppConfig.routes.page('patient.dashboard');
        }

        document.getElementById('backButton')?.addEventListener('click', function() {
            window.history.back();
        });

        const DEFAULT_TIMEZONES = [
            'Asia/Kolkata',
            'UTC',
            'America/New_York',
            'America/Chicago',
            'America/Denver',
            'America/Los_Angeles',
            'Europe/London',
            'Europe/Berlin',
            'Asia/Dubai',
            'Asia/Singapore',
            'Australia/Sydney'
        ];

        function getBrowserTimeZone() {
            return Intl.DateTimeFormat().resolvedOptions().timeZone || 'UTC';
        }

        function populateTimezoneOptions() {
            const timezoneSelect = document.getElementById('timezone');
            const browserTimeZone = getBrowserTimeZone();
            const timezones = DEFAULT_TIMEZONES.includes(browserTimeZone)
                ? DEFAULT_TIMEZONES
                : [browserTimeZone].concat(DEFAULT_TIMEZONES);

            timezoneSelect.innerHTML = timezones
                .map((timeZone) => `<option value="${timeZone}">${timeZone}</option>`)
                .join('');
            timezoneSelect.value = browserTimeZone;
        }

        function parseOffsetMinutes(timeZoneName) {
            const match = String(timeZoneName || '').match(/GMT([+-])(\d{1,2})(?::?(\d{2}))?/i);
            if (!match) {
                return 0;
            }

            const sign = match[1] === '-' ? -1 : 1;
            const hours = parseInt(match[2], 10);
            const minutes = parseInt(match[3] || '0', 10);

            return sign * ((hours * 60) + minutes);
        }

        function getOffsetMinutesForInstant(date, timeZone) {
            const timeZoneName = new Intl.DateTimeFormat('en-US', {
                timeZone,
                timeZoneName: 'shortOffset',
                hour: '2-digit',
                minute: '2-digit'
            }).formatToParts(date).find((part) => part.type === 'timeZoneName')?.value;

            return parseOffsetMinutes(timeZoneName);
        }

        function getScheduledTimezoneOffsetMinutes(dateValue, timeValue, timeZone) {
            const [year, month, day] = String(dateValue || '').split('-').map(Number);
            const [hours, minutes] = String(timeValue || '').split(':').map(Number);

            if ([year, month, day, hours, minutes].some(Number.isNaN)) {
                return new Date().getTimezoneOffset() * -1;
            }

            let offsetMinutes = getOffsetMinutesForInstant(new Date(), timeZone);

            for (let attempt = 0; attempt < 3; attempt += 1) {
                const utcMillis = Date.UTC(year, month - 1, day, hours, minutes) - (offsetMinutes * 60 * 1000);
                const candidateDate = new Date(utcMillis);
                const resolvedOffsetMinutes = getOffsetMinutesForInstant(candidateDate, timeZone);

                if (resolvedOffsetMinutes === offsetMinutes) {
                    return resolvedOffsetMinutes;
                }

                offsetMinutes = resolvedOffsetMinutes;
            }

            return offsetMinutes;
        }

        populateTimezoneOptions();

        function updatePriceSummary(basePrice) {
            const platformFee = basePrice * 0.15;
            const gst = (basePrice + platformFee) * 0.18;
            const total = basePrice + platformFee + gst;

            document.getElementById('summaryBasePrice').textContent = `₹${basePrice}`;
            document.getElementById('summaryPlatformFee').textContent = AppFormat.currency(platformFee, 2);
            document.getElementById('summaryGST').textContent = AppFormat.currency(gst, 2);
            document.getElementById('summaryTotal').textContent = AppFormat.currency(total, 2);
        }

        document.getElementById('bookingForm').addEventListener('submit', async (e) => {
            e.preventDefault();

            const errorDiv = document.getElementById('errorDiv');
            const btn = document.getElementById('submitBtn');
            errorDiv.innerHTML = '';

            const prescriptionUrl = document.getElementById('prescriptionUrl').value.trim();
            const scheduledDate = document.getElementById('date').value;
            const scheduledTime = document.getElementById('time').value;
            const scheduledTimezone = document.getElementById('timezone').value || getBrowserTimeZone();
            const bookingData = {
                serviceType: selectedService.serviceType,
                scheduledDate,
                scheduledTime,
                scheduledTimezone,
                scheduledTimezoneOffsetMinutes: getScheduledTimezoneOffsetMinutes(
                    scheduledDate,
                    scheduledTime,
                    scheduledTimezone
                ),
                serviceLocation: {
                    type: 'HOME',
                    address: {
                        street: document.getElementById('address').value,
                        city: document.getElementById('city').value,
                        state: 'Karnataka',
                        pincode: document.getElementById('pincode').value,
                        coordinates: {
                            lat: 12.9716,
                            lng: 77.5946
                        }
                    }
                },
                patientDetails: {
                    name: patient.name || 'Patient',
                    age: parseInt(document.getElementById('patientAge').value),
                    gender: document.getElementById('patientGender').value
                },
                specialRequirements: document.getElementById('specialRequirements').value,
                ...(prescriptionUrl ? { prescriptionUrl } : {})
            };

            btn.disabled = true;
            btn.textContent = 'Creating booking...';

            try {
                const data = NocturnalSession.expectJsonSuccess(await AppConfig.fetchRoute('bookings.list', {
                    method: 'POST',
                    parseJson: true,
                    headers: {
                        'Content-Type': 'application/json'
                    },
                    body: JSON.stringify(bookingData)
                }), 'Booking failed', {
                    isSuccess: function (payload) {
                        return !!(payload && payload.success && payload.booking);
                    }
                });
                // Initiate Razorpay payment
                initiatePayment(data.booking);
            } catch (error) {
                console.error('Booking error:', error);
                errorDiv.innerHTML = `<div class="error-message">${error.message}</div>`;
                btn.disabled = false;
                btn.textContent = 'Proceed to Payment';
            }
        });

        async function initiatePayment(booking) {
            try {
                // Create Razorpay order
                const orderData = NocturnalSession.expectJsonSuccess(await AppConfig.fetchRoute('paymentsB2c.createOrder', {
                    method: 'POST',
                    parseJson: true,
                    headers: {
                        'Content-Type': 'application/json'
                    },
                    body: JSON.stringify({ bookingId: booking._id })
                }), 'Failed to create payment order');

                const options = {
                    key: orderData.razorpayKey,
                    amount: orderData.order.amount,
                    currency: orderData.order.currency,
                    name: 'Nocturnal Healthcare',
                    description: `${selectedService.serviceName}`,
                    order_id: orderData.order.id,
                    handler: async function (response) {
                        // Payment successful - verify on backend
                        await handlePaymentSuccess(response, booking._id);
                    },
                    prefill: {
                        name: patient.name,
                        email: patient.email,
                        contact: patient.phone
                    },
                    theme: {
                        color: '#667eea'
                    },
                    modal: {
                        ondismiss: function() {
                            document.getElementById('submitBtn').disabled = false;
                            document.getElementById('submitBtn').textContent = 'Proceed to Payment';
                        }
                    }
                };

                const rzp = new Razorpay(options);
                rzp.on('payment.failed', function (response) {
                    handlePaymentFailure(response, booking._id);
                });
                rzp.open();
            } catch (error) {
                console.error('Payment initiation error:', error);
                document.getElementById('errorDiv').innerHTML =
                    `<div class="error-message">${error.message}</div>`;
                document.getElementById('submitBtn').disabled = false;
                document.getElementById('submitBtn').textContent = 'Proceed to Payment';
            }
        }

        async function handlePaymentSuccess(paymentResponse, bookingId) {
            try {
                // Verify payment on backend
                NocturnalSession.expectJsonSuccess(await AppConfig.fetchRoute('paymentsB2c.verify', {
                    method: 'POST',
                    parseJson: true,
                    headers: {
                        'Content-Type': 'application/json'
                    },
                    body: JSON.stringify({
                        razorpay_order_id: paymentResponse.razorpay_order_id,
                        razorpay_payment_id: paymentResponse.razorpay_payment_id,
                        razorpay_signature: paymentResponse.razorpay_signature,
                        bookingId: bookingId
                    })
                }), 'Payment verification failed');
                document.getElementById('errorDiv').innerHTML =
                    '<div class="success-message">Payment successful! Redirecting to your booking...</div>';

                setTimeout(() => {
                    window.location.href = AppConfig.routes.page('patient.bookingDetails', { id: bookingId });
                }, 2000);
            } catch (error) {
                console.error('Payment verification error:', error);
                document.getElementById('errorDiv').innerHTML =
                    '<div class="error-message">Payment verification failed. Please contact support.</div>';
            }
        }

        async function handlePaymentFailure(response, bookingId) {
            try {
                // Report failure to backend
                NocturnalSession.expectJsonSuccess(await AppConfig.fetchRoute('paymentsB2c.failure', {
                    method: 'POST',
                    parseJson: true,
                    headers: {
                        'Content-Type': 'application/json'
                    },
                    body: JSON.stringify({
                        bookingId: bookingId,
                        error: response.error
                    })
                }), 'Failed to report payment failure');
            } catch (error) {
                console.error('Error reporting payment failure:', error);
            }

            document.getElementById('errorDiv').innerHTML =
                '<div class="error-message">Payment failed. Please try again.</div>';
            document.getElementById('submitBtn').disabled = false;
            document.getElementById('submitBtn').textContent = 'Proceed to Payment';
        }
