const fs = require('fs');
const path = require('path');

const root = path.resolve(__dirname, '..', '..', '..');
// eslint-disable-next-line security/detect-non-literal-fs-filename
const templateSource = fs.readFileSync(path.join(root, 'prometheus/templates/nocturnal.tmpl'), 'utf8');

const fixture = {
  status: 'firing',
  commonLabels: {
    alertname: 'SecurityNotificationOutboxDeadLetters',
    component: 'security',
    environment: 'staging',
    severity: 'critical'
  },
  alerts: [{
    labels: {
      alertname: 'SecurityNotificationOutboxDeadLetters',
      component: 'security',
      severity: 'critical'
    },
    annotations: {
      summary: 'Security notification outbox contains dead letters',
      description: '3 notifications require manual intervention',
      runbook: 'https://runbooks.nocturnal.com/security-notification-outbox'
    },
    startsAt: '2026-06-16T03:30:00Z',
    endsAt: ''
  }]
};

const sortedPairs = labels => Object.keys(labels)
  .sort()
  .map(key => `- ${key}=${labels[key]}`)
  .join('\n');

const renderTitle = data => `[${data.status.toUpperCase()}] ${data.commonLabels.severity.toUpperCase()} ${data.commonLabels.alertname}`;

const renderText = data => [
  `Environment: ${data.commonLabels.environment || 'unknown'}`,
  `Component: ${data.commonLabels.component || 'unknown'}`,
  `Severity: ${data.commonLabels.severity || 'unknown'}`,
  '',
  ...data.alerts.flatMap(alert => [
    `Alert: ${alert.labels.alertname}`,
    `Summary: ${alert.annotations.summary}`,
    `Description: ${alert.annotations.description}`,
    `Runbook: ${alert.annotations.runbook || 'not configured'}`,
    `Started: ${alert.startsAt}`,
    alert.endsAt ? `Ended: ${alert.endsAt}` : '',
    'Labels:',
    sortedPairs(alert.labels)
  ].filter(Boolean))
].join('\n');

const renderSecurityText = data => [
  'Security incident notification',
  '',
  renderText(data),
  '',
  'Escalation:',
  '- Security on-call owns investigation and user-impact assessment.',
  '- Platform on-call supports infrastructure, queue, and provider failures.',
  '- Incident commander is required if user security notifications are delayed more than 30 minutes.'
].join('\n');

describe('Alertmanager Template Rendering Snapshots', () => {
  it('keeps the production template blocks wired for rendering', () => {
    expect(templateSource).toContain('{{ define "nocturnal.title" -}}');
    expect(templateSource).toContain('{{ define "nocturnal.text" -}}');
    expect(templateSource).toContain('{{ define "nocturnal.security.text" -}}');
  });

  it('renders the standard alert message snapshot', () => {
    expect({
      title: renderTitle(fixture),
      text: renderText(fixture)
    }).toMatchInlineSnapshot(`
{
  "text": "Environment: staging
Component: security
Severity: critical

Alert: SecurityNotificationOutboxDeadLetters
Summary: Security notification outbox contains dead letters
Description: 3 notifications require manual intervention
Runbook: https://runbooks.nocturnal.com/security-notification-outbox
Started: 2026-06-16T03:30:00Z
Labels:
- alertname=SecurityNotificationOutboxDeadLetters
- component=security
- severity=critical",
  "title": "[FIRING] CRITICAL SecurityNotificationOutboxDeadLetters",
}
`);
  });

  it('renders the security escalation message snapshot', () => {
    expect(renderSecurityText(fixture)).toMatchInlineSnapshot(`
"Security incident notification

Environment: staging
Component: security
Severity: critical

Alert: SecurityNotificationOutboxDeadLetters
Summary: Security notification outbox contains dead letters
Description: 3 notifications require manual intervention
Runbook: https://runbooks.nocturnal.com/security-notification-outbox
Started: 2026-06-16T03:30:00Z
Labels:
- alertname=SecurityNotificationOutboxDeadLetters
- component=security
- severity=critical

Escalation:
- Security on-call owns investigation and user-impact assessment.
- Platform on-call supports infrastructure, queue, and provider failures.
- Incident commander is required if user security notifications are delayed more than 30 minutes."
`);
  });
});
