document.addEventListener('DOMContentLoaded', () => {
    // Check if Firebase is available and this page needs app.js
    if (!window.firebase) {
        console.log('⚠️ Firebase not initialized, skipping app.js');
        return;
    }

    // --- 1. GET FIREBASE SERVICES & DOM ELEMENTS ---
    const {
        auth, db, onAuthStateChanged, createUserWithEmailAndPassword,
        signInWithEmailAndPassword, signOut, doc, setDoc, getDoc,
        collection, addDoc, query, where, onSnapshot, updateDoc, getDocs
    } = window.firebase;

    // Page containers
    const landingPage = document.getElementById('landing-page');
    const loginPage = document.getElementById('login-page');
    const registerPage = document.getElementById('register-page');
    const dashboardPage = document.getElementById('dashboard');
    const hospitalProfilePage = document.getElementById('hospital-profile-page');

    // Check if this is the admin dashboard page (has the necessary elements)
    if (!dashboardPage) {
        console.log('⚠️ Dashboard element not found, skipping app.js');
        return;
    }

    // Forms
    const loginForm = document.getElementById('login-form');
    // registerForm declared later with guard
    const postDutyForm = document.getElementById('post-duty-form');
    
    // Buttons and Links
    const showLoginBtn = document.getElementById('show-login-btn');
    const showRegisterBtn = document.getElementById('show-register-btn');
    const goToRegisterLink = document.getElementById('go-to-register-link');
    const goToLoginLink = document.getElementById('go-to-login-link');
    const backBtns = document.querySelectorAll('.back-btn');
    const logoutBtn = document.getElementById('logout-btn');
    // Logout handler
if (logoutBtn) {
    logoutBtn.addEventListener('click', async () => {
        // Clear localStorage
        localStorage.removeItem('token');
        localStorage.removeItem('userType');
        localStorage.removeItem('userId');
        localStorage.removeItem('userName');
        
        // Sign out from Firebase
        await signOut(auth);
    });
}

    // Dashboard Sections
    const adminSection = document.getElementById('admin-section');
    const doctorNurseSection = document.getElementById('doctor-nurse-section');
    const userNameEl = document.getElementById('user-name');
    const userInfoEl = document.getElementById('user-info');

    // Data containers
    const dutiesList = document.getElementById('duties-list');
    const applicationsReceivedList = document.getElementById('applications-received-list');
    const myApplicationsList = document.getElementById('my-applications-list');
    
    // Modal
    const applyModal = document.getElementById('apply-modal');
    const applyForm = document.getElementById('apply-form');
    const closeModalBtn = document.getElementById('close-apply-modal');

    // App State
    let currentUser = null;
    let unsubscribes = [];
    let allDuties = []; // Store all duties for filtering

    // --- 2. NAVIGATION & UI HELPERS ---
    const ui = {
        showPage(page) {
            if (landingPage) landingPage.style.display = 'none';
            if (loginPage) loginPage.style.display = 'none';
            if (registerPage) registerPage.style.display = 'none';
            if (dashboardPage) dashboardPage.style.display = 'none';
            if (hospitalProfilePage) hospitalProfilePage.style.display = 'none';
            if (page) page.style.display = (page === landingPage) ? 'flex' : 'block';
        },
        showError(form, message) {
            const errorEl = document.getElementById(`${form}-error`);
            if (errorEl) {
                errorEl.textContent = message;
                errorEl.style.display = 'block';
            }
        },
        clearErrors() {
            document.querySelectorAll('.message.error').forEach(el => el.style.display = 'none');
        },
        renderDashboard(userProfile) {
            if (userNameEl) userNameEl.textContent = userProfile.name;
            if (adminSection) adminSection.style.display = 'none';
            if (doctorNurseSection) doctorNurseSection.style.display = 'none';
            
            if (userProfile.role === 'admin') {
                if (userInfoEl) userInfoEl.textContent = `${userProfile.hospital} | Administrator`;
                if (adminSection) adminSection.style.display = 'block';
                renderAdminStats(userProfile.uid);
                listenForApplications(userProfile.uid);
            } else {
                if (userInfoEl) userInfoEl.textContent = `${userProfile.specialty} | ${userProfile.role.charAt(0).toUpperCase() + userProfile.role.slice(1)}`;
                if (doctorNurseSection) doctorNurseSection.style.display = 'block';
                listenForDuties();
                listenForMyApplicationUpdates(userProfile.uid);
            }
            ui.showPage(dashboardPage);
        }
    };
    
    // Navigation Listeners
    if (showLoginBtn) {
        showLoginBtn.addEventListener('click', () => ui.showPage(loginPage));
    }
    if (showRegisterBtn) {
        showRegisterBtn.addEventListener('click', () => ui.showPage(registerPage));
    }
    if (goToLoginLink) {
        goToLoginLink.addEventListener('click', () => ui.showPage(loginPage));
    }
    if (goToRegisterLink) {
        goToRegisterLink.addEventListener('click', () => ui.showPage(registerPage));
    }
    if (backBtns.length > 0) {
        backBtns.forEach(btn => {
            btn.addEventListener('click', () => {
                // Check if it's the back-to-dashboard button
                if (btn.classList.contains('back-to-dashboard-btn')) {
                    ui.showPage(dashboardPage);
                } else {
                    ui.showPage(landingPage);
                }
            });
        });
    }
    if (closeModalBtn) {
        closeModalBtn.addEventListener('click', () => {
            if (applyModal) applyModal.style.display = 'none';
        });
    }

    // --- 3. AUTHENTICATION ---
    onAuthStateChanged(auth, async (user) => {
    unsubscribes.forEach(unsub => unsub());
    unsubscribes = [];

    if (user) {
        currentUser = { uid: user.uid, email: user.email };
        const userDocRef = doc(db, 'users', user.uid);
        const userDoc = await getDoc(userDocRef);
        
        if (userDoc.exists()) {
            const userData = userDoc.data();
            currentUser = { ...currentUser, ...userData };
            
            // Get token
            const token = await user.getIdToken();
            
            // Save to localStorage
            localStorage.setItem('token', token);
            localStorage.setItem('userId', user.uid);
            localStorage.setItem('userName', userData.name || 'User');
            
            // IMPORTANT: Check role and redirect
            if (userData.role === 'doctor' || userData.role === 'nurse') {
                // For doctors/nurses - go to NEW dashboard
                localStorage.setItem('userType', 'doctor');
                // Only redirect if we're on the landing/login page (index.html)
                if (window.location.pathname.includes('index.html') || window.location.pathname === '/') {
                    window.location.href = '/roles/doctor/doctor-dashboard.html';
                }
                // If already on a doctor page, don't redirect
            } else {
                // For hospitals/admin - show OLD dashboard
                localStorage.setItem('userType', 'hospital');
                ui.renderDashboard(currentUser);
            }
        }
    } else {
        // Logged out - clear everything
        currentUser = null;
        localStorage.clear();
        ui.showPage(landingPage);
    }
});

    // Registration
    // Guard: Only run if registerForm exists
    const registerForm = document.getElementById('register-form');
    if (registerForm) {
        registerForm.addEventListener('submit', async (e) => {
            e.preventDefault();
            ui.clearErrors();
            const name = registerForm['register-name']?.value;
            const email = registerForm['register-email']?.value;
            const password = registerForm['register-password']?.value;
            const role = registerForm['register-role']?.value;
            const specialty = registerForm['register-specialty']?.value;
            const hospital = registerForm['register-hospital']?.value;
            const location = registerForm['register-location']?.value;

            try {
                const userCredential = await createUserWithEmailAndPassword(auth, email, password);
                const user = userCredential.user;

                const userProfile = { name, email, role, location, createdAt: new Date() };
                if (role === 'admin') userProfile.hospital = hospital;
                else userProfile.specialty = specialty;

                await setDoc(doc(db, "users", user.uid), userProfile);
            } catch (error) {
                ui.showError('register', error.message);
            }
        });
    }

    // Login
    if (loginForm) {
        loginForm.addEventListener('submit', async (e) => {
            e.preventDefault();
            ui.clearErrors();
            const email = loginForm['login-email'].value;
            const password = loginForm['login-password'].value;
            try {
                await signInWithEmailAndPassword(auth, email, password);
            } catch (error) {
                ui.showError('login', error.message);
            }
        });
    }

    // Logout
    if (logoutBtn) {
        logoutBtn.addEventListener('click', () => signOut(auth));
    }

    // Conditional fields in registration form
    const registerRoleSelect = document.getElementById('register-role');
    if (registerRoleSelect) {
        registerRoleSelect.addEventListener('change', (e) => {
            const role = e.target.value;
            const hospitalField = document.getElementById('hospital-field');
            const specialtyField = document.getElementById('specialty-field');
            if (hospitalField) hospitalField.style.display = role === 'admin' ? 'block' : 'none';
            if (specialtyField) specialtyField.style.display = (role === 'doctor' || role === 'nurse') ? 'block' : 'none';
        });
    }

    // --- 4. HOSPITAL ADMIN FUNCTIONALITY ---
    
    // NEW: Render Admin Dashboard Stats
    async function renderAdminStats(hospitalId) {
        const statsContainer = document.createElement('div');
        statsContainer.className = 'dashboard-stats';
        statsContainer.innerHTML = `
            <div class="dashboard-stat-card">
                <h3 id="admin-open-duties">0</h3>
                <p>Open Duties</p>
            </div>
            <div class="dashboard-stat-card">
                <h3 id="admin-pending-applications">0</h3>
                <p>Pending Applications</p>
            </div>
            <div class="dashboard-stat-card">
                <h3 id="admin-total-posted">0</h3>
                <p>Total Duties Posted</p>
            </div>
        `;
        
        // Insert stats at the top of admin section
        if (adminSection && !document.querySelector('.dashboard-stats')) {
            adminSection.insertBefore(statsContainer, adminSection.firstChild);
        }

        // Calculate stats
        const dutiesQuery = query(collection(db, 'duties'), where('hospitalId', '==', hospitalId));
        const dutiesSnapshot = await getDocs(dutiesQuery);
        const openDuties = dutiesSnapshot.docs.filter(doc => doc.data().status === 'OPEN').length;
        
        const applicationsQuery = query(collection(db, 'applications'), where('hospitalId', '==', hospitalId));
        const applicationsSnapshot = await getDocs(applicationsQuery);
        const pendingApplications = applicationsSnapshot.docs.filter(doc => doc.data().status === 'PENDING').length;

        // Update stats
        const openDutiesEl = document.getElementById('admin-open-duties');
        const pendingAppsEl = document.getElementById('admin-pending-applications');
        const totalPostedEl = document.getElementById('admin-total-posted');
        
        if (openDutiesEl) openDutiesEl.textContent = openDuties;
        if (pendingAppsEl) pendingAppsEl.textContent = pendingApplications;
        if (totalPostedEl) totalPostedEl.textContent = dutiesSnapshot.docs.length;
    }

    // Post a new duty
    if (postDutyForm) {
        postDutyForm.addEventListener('submit', async (e) => {
            e.preventDefault();
            if (!currentUser || currentUser.role !== 'admin') return;

            const dutyData = {
                title: postDutyForm['duty-title'].value,
                specialty: postDutyForm['duty-specialty'].value,
                description: postDutyForm['duty-description'].value,
                date: postDutyForm['duty-date'].value,
                startTime: postDutyForm['duty-start-time'].value,
                endTime: postDutyForm['duty-end-time'].value,
                rate: parseFloat(postDutyForm['duty-rate'].value),
                urgency: postDutyForm['duty-urgency'].value,
                hospitalName: currentUser.hospital,
                hospitalLocation: currentUser.location,
                hospitalId: currentUser.uid,
                status: 'OPEN',
                createdAt: new Date()
            };
            
            try {
                await addDoc(collection(db, 'duties'), dutyData);
                postDutyForm.reset();
                alert('Duty posted successfully!');
                // Refresh stats
                renderAdminStats(currentUser.uid);
            } catch (error) {
                console.error("Error posting duty:", error);
                alert("Could not post duty. Please try again.");
            }
        });
    }

    // Listen for applications for this hospital's duties
    function listenForApplications(hospitalId) {
        const q = query(collection(db, 'applications'), where('hospitalId', '==', hospitalId));
        const unsubscribe = onSnapshot(q, (snapshot) => {
            if (!applicationsReceivedList) return;
            
            if (snapshot.empty) {
                applicationsReceivedList.innerHTML = '<p style="text-align: center; color: #999; padding: 40px;">No applications received yet</p>';
                return;
            }
            let html = '';
            snapshot.docs.sort((a,b) => b.data().createdAt.toMillis() - a.data().createdAt.toMillis()).forEach(doc => {
                const app = doc.data();
                html += `
                    <div class="application-card">
                        <h3>${app.dutyTitle}</h3>
                        <p><strong>Applicant:</strong> ${app.applicantName} (${app.applicantSpecialty})</p>
                        <p><strong>Message:</strong> ${app.coverLetter}</p>
                        <p><strong>Status:</strong> <span class="application-status ${app.status}">${app.status}</span></p>
                        ${app.status === 'PENDING' ? `
                        <div class="application-actions">
                            <button class="btn-accept" data-id="${doc.id}">Accept</button>
                            <button class="btn-reject" data-id="${doc.id}">Reject</button>
                        </div>
                        ` : ''}
                    </div>
                `;
            });
            applicationsReceivedList.innerHTML = html;
        });
        unsubscribes.push(unsubscribe);
    }
    
    // Handle accept/reject clicks
    if (applicationsReceivedList) {
        applicationsReceivedList.addEventListener('click', async (e) => {
            if (e.target.matches('.btn-accept, .btn-reject')) {
                const appId = e.target.dataset.id;
                const newStatus = e.target.classList.contains('btn-accept') ? 'ACCEPTED' : 'REJECTED';
                const appRef = doc(db, 'applications', appId);
                try {
                    await updateDoc(appRef, { status: newStatus });
                } catch (error) {
                    console.error("Error updating application status:", error);
                }
            }
        });
    }

    // --- 5. DOCTOR / NURSE FUNCTIONALITY ---

    // NEW: Render Doctor/Nurse Dashboard Stats
    async function renderDoctorStats(userLocation, userSpecialty) {
        const statsContainer = document.createElement('div');
        statsContainer.className = 'dashboard-stats';
        statsContainer.innerHTML = `
            <div class="dashboard-stat-card">
                <h3 id="duties-in-area">0</h3>
                <p>Duties in Your Area</p>
            </div>
            <div class="dashboard-stat-card">
                <h3 id="duties-specialty-match">0</h3>
                <p>Matching Your Specialty</p>
            </div>
            <div class="dashboard-stat-card">
                <h3 id="my-pending-apps">0</h3>
                <p>Pending Applications</p>
            </div>
        `;
        
        // Insert stats at the top of doctor/nurse section
        if (doctorNurseSection && !document.querySelector('.dashboard-stats')) {
            doctorNurseSection.insertBefore(statsContainer, doctorNurseSection.firstChild);
        }

        // Calculate stats from allDuties
        const dutiesInArea = allDuties.filter(d => 
            d.hospitalLocation && d.hospitalLocation.toLowerCase().includes(userLocation.toLowerCase())
        ).length;
        
        const specialtyMatches = allDuties.filter(d => 
            d.specialty && d.specialty.toLowerCase() === userSpecialty.toLowerCase()
        ).length;

        // Get pending applications
        const appsQuery = query(collection(db, 'applications'), where('applicantId', '==', currentUser.uid));
        const appsSnapshot = await getDocs(appsQuery);
        const pendingApps = appsSnapshot.docs.filter(doc => doc.data().status === 'PENDING').length;

        // Update stats
        const dutiesInAreaEl = document.getElementById('duties-in-area');
        const specialtyMatchEl = document.getElementById('duties-specialty-match');
        const pendingAppsEl = document.getElementById('my-pending-apps');
        
        if (dutiesInAreaEl) dutiesInAreaEl.textContent = dutiesInArea;
        if (specialtyMatchEl) specialtyMatchEl.textContent = specialtyMatches;
        if (pendingAppsEl) pendingAppsEl.textContent = pendingApps;
    }

    // Listen for available duties (UPGRADED with smart features)
    function listenForDuties() {
        const q = query(collection(db, 'duties'), where('status', '==', 'OPEN'));
        const unsubscribe = onSnapshot(q, (snapshot) => {
            if (!dutiesList) return;
            
            allDuties = snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() }));
            
            if (allDuties.length === 0) {
                dutiesList.innerHTML = '<p style="text-align: center; color: #999; padding: 40px;">No duties available at the moment</p>';
                return;
            }

            // Render stats
            if (currentUser && currentUser.location && currentUser.specialty) {
                renderDoctorStats(currentUser.location, currentUser.specialty);
            }

            let html = '';
            allDuties.sort((a,b) => b.createdAt.toMillis() - a.createdAt.toMillis()).forEach(duty => {
                // Check if duty matches user's specialty
                const isSpecialtyMatch = currentUser && duty.specialty && 
                    duty.specialty.toLowerCase() === currentUser.specialty.toLowerCase();
                
                html += `
                    <div class="duty-card ${duty.urgency.toLowerCase()} ${isSpecialtyMatch ? 'specialty-match' : ''}">
                        <h3>${duty.title}</h3>
                        <span class="hospital-badge" data-hospital-id="${duty.hospitalId}">${duty.hospitalName}</span>
                        <p><strong>Location:</strong> ${duty.hospitalLocation || 'Not specified'}</p>
                        <p><strong>Specialty:</strong> ${duty.specialty}</p>
                        <p><strong>Date:</strong> ${duty.date} from ${duty.startTime} to ${duty.endTime}</p>
                        <p><strong>Rate:</strong> ₹${duty.rate}/hour</p>
                        <button class="apply-btn" data-id="${duty.id}">Apply Now</button>
                    </div>
                `;
            });
            dutiesList.innerHTML = html;
        });
        unsubscribes.push(unsubscribe);
    }
    
    // NEW: Handle clicking on hospital badge to view hospital profile
    if (dutiesList) {
        dutiesList.addEventListener('click', async (e) => {
            // Handle Apply button
            if (e.target.classList.contains('apply-btn')) {
                currentDutyId = e.target.dataset.id;
                if (applyModal) applyModal.style.display = 'block';
            }
            
            // Handle Hospital badge click
            if (e.target.classList.contains('hospital-badge')) {
                const hospitalId = e.target.dataset.hospitalId;
                await showHospitalProfile(hospitalId);
            }
        });
    }

    // NEW: Show Hospital Profile Page
    async function showHospitalProfile(hospitalId) {
        if (!hospitalProfilePage) return;

        // Get hospital details
        const hospitalDoc = await getDoc(doc(db, 'users', hospitalId));
        if (!hospitalDoc.exists()) {
            alert('Hospital not found');
            return;
        }
        
        const hospital = hospitalDoc.data();
        
        // Update hospital header
        document.getElementById('hospital-name').textContent = hospital.hospital;
        document.getElementById('hospital-location').textContent = hospital.location;

        // Get hospital's duties
        const dutiesQuery = query(collection(db, 'duties'), where('hospitalId', '==', hospitalId));
        const dutiesSnapshot = await getDocs(dutiesQuery);
        
        const openDuties = dutiesSnapshot.docs.filter(doc => doc.data().status === 'OPEN');
        
        // Update stats
        document.getElementById('hospital-open-duties').textContent = openDuties.length;
        document.getElementById('hospital-total-posted').textContent = dutiesSnapshot.docs.length;

        // Render duties list
        const hospitalDutiesList = document.getElementById('hospital-duties-list');
        if (openDuties.length === 0) {
            hospitalDutiesList.innerHTML = '<p style="text-align: center; color: #999; padding: 40px;">No open duties at this hospital</p>';
        } else {
            let html = '';
            openDuties.forEach(dutyDoc => {
                const duty = dutyDoc.data();
                html += `
                    <div class="duty-card ${duty.urgency.toLowerCase()}">
                        <h3>${duty.title}</h3>
                        <p><strong>Specialty:</strong> ${duty.specialty}</p>
                        <p><strong>Date:</strong> ${duty.date} from ${duty.startTime} to ${duty.endTime}</p>
                        <p><strong>Rate:</strong> ₹${duty.rate}/hour</p>
                        <button class="apply-btn" data-id="${dutyDoc.id}">Apply Now</button>
                    </div>
                `;
            });
            hospitalDutiesList.innerHTML = html;
        }

        ui.showPage(hospitalProfilePage);
    }

    // Handle apply button on hospital profile page
    const hospitalDutiesList = document.getElementById('hospital-duties-list');
    if (hospitalDutiesList) {
        hospitalDutiesList.addEventListener('click', (e) => {
            if (e.target.classList.contains('apply-btn')) {
                currentDutyId = e.target.dataset.id;
                if (applyModal) applyModal.style.display = 'block';
            }
        });
    }
    
    // Handle submitting the application form
    let currentDutyId = null;
    if (applyForm) {
        applyForm.addEventListener('submit', async (e) => {
            e.preventDefault();
            if (!currentUser || !currentDutyId) return;

            const dutyRef = doc(db, 'duties', currentDutyId);
            const dutyDoc = await getDoc(dutyRef);
            const dutyData = dutyDoc.data();

            const applicationData = {
                dutyId: currentDutyId,
                dutyTitle: dutyData.title,
                hospitalId: dutyData.hospitalId,
                applicantId: currentUser.uid,
                applicantName: currentUser.name,
                applicantSpecialty: currentUser.specialty,
                coverLetter: applyForm['cover-letter'].value,
                status: 'PENDING',
                createdAt: new Date()
            };

            try {
                await addDoc(collection(db, 'applications'), applicationData);
                applyForm.reset();
                if (applyModal) applyModal.style.display = 'none';
                alert("Application submitted successfully!");
                
                // Refresh stats
                if (currentUser.location && currentUser.specialty) {
                    renderDoctorStats(currentUser.location, currentUser.specialty);
                }
            } catch (error) {
                console.error("Error submitting application:", error);
                alert("Could not submit application.");
            }
        });
    }

    // Listen for updates on my applications
    function listenForMyApplicationUpdates(applicantId) {
        const q = query(collection(db, 'applications'), where('applicantId', '==', applicantId));
        const unsubscribe = onSnapshot(q, (snapshot) => {
            if (!myApplicationsList) return;
            
            if (snapshot.empty) {
                myApplicationsList.innerHTML = '<p style="text-align: center; color: #999; padding: 40px;">No applications yet</p>';
                return;
            }

            let html = '';
            snapshot.docs.sort((a,b) => b.data().createdAt.toMillis() - a.data().createdAt.toMillis()).forEach(doc => {
                const app = doc.data();
                html += `
                    <div class="application-card">
                         <h3>${app.dutyTitle}</h3>
                         <p>Your application status is: <span class="application-status ${app.status}">${app.status}</span></p>
                    </div>
                `;
            });
            myApplicationsList.innerHTML = html;
        });
        unsubscribes.push(unsubscribe);
    }

});