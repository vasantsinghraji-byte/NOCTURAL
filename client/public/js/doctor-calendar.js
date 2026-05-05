// API_URL is provided by config.js
        let calendar;
        let allEvents = [];

        // Initialize calendar on page load
        document.addEventListener('DOMContentLoaded', function() {
            const token = DoctorSession.requireAuthenticatedPage({
                redirectUrl: AppConfig.routes.page('home')
            });
            if (!token) {
                window.location.href = AppConfig.routes.page('home');
                return;
            }

            initCalendar();
            loadCalendarEvents();
            loadMonthStats();

            // All day checkbox handler
            document.getElementById('allDay').addEventListener('change', function() {
                const timeFields = document.getElementById('timeFields');
                AppUi.setDisplay(timeFields, this.checked ? 'none' : 'block');
            });
        });

        function initCalendar() {
            const calendarEl = document.getElementById('calendar');

            calendar = new FullCalendar.Calendar(calendarEl, {
                initialView: 'dayGridMonth',
                headerToolbar: {
                    left: 'prev,next today',
                    center: 'title',
                    right: 'dayGridMonth,timeGridWeek,timeGridDay'
                },
                height: 'auto',
                events: [],
                eventClick: function(info) {
                    showEventDetails(info.event);
                },
                dateClick: function(info) {
                    document.getElementById('startDate').value = info.dateStr;
                    document.getElementById('endDate').value = info.dateStr;
                    openAddEventModal();
                }
            });

            calendar.render();
        }

        async function loadCalendarEvents() {
            try {
                const data = NocturnalSession.expectJsonSuccess(await AppConfig.fetchRoute('calendar.events', {
                    parseJson: true
                }), 'Failed to load calendar events');
                allEvents = Array.isArray(data.data) ? data.data : [];
                renderEvents();
                checkForWarnings();
            } catch (error) {
                console.error('Error loading events:', error);
            }
        }

        function renderEvents() {
            const events = allEvents.map(event => {
                let className = 'event-personal';
                if (event.eventType === 'SHIFT_ACCEPTED') className = 'event-accepted';
                if (event.eventType === 'SHIFT_PENDING') className = 'event-pending';
                if (event.eventType === 'BLACKOUT_DATE') className = 'event-blackout';

                return {
                    id: event._id,
                    title: event.title,
                    start: event.allDay ? event.startDate.split('T')[0] : event.startDate,
                    end: event.allDay ? event.endDate.split('T')[0] : event.endDate,
                    allDay: event.allDay,
                    backgroundColor: event.color,
                    borderColor: event.color,
                    className: className,
                    extendedProps: event
                };
            });

            calendar.removeAllEvents();
            calendar.addEventSource(events);
        }

        function checkForWarnings() {
            const warnings = [];

            allEvents.forEach(event => {
                if (event.warnings && event.warnings.length > 0) {
                    warnings.push(...event.warnings);
                }
                if (event.conflicts && event.conflicts.length > 0) {
                    event.conflicts.forEach(conflict => {
                        warnings.push({
                            type: 'CONFLICT',
                            message: conflict.message,
                            severity: conflict.severity
                        });
                    });
                }
            });

            if (warnings.length > 0) {
                displayWarnings(warnings);
            }
        }

        function displayWarnings(warnings) {
            const warningsCard = document.getElementById('warningsCard');
            const warningsList = document.getElementById('warningsList');

            let html = '';
            warnings.forEach(warning => {
                const icon = warning.severity === 'CRITICAL' ? 'exclamation-circle' : 'exclamation-triangle';
                html += `
                    <div class="warning-box">
                        <h4><i class="fas fa-${icon}"></i> ${warning.type}</h4>
                        <p>${warning.message}</p>
                    </div>
                `;
            });

            warningsList.innerHTML = html;
            AppUi.setDisplay(warningsCard, 'block');
        }

        async function loadMonthStats() {
            const now = new Date();
            const month = now.getMonth() + 1;
            const year = now.getFullYear();

            const shifts = allEvents.filter(e => {
                const eventDate = new Date(e.startDate);
                return (e.eventType === 'SHIFT_ACCEPTED' || e.eventType === 'SHIFT_PENDING') &&
                       eventDate.getMonth() + 1 === month &&
                       eventDate.getFullYear() === year;
            });

            let totalHours = 0;
            shifts.forEach(shift => {
                if (shift.startTime && shift.endTime) {
                    const start = shift.startTime.split(':');
                    const end = shift.endTime.split(':');
                    const hours = (parseInt(end[0]) * 60 + parseInt(end[1]) -
                                  parseInt(start[0]) * 60 - parseInt(start[1])) / 60;
                    totalHours += hours;
                }
            });

            document.getElementById('shiftsThisMonth').textContent = shifts.length;
            document.getElementById('hoursThisMonth').textContent = Math.round(totalHours);
        }

        function showEventDetails(event) {
            const props = event.extendedProps;
            const modal = document.getElementById('eventDetailsModal');
            const content = document.getElementById('eventDetailsContent');

            let html = `
                <h2>${event.title}</h2>
                <p><strong>Type:</strong> ${props.eventType.replace(/_/g, ' ')}</p>
                <p><strong>Date:</strong> ${AppFormat.date(event.start)}</p>
            `;

            if (props.description) {
                html += `<p><strong>Description:</strong> ${props.description}</p>`;
            }

            if (props.location) {
                html += `<p><strong>Location:</strong> ${props.location}</p>`;
            }

            if (props.distance) {
                html += `<p><strong>Distance:</strong> ${props.distance} km</p>`;
            }

            if (props.travelTime) {
                html += `<p><strong>Travel Time:</strong> ${props.travelTime} minutes</p>`;
            }

            if (props.conflicts && props.conflicts.length > 0) {
                html += '<h3 class="conflicts-heading">Conflicts</h3>';
                html += '<div class="conflict-list">';
                props.conflicts.forEach(conflict => {
                    html += `<div class="conflict-item">${conflict.message}</div>`;
                });
                html += '</div>';
            }

            if (props.duty) {
                html += `<button class="btn btn-primary btn-block" data-action="view-duty-details" data-duty-id="${props.duty}">View Duty Details</button>`;
            }

            content.innerHTML = html;
            AppUi.setDisplay(modal, 'block');
        }

        function openAddEventModal() {
            AppUi.setDisplay(document.getElementById('addEventModal'), 'block');
        }

        function closeAddEventModal() {
            AppUi.setDisplay(document.getElementById('addEventModal'), 'none');
            document.getElementById('addEventForm').reset();
        }

        function closeEventDetailsModal() {
            AppUi.setDisplay(document.getElementById('eventDetailsModal'), 'none');
        }

        document.getElementById('addEventForm').addEventListener('submit', async function(e) {
            e.preventDefault();

            const allDay = document.getElementById('allDay').checked;

            const eventData = {
                title: document.getElementById('eventTitle').value,
                description: document.getElementById('eventDescription').value,
                eventType: document.getElementById('eventType').value,
                startDate: document.getElementById('startDate').value,
                endDate: document.getElementById('endDate').value,
                allDay: allDay
            };

            if (!allDay) {
                eventData.startTime = document.getElementById('startTime').value;
                eventData.endTime = document.getElementById('endTime').value;
            }

            try {
                NocturnalSession.expectJsonSuccess(await AppConfig.fetchRoute('calendar.events', {
                    method: 'POST',
                    parseJson: true,
                    headers: {
                        'Content-Type': 'application/json'
                    },
                    body: JSON.stringify(eventData)
                }), 'Failed to add event');
                alert('Event added successfully!');
                closeAddEventModal();
                loadCalendarEvents();
            } catch (error) {
                console.error('Error adding event:', error);
                alert('Failed to add event');
            }
        });

        async function syncExternalCalendar() {
            if (confirm('This feature requires OAuth setup with Google/Apple/Outlook. Would you like to proceed?')) {
                alert('External calendar sync will be implemented with OAuth integration.');
                // TODO: Implement OAuth flow for Google Calendar API
            }
        }

        function logout() {
            DoctorSession.logout({
                redirectUrl: AppConfig.routes.page('home')
            });
        }

        // Close modals on outside click
        window.addEventListener('click', function(event) {
            const addModal = document.getElementById('addEventModal');
            const detailsModal = document.getElementById('eventDetailsModal');
            if (event.target === addModal) {
                closeAddEventModal();
            }
            if (event.target === detailsModal) {
                closeEventDetailsModal();
            }
        });

        function bindUiEvents() {
            document.getElementById('logoutLink')?.addEventListener('click', function(event) {
                event.preventDefault();
                logout();
            });
            document.getElementById('openAddEventBtn')?.addEventListener('click', openAddEventModal);
            document.getElementById('openAvailabilityBtn')?.addEventListener('click', function() {
                window.location.href = AppConfig.routes.page('doctor.availability');
            });
            document.getElementById('syncCalendarBtn')?.addEventListener('click', syncExternalCalendar);
            document.getElementById('closeAddEventModalBtn')?.addEventListener('click', closeAddEventModal);
            document.getElementById('closeEventDetailsModalBtn')?.addEventListener('click', closeEventDetailsModal);
            document.getElementById('eventDetailsContent')?.addEventListener('click', function(event) {
                const button = event.target.closest('[data-action="view-duty-details"]');
                if (button) {
                    window.location.href = AppConfig.routes.page('doctor.dutyDetails', {
                        id: button.dataset.dutyId
                    });
                }
            });
        }

        bindUiEvents();
