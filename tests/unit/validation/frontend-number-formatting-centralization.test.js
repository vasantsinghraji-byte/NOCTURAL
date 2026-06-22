const path = require('path');
const {
  fs,
  frontendJsFilePaths,
  toProjectRelativePath
} = require('./frontend-validation-utils');

describe('Frontend Number Formatting Centralization', () => {
  it('should expose shared AppFormat helpers from config.js', () => {
    const configPath = path.resolve(__dirname, '..', '..', '..', 'client', 'public', 'js', 'config.js');
    const source = fs.readFileSync(configPath, 'utf8');

    expect(source).toContain('const AppFormat = {');
    expect(source).toContain('decimal: function(value, decimals = 0, fallback = 0)');
    expect(source).toContain('percent: function(value, decimals = 0, fallback = 0)');
    expect(source).toContain('currency: function(value, decimals = 2, symbol =');
    expect(source).toContain("currencyWhole: function(value, symbol = '\\u20B9', locale = 'en-IN', fallback = 0)");
    expect(source).toContain("currencyCode: function(value, currency = 'INR', locale = 'en-IN', fallback = 0)");
    expect(source).toContain('currencyCompactThousands: function(value, decimals = 0, symbol =');
    expect(source).toContain('megabytes: function(bytes, decimals = 2)');
    expect(source).toContain("date: function(value, locale = 'en-US', options = {})");
    expect(source).toContain("dateTime: function(value, timeValue = '', locale = 'en-US', options = {}, separator = ' at ')");
    expect(source).toContain("timeInZone: function(dateValue, timeValue = '', timeZone = 'UTC', offsetMinutes = 0, locale = 'en-US', options = {})");
    expect(source).toContain("hours: function(value, suffix = 'h', decimals = 0, fallback = 0)");
    expect(source).toContain('window.AppFormat = AppFormat;');
  });

  it('should keep display-only rounding centralized outside config.js', () => {
    const directToFixedOffenders = frontendJsFilePaths
      .filter((absolutePath) => path.basename(absolutePath) !== 'config.js')
      .map((absolutePath) => ({
        absolutePath,
        relativePath: toProjectRelativePath(absolutePath),
        source: fs.readFileSync(absolutePath, 'utf8')
      }))
      .filter(({ source }) => source.includes('.toFixed('))
      .map(({ relativePath }) => relativePath)
      .sort();

    expect(directToFixedOffenders).toEqual([]);
  });

  it('should route representative percentage and date displays through AppFormat helpers', () => {
    const projectRoot = path.resolve(__dirname, '..', '..', '..');
    const fileAssertions = [
      {
        relativePath: path.join('client', 'public', 'js', 'admin-analytics.js'),
        expectedSnippet: 'AppFormat.percent(data.keyMetrics?.fillRate || 0)'
      },
      {
        relativePath: path.join('client', 'public', 'js', 'doctor-profile-enhanced.js'),
        expectedSnippet: 'AppFormat.percent(user.completionRate || 100)'
      },
      {
        relativePath: path.join('client', 'public', 'js', 'patient-booking-details.js'),
        expectedSnippet: "AppFormat.date(booking.scheduledDate, 'en-IN', {"
      },
      {
        relativePath: path.join('client', 'public', 'js', 'patient-booking-details.js'),
        expectedSnippet: 'AppFormat.timeInZone('
      },
      {
        relativePath: path.join('client', 'public', 'js', 'provider-dashboard.js'),
        expectedSnippet: 'AppFormat.date(booking.scheduledDate)'
      },
      {
        relativePath: path.join('client', 'public', 'js', 'provider-dashboard.js'),
        expectedSnippet: 'AppFormat.timeInZone(booking.scheduledDate, booking.scheduledTime, booking.scheduledTimezone, booking.scheduledTimezoneOffsetMinutes)'
      },
      {
        relativePath: path.join('client', 'public', 'js', 'patient-dashboard.js'),
        expectedSnippet: 'AppFormat.timeInZone(booking.scheduledDate, booking.scheduledTime, booking.scheduledTimezone, booking.scheduledTimezoneOffsetMinutes)'
      },
      {
        relativePath: path.join('client', 'public', 'js', 'admin-dashboard.js'),
        expectedSnippet: 'AppFormat.timeInZone('
      },
      {
        relativePath: path.join('client', 'public', 'js', 'doctor-earnings.js'),
        expectedSnippet: "AppFormat.hours(data.currentMonth.hoursWorked, ' hrs')"
      },
      {
        relativePath: path.join('client', 'public', 'js', 'admin-settings.js'),
        expectedSnippet: 'AppFormat.currencyWhole(budget.monthlyBudget)'
      },
      {
        relativePath: path.join('client', 'public', 'js', 'utils.js'),
        expectedSnippet: "return AppFormat.date(dateString, 'en-US', {"
      },
      {
        relativePath: path.join('client', 'public', 'js', 'utils.js'),
        expectedSnippet: "return AppFormat.currencyCode(amount, currency, 'en-IN');"
      }
    ];

    fileAssertions.forEach(({ relativePath, expectedSnippet }) => {
      const absolutePath = path.resolve(projectRoot, relativePath);
      const source = fs.readFileSync(absolutePath, 'utf8');
      expect(source).toContain(expectedSnippet);
    });
  });
});
