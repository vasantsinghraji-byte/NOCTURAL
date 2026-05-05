const fs = require('fs');
const path = require('path');

const rootDir = path.resolve(__dirname, '..', '..', '..');

const readProjectFile = (relativePath) => fs.readFileSync(path.join(rootDir, relativePath), 'utf8');

const dutyRoutesSrc = readProjectFile('routes/duties.js');
const applicationRoutesSrc = readProjectFile('routes/applications.js');
const bookingRoutesSrc = readProjectFile('routes/booking.js');

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
});
