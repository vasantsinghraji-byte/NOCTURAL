const fs = require('fs');
const path = require('path');

const readRepoFile = (...segments) => fs.readFileSync(
  path.resolve(__dirname, '..', '..', '..', ...segments),
  'utf8'
);

describe('Numeric rounding standardization', () => {
  it('uses the shared helper for booking numeric writes', () => {
    const src = readRepoFile('services', 'bookingService.js');

    expect(src).toContain("const { roundToTwoDecimals } = require('../utils/number');");
    expect(src).toContain("'professional.rating': roundToTwoDecimals(avgRating)");
    expect(src).toContain('? roundToTwoDecimals((completedBookings / totalBookings) * 100)');
  });

  it('uses the shared helper for numeric analytics and quota response fields', () => {
    const analyticsSrc = readRepoFile('routes', 'analytics.js');
    const analyticsOptimizedSrc = readRepoFile('routes', 'analyticsOptimized.js');
    const uploadSrc = readRepoFile('middleware', 'uploadEnhanced.js');

    expect(analyticsSrc).toContain("const { roundToDecimals } = require('../utils/number');");
    expect(analyticsOptimizedSrc).toContain("const { roundToDecimals } = require('../utils/number');");
    expect(uploadSrc).toContain("const { roundToDecimals } = require('../utils/number');");

    expect(analyticsSrc).toContain('? roundToDecimals(topDoctors.reduce((sum, d) => sum + d.rating, 0) / topDoctors.length, 1)');
    expect(analyticsOptimizedSrc).toContain('? roundToDecimals(topDoctors.reduce((sum, d) => sum + d.rating, 0) / topDoctors.length, 1)');
    expect(uploadSrc).toContain('size: roundToDecimals((quota.totalSize / QUOTA_LIMITS.maxTotalSize) * 100, 1)');
    expect(uploadSrc).toContain('files: roundToDecimals((quota.fileCount / QUOTA_LIMITS.maxFiles) * 100, 1)');
  });
});
