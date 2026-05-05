        // API_URL is provided by config.js
        let currentTab = 'services';

        // Check authentication
        PatientSession.requireAuthenticatedPage({
            redirectUrl: AppConfig.routes.page('patient.login')
        });

        // Load patient data
        PatientSession.populateIdentity({
            nameElementId: 'userName',
            welcomeElementId: 'welcomeMessage',
            welcomeFormatter: function(patient) {
                return `Welcome back, ${patient.name.split(' ')[0]}!`;
            }
        });

        // Fetch services
        async function loadServices() {
            try {
                // For now, display hardcoded services since we have them seeded
                const services = [
                    {
                        name: 'IM Injection',
                        description: 'Professional intramuscular injection administration at home',
                        price: 299,
                        category: 'NURSING',
                        icon: '💉',
                        serviceType: 'INJECTION'
                    },
                    {
                        name: 'IV Drip at Home',
                        description: 'IV fluid infusion therapy in the comfort of your home',
                        price: 799,
                        category: 'NURSING',
                        icon: '💧',
                        serviceType: 'IV_DRIP'
                    },
                    {
                        name: 'Wound Dressing',
                        description: 'Professional wound care and dressing changes',
                        price: 499,
                        category: 'NURSING',
                        icon: '🩹',
                        serviceType: 'WOUND_DRESSING'
                    },
                    {
                        name: 'Catheter Care',
                        description: 'Urinary catheter insertion and maintenance care',
                        price: 899,
                        category: 'NURSING',
                        icon: '🏥',
                        serviceType: 'CATHETER_CARE'
                    },
                    {
                        name: 'Post-Surgery Care',
                        description: 'Comprehensive post-operative nursing care at home',
                        price: 1499,
                        category: 'NURSING',
                        icon: '🔬',
                        serviceType: 'POST_SURGERY_CARE'
                    },
                    {
                        name: 'Elderly Daily Care',
                        description: 'Daily nursing care for elderly patients',
                        price: 999,
                        category: 'NURSING',
                        icon: '👴',
                        serviceType: 'ELDERLY_CARE'
                    },
                    {
                        name: 'Physiotherapy Session',
                        description: 'Professional physiotherapy treatment at your home',
                        price: 799,
                        category: 'PHYSIOTHERAPY',
                        icon: '🧘',
                        serviceType: 'PHYSIOTHERAPY_SESSION'
                    },
                    {
                        name: 'Back Pain Therapy',
                        description: 'Specialized treatment for back pain relief',
                        price: 899,
                        category: 'PHYSIOTHERAPY',
                        icon: '🔙',
                        serviceType: 'BACK_PAIN_THERAPY'
                    },
                    {
                        name: 'Knee Pain Therapy',
                        description: 'Targeted therapy for knee pain and mobility',
                        price: 899,
                        category: 'PHYSIOTHERAPY',
                        icon: '🦵',
                        serviceType: 'KNEE_PAIN_THERAPY'
                    },
                    {
                        name: 'Post-Surgery Rehab',
                        description: 'Rehabilitation after surgical procedures',
                        price: 1299,
                        category: 'PHYSIOTHERAPY',
                        icon: '🏋️',
                        serviceType: 'POST_SURGERY_REHAB'
                    },
                    {
                        name: 'Stroke Rehabilitation',
                        description: 'Comprehensive stroke recovery program',
                        price: 1499,
                        category: 'PHYSIOTHERAPY',
                        icon: '🧠',
                        serviceType: 'STROKE_REHAB'
                    },
                    {
                        name: '10-Session Physio Package',
                        description: '10 physiotherapy sessions - Save ₹2000!',
                        price: 6999,
                        category: 'PACKAGE',
                        icon: '📦',
                        serviceType: 'PHYSIO_PACKAGE_10'
                    }
                ];

                displayServices(services);
            } catch (error) {
                console.error('Error loading services:', error);
                document.getElementById('servicesGrid').innerHTML =
                    '<div class="empty-state"><h3>Failed to load services</h3><p>Please try again later</p></div>';
            }
        }

        function displayServices(services) {
            const grid = document.getElementById('servicesGrid');
            grid.innerHTML = services.map(service => `
                <div class="service-card" data-service-type="${service.serviceType}" data-service-name="${service.name}" data-service-price="${service.price}">
                    <div class="category-badge">${service.category}</div>
                    <div class="service-icon">${service.icon}</div>
                    <h3>${service.name}</h3>
                    <p>${service.description}</p>
                    <div class="service-price">
                        <span class="price">₹${service.price}</span>
                        <button class="btn-book">Book Now</button>
                    </div>
                </div>
            `).join('');
        }

        // Fetch patient stats
        async function loadStats() {
            try {
                const data = NocturnalSession.expectJsonSuccess(await AppConfig.fetchRoute('patients.stats', {
                    parseJson: true
                }), 'Failed to load stats', {
                    isSuccess: function (payload) {
                        return !!(payload && payload.stats);
                    }
                });
                document.getElementById('totalBookings').textContent = data.stats.totalBookings || 0;
                document.getElementById('totalSpent').textContent = `₹${data.stats.totalSpent || 0}`;
            } catch (error) {
                console.error('Error loading stats:', error);
            }
        }

        // Fetch bookings
        async function loadBookings() {
            try {
                const data = NocturnalSession.expectJsonSuccess(await AppConfig.fetchRoute('bookings.patientMine', {
                    parseJson: true
                }), 'Failed to load bookings', {
                    isSuccess: function (payload) {
                        return !!(payload && Array.isArray(payload.data));
                    }
                });
                displayBookings(data.data || []);
            } catch (error) {
                console.error('Error loading bookings:', error);
                document.getElementById('bookingsList').innerHTML =
                    '<div class="empty-state"><h3>No bookings yet</h3><p>Book your first service to get started!</p></div>';
            }
        }

        function displayBookings(bookings) {
            const list = document.getElementById('bookingsList');

            if (bookings.length === 0) {
                list.innerHTML = '<div class="empty-state"><h3>No bookings yet</h3><p>Book your first service to get started!</p></div>';
                return;
            }

            list.innerHTML = bookings.map(booking => `
                <div class="service-card">
                    <div class="category-badge">${booking.status}</div>
                    <h3>${booking.serviceType}</h3>
                    <p><strong>Date:</strong> ${AppFormat.date(booking.scheduledDate)}</p>
                    <p><strong>Time:</strong> ${AppFormat.timeInZone(booking.scheduledDate, booking.scheduledTime, booking.scheduledTimezone, booking.scheduledTimezoneOffsetMinutes)}</p>
                    <p><strong>Timezone:</strong> ${booking.scheduledTimezone || 'Not specified'}</p>
                    <div class="service-price">
                        <span class="price">₹${AppFormat.decimal(booking.pricing.payableAmount, 2)}</span>
                    </div>
                </div>
            `).join('');
        }

        function showTab(tab, tabButton) {
            const tabs = document.querySelectorAll('.tab');
            tabs.forEach(t => t.classList.remove('active'));
            if (tabButton) {
                tabButton.classList.add('active');
            }

            document.getElementById('servicesTab').classList.toggle('is-hidden', tab !== 'services');
            document.getElementById('bookingsTab').classList.toggle('is-hidden', tab !== 'bookings');

            currentTab = tab;
            if (tab === 'bookings') {
                loadBookings();
            }
        }

        function bookService(serviceType, serviceName, price) {
            localStorage.setItem('selectedService', JSON.stringify({ serviceType, serviceName, price }));
            window.location.href = AppConfig.routes.page('patient.bookingForm');
        }

        function logout() {
            PatientSession.logout({
                redirectUrl: AppConfig.routes.page('patient.login')
            });
        }

        function bindUiEvents() {
            document.getElementById('logoutBtn')?.addEventListener('click', logout);

            document.querySelectorAll('.tab[data-tab]').forEach(tabButton => {
                tabButton.addEventListener('click', function() {
                    showTab(this.dataset.tab, this);
                });
            });

            document.querySelectorAll('.tab[data-route]').forEach(tabButton => {
                tabButton.addEventListener('click', function() {
                    window.location.href = this.dataset.route;
                });
            });

            document.getElementById('servicesGrid')?.addEventListener('click', function(event) {
                const serviceCard = event.target.closest('.service-card[data-service-type]');
                if (!serviceCard) {
                    return;
                }

                bookService(
                    serviceCard.dataset.serviceType,
                    serviceCard.dataset.serviceName,
                    parseFloat(serviceCard.dataset.servicePrice)
                );
            });
        }

        // Initialize
        bindUiEvents();
        loadServices();
        loadStats();


