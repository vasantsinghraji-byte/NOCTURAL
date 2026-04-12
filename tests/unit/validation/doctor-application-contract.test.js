const fs = require('fs');
const path = require('path');

const rootDir = path.resolve(__dirname, '..', '..', '..');

const readProjectFile = (relativePath) => fs.readFileSync(path.join(rootDir, relativePath), 'utf8');

const applicationRoutesSrc = readProjectFile('routes/applications.js');
const applicationControllerSrc = readProjectFile('controllers/applicationController.js');
const applicationModelSrc = readProjectFile('models/application.js');
const dutyValidatorSrc = readProjectFile('validators/dutyValidator.js');
const frontendSessionSrc = readProjectFile('client/public/js/frontend-session.js');
const doctorDashboardSrc = readProjectFile('client/public/roles/doctor/doctor-dashboard.html');
const doctorDashboardScriptSrc = readProjectFile('client/public/js/doctor-dashboard.js');
const myApplicationsSrc = readProjectFile('client/public/roles/doctor/my-applications.html');
const myApplicationsScriptSrc = readProjectFile('client/public/js/doctor-my-applications.js');
const dutyDetailsSrc = readProjectFile('client/public/roles/doctor/duty-details.html');
const dutyDetailsScriptSrc = readProjectFile('client/public/js/doctor-duty-details.js');
const browseShiftsEnhancedSrc = readProjectFile('client/public/roles/doctor/browse-shifts-enhanced.html');
const browseShiftsEnhancedScriptSrc = readProjectFile('client/public/js/doctor-browse-shifts-enhanced.js');

describe('Doctor Application Contract', () => {
  it('should mount doctor application listing and creation on the root applications route', () => {
    expect(applicationRoutesSrc).toContain("router.route('/')");
    expect(applicationRoutesSrc).toContain('.get(protect, getMyApplications)');
    expect(applicationRoutesSrc).toContain("router.get('/stats', protect, getApplicationStats);");
    expect(applicationRoutesSrc).toContain(".post(protect, authorize('doctor', 'nurse'), validateApplyToDuty, applyForDuty)");
  });

  it('should keep my applications responses paginated under data + pagination', () => {
    expect(applicationControllerSrc).toContain('responseHelper.sendPaginated(');
    expect(applicationControllerSrc).toContain('result.data');
    expect(applicationControllerSrc).toContain('result.pagination');
  });

  it('should keep application status enums uppercase in the model', () => {
    expect(applicationModelSrc).toContain("enum: ['PENDING', 'ACCEPTED', 'REJECTED', 'WITHDRAWN']");
    expect(applicationModelSrc).toContain("default: 'PENDING'");
  });

  it('should validate doctor application creation from body duty + coverLetter fields', () => {
    const applyValidatorSection = dutyValidatorSrc.match(/const validateApplyToDuty = \[[\s\S]*?handleValidationErrors\s*\];/);

    expect(applyValidatorSection).not.toBeNull();
    expect(applyValidatorSection[0]).toContain("body('duty')");
    expect(applyValidatorSection[0]).toContain("body('coverLetter')");
    expect(applyValidatorSection[0]).not.toContain("param('id')");
    expect(dutyValidatorSrc).toContain("body('duty')");
    expect(dutyValidatorSrc).toContain("body('coverLetter')");
  });

  it('should keep doctor dashboard and applications pages aligned to GET /applications and normalized statuses', () => {
    expect(frontendSessionSrc).toContain('function normalizeApplicationStatus(status)');
    expect(frontendSessionSrc).toContain('function getApplicationStatusClass(status)');
    expect(frontendSessionSrc).toContain("AppConfig.fetchRoute('applications.list'");
    expect(frontendSessionSrc).toContain('async function fetchMyApplications(options)');
    expect(frontendSessionSrc).toContain("AppConfig.fetchRoute('applications.stats'");
    expect(frontendSessionSrc).toContain('async function fetchApplicationStats(options)');
    expect(frontendSessionSrc).toContain('function normalizeApplicationRecord(application)');
    expect(doctorDashboardScriptSrc).toContain('NocturnalSession.fetchApplicationStats({');
    expect(doctorDashboardScriptSrc).toContain('NocturnalSession.fetchMyApplications({');
    expect(doctorDashboardScriptSrc).toContain('NocturnalSession.normalizeApplicationStatus(app.status)');
    expect(myApplicationsSrc).toContain("id=\"paginationControls\"");
    expect(myApplicationsSrc).toContain("id=\"statsScope\"");
    expect(myApplicationsSrc).toContain("id=\"applicationsSummary\"");
    expect(myApplicationsSrc).toContain("id=\"pageSizeSelect\"");
    expect(myApplicationsSrc).toContain("id=\"preferencesToast\"");
    expect(myApplicationsSrc).toContain("id=\"resetPreferencesBtn\"");
    expect(myApplicationsSrc).toContain("data-status=\"withdrawn\"");
    expect(myApplicationsScriptSrc).toContain("const APPLICATIONS_FILTER_STORAGE_KEY = 'doctorApplicationsFilter';");
    expect(myApplicationsScriptSrc).toContain("const APPLICATIONS_PAGE_STORAGE_KEY = 'doctorApplicationsPage';");
    expect(myApplicationsScriptSrc).toContain("const APPLICATIONS_PAGE_SIZE_STORAGE_KEY = 'doctorApplicationsPageSize';");
    expect(myApplicationsScriptSrc).toContain("const APPLICATIONS_SCROLL_STORAGE_KEY = 'doctorApplicationsScrollY';");
    expect(myApplicationsScriptSrc).toContain('const APPLICATIONS_SCROLL_WRITE_DEBOUNCE_MS = 150;');
    expect(myApplicationsScriptSrc).toContain('function getPageStorageKey(status = currentFilter)');
    expect(myApplicationsScriptSrc).toContain('function getStoredPageForFilter(status = currentFilter)');
    expect(myApplicationsScriptSrc).toContain('function getScrollStorageKey(status = currentFilter)');
    expect(myApplicationsScriptSrc).toContain('function setActiveFilterTab(status)');
    expect(myApplicationsScriptSrc).toContain('function loadStoredFilter()');
    expect(myApplicationsScriptSrc).toContain('function loadStoredPage()');
    expect(myApplicationsScriptSrc).toContain('function loadStoredPageSize()');
    expect(myApplicationsScriptSrc).toContain('function persistScrollPositionNow(status = currentFilter)');
    expect(myApplicationsScriptSrc).toContain('function persistScrollPosition()');
    expect(myApplicationsScriptSrc).toContain('function restoreScrollPosition()');
    expect(myApplicationsScriptSrc).toContain('function showPreferencesToast(message)');
    expect(myApplicationsScriptSrc).toContain('function clampCurrentPageToPagination()');
    expect(myApplicationsScriptSrc).toContain('function renderPagination()');
    expect(myApplicationsScriptSrc).toContain('function getVisiblePageNumbers()');
    expect(myApplicationsScriptSrc).toContain('function changePage(page)');
    expect(myApplicationsScriptSrc).toContain('function changePageSize(event)');
    expect(myApplicationsScriptSrc).toContain('function resetApplicationPreferences()');
    expect(myApplicationsScriptSrc).toContain("localStorage.setItem(APPLICATIONS_FILTER_STORAGE_KEY, currentFilter);");
    expect(myApplicationsScriptSrc).toContain("return `${APPLICATIONS_PAGE_STORAGE_KEY}:${status || 'all'}`;");
    expect(myApplicationsScriptSrc).toContain('localStorage.setItem(getPageStorageKey(), String(currentPage));');
    expect(myApplicationsScriptSrc).toContain("localStorage.setItem(APPLICATIONS_PAGE_SIZE_STORAGE_KEY, String(applicationsPageSize));");
    expect(myApplicationsScriptSrc).toContain("return `${APPLICATIONS_SCROLL_STORAGE_KEY}:${status || 'all'}`;");
    expect(myApplicationsScriptSrc).toContain('persistScrollPositionNow(statusToPersist);');
    expect(myApplicationsScriptSrc).toContain('}, APPLICATIONS_SCROLL_WRITE_DEBOUNCE_MS);');
    expect(myApplicationsScriptSrc).toContain("window.matchMedia('(max-width: 768px)').matches ? 1600 : 2200");
    expect(myApplicationsScriptSrc).toContain('localStorage.removeItem(APPLICATIONS_PAGE_STORAGE_KEY);');
    expect(myApplicationsScriptSrc).toContain('localStorage.removeItem(APPLICATIONS_PAGE_SIZE_STORAGE_KEY);');
    expect(myApplicationsScriptSrc).toContain('localStorage.removeItem(APPLICATIONS_FILTER_STORAGE_KEY);');
    expect(myApplicationsScriptSrc).toContain('localStorage.removeItem(getPageStorageKey(status));');
    expect(myApplicationsScriptSrc).toContain("['all', 'pending', 'accepted', 'rejected', 'withdrawn'].forEach(status => {");
    expect(myApplicationsScriptSrc).toContain('localStorage.removeItem(getScrollStorageKey(status));');
    expect(myApplicationsScriptSrc).toContain("showPreferencesToast('Application preferences reset');");
    expect(myApplicationsScriptSrc).toContain('if (clampCurrentPageToPagination()) {');
    expect(myApplicationsScriptSrc).toContain("toast.classList.add('hiding');");
    expect(myApplicationsScriptSrc).toContain("toast.classList.remove('visible', 'hiding');");
    expect(myApplicationsScriptSrc).toContain("localStorage.getItem(getPageStorageKey(status)) || localStorage.getItem(APPLICATIONS_PAGE_STORAGE_KEY)");
    expect(myApplicationsScriptSrc).toContain('currentPage = getStoredPageForFilter(status);');
    expect(myApplicationsScriptSrc).toContain('fetchApplications(currentPage);');
    expect(myApplicationsScriptSrc).toContain('const targetScroll = storedScroll > maxScrollableTop');
    expect(myApplicationsScriptSrc).toContain('? Math.min(applicationsSectionTop, maxScrollableTop)');
    expect(myApplicationsScriptSrc).toContain('NocturnalSession.fetchApplicationStats({');
    expect(myApplicationsScriptSrc).toContain('NocturnalSession.fetchMyApplications({');
    expect(myApplicationsScriptSrc).toContain('NocturnalSession.normalizeApplicationStatus(app.status)');
    expect(myApplicationsScriptSrc).toContain('allPages: false');
    expect(myApplicationsSrc).toContain("id=\"withdrawnApps\"");
    expect(myApplicationsSrc).toContain("id=\"acceptedEarnings\"");
    expect(myApplicationsSrc).toContain("id=\"acceptanceRate\"");
    expect(myApplicationsScriptSrc).toContain('window.addEventListener(\'scroll\', persistScrollPosition, { passive: true });');
    expect(myApplicationsScriptSrc).toContain('persistScrollPositionNow();');
    expect(myApplicationsScriptSrc).toContain('loadStoredFilter();');
    expect(myApplicationsScriptSrc).toContain('loadStoredPage();');
    expect(myApplicationsScriptSrc).toContain('restoreScrollPosition();');
    expect(myApplicationsSrc).not.toContain("AppConfig.fetch('applications/my-applications'");
  });

  it('should keep duty details aligned to the real applications route for checks and create requests', () => {
    expect(frontendSessionSrc).toContain('function getApplicationDutyId(application)');
    expect(frontendSessionSrc).toContain('async function applyForDuty(dutyId, options)');
    expect(frontendSessionSrc).toContain('async function handleDutyApplication(event, dutyId, options)');
    expect(dutyDetailsScriptSrc).toContain('NocturnalSession.fetchMyApplications({');
    expect(dutyDetailsScriptSrc).toContain('NocturnalSession.getApplicationDutyId(app)');
    expect(dutyDetailsScriptSrc).toContain('NocturnalSession.handleDutyApplication(event,');
    expect(dutyDetailsSrc).not.toContain("AppConfig.fetch('applications/my-applications'");
    expect(dutyDetailsSrc).not.toContain("AppConfig.fetch('applications/apply'");
    expect(dutyDetailsSrc).not.toContain('async function applyForDuty(');
  });

  it('should keep other doctor apply flows aligned to POST /applications with shared submission helpers', () => {
    expect(frontendSessionSrc).toContain("AppConfig.fetchRoute('applications.list'");
    expect(frontendSessionSrc).toContain('duty: dutyId');
    expect(frontendSessionSrc).toContain('coverLetter: config.coverLetter');

    expect(browseShiftsEnhancedScriptSrc).toContain("AppConfig.fetchRoute('auth.me'");
    expect(browseShiftsEnhancedScriptSrc).toContain("AppConfig.fetchRoute('duties.list'");
    expect(browseShiftsEnhancedScriptSrc).toContain('NocturnalSession.handleDutyApplication(event, applyButton.dataset.shiftId, {');
    expect(browseShiftsEnhancedScriptSrc).toContain('coverLetter:');
    expect(browseShiftsEnhancedSrc).toContain('/roles/doctor/browse-shifts-enhanced.html');
    expect(browseShiftsEnhancedScriptSrc).not.toContain('window.applyForShift = async function');
  });
});
