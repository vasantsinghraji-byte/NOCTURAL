const { readProjectFile } = require('./projectFileReader');

const dutyRoutesSrc = readProjectFile('routes/duties.js');
const applicationRoutesSrc = readProjectFile('routes/applications.js');
const bookingRoutesSrc = readProjectFile('routes/booking.js');
const adminMetricsRoutesSrc = readProjectFile('routes/admin/metrics.js');

describe('Admin Route Contract', () => {
  it('should explicitly mount the admin duty listing route used by the dashboard', () => {
    expect(dutyRoutesSrc).toContain("router.get('/my-duties'");
  });

  it('should explicitly mount the admin applications list and status routes used by admin pages', () => {
    expect(applicationRoutesSrc).toContain("router.get('/received'");
    expect(applicationRoutesSrc).toContain("router.put('/:id/status'");
  });

  it('should explicitly mount the admin booking assignment routes used by dashboard assignment tools', () => {
    expect(bookingRoutesSrc).toContain("'/providers/assignable'");
    expect(bookingRoutesSrc).toContain("'/:id/assign'");
  });

  it('should protect the owned rate-limit analytics routes with admin authorization', () => {
    expect(adminMetricsRoutesSrc).toMatch(/router\.get\('\/dashboard\/analytics',\s*protect,\s*authorize\('admin'\)/);
    expect(adminMetricsRoutesSrc).toMatch(/router\.get\('\/rate-limits\/detailed',\s*protect,\s*authorize\('admin'\)/);
    expect(adminMetricsRoutesSrc).toMatch(/router\.get\('\/dashboard\/rate-limits',\s*protect,\s*authorize\('admin'\)/);
  });
});
