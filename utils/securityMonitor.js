/**
 * Security Monitoring Utility
 * Tracks security events, threats, and generates alerts
 */

const logger = require('./logger');
const monitoring = require('./monitoring');

// In-memory storage for security events (use Redis/MongoDB in production)
const securityEvents = [];
const incidents = [];
const blockedIPs = new Map();
const auditLog = [];
const threatIntelligence = {
  sqlInjection: 0,
  xss: 0,
  pathTraversal: 0,
  commandInjection: 0,
  bruteForce: 0,
  ddos: 0,
  suspiciousActivity: 0
};

/**
 * Log security event
 */
function logSecurityEvent(event) {
  const securityEvent = {
    id: generateId(),
    timestamp: new Date(),
    ...event
  };

  securityEvents.push(securityEvent);

  // Keep only last 10000 events
  if (securityEvents.length > 10000) {
    securityEvents.shift();
  }

  // Update threat intelligence
  if (event.threatType) {
    threatIntelligence[event.threatType] = (threatIntelligence[event.threatType] || 0) + 1;
  }

  // Check if this should create an incident
  if (event.severity === 'critical' || event.severity === 'high') {
    createIncident(event);
  }

  logger.warn('Security event logged', securityEvent);
}

/**
 * Create security incident
 */
function createIncident(event) {
  const incident = {
    id: generateId(),
    createdAt: new Date(),
    severity: event.severity || 'medium',
    status: 'open',
    type: event.type || 'unknown',
    description: event.description || event.message,
    ip: event.ip,
    userId: event.userId,
    endpoint: event.endpoint,
    details: event,
    actions: [],
    resolvedAt: null,
    resolvedBy: null,
    resolution: null
  };

  incidents.push(incident);

  // Keep only last 1000 incidents
  if (incidents.length > 1000) {
    incidents.shift();
  }

  // Send alert for critical incidents
  if (incident.severity === 'critical') {
    monitoring.triggerAlert('critical_security_incident', incident);
  }

  logger.error('Security incident created', incident);

  return incident;
}

/**
 * Get dashboard overview
 */
async function getDashboard() {
  const now = new Date();
  const last24h = new Date(now - 24 * 60 * 60 * 1000);

  // Count events in last 24 hours
  const recentEvents = securityEvents.filter(e => e.timestamp > last24h);

  // Count open incidents
  const openIncidents = incidents.filter(i => i.status === 'open');

  // Get severity breakdown
  const severityBreakdown = {
    critical: 0,
    high: 0,
    medium: 0,
    low: 0
  };

  openIncidents.forEach(incident => {
    severityBreakdown[incident.severity]++;
  });

  // Top threat types
  const threatTypes = Object.entries(threatIntelligence)
    .sort(([, a], [, b]) => b - a)
    .slice(0, 5)
    .map(([type, count]) => ({ type, count }));

  // Top attacking IPs
  const ipCounts = {};
  recentEvents.forEach(event => {
    if (event.ip) {
      ipCounts[event.ip] = (ipCounts[event.ip] || 0) + 1;
    }
  });

  const topAttackers = Object.entries(ipCounts)
    .sort(([, a], [, b]) => b - a)
    .slice(0, 10)
    .map(([ip, count]) => ({ ip, count }));

  return {
    summary: {
      totalEventsLast24h: recentEvents.length,
      openIncidents: openIncidents.length,
      blockedIPs: blockedIPs.size,
      criticalIncidents: severityBreakdown.critical,
      highSeverityIncidents: severityBreakdown.high
    },
    severityBreakdown,
    threatTypes,
    topAttackers,
    recentIncidents: incidents.slice(-10).reverse(),
    healthStatus: getHealthStatus()
  };
}

/**
 * Get security metrics
 */
async function getMetrics(timeRange = '24h') {
  const duration = parseTimeRange(timeRange);
  const cutoff = new Date(Date.now() - duration);

  const recentEvents = securityEvents.filter(e => e.timestamp > cutoff);

  // Group by hour
  const hourlyMetrics = {};
  recentEvents.forEach(event => {
    const hour = new Date(event.timestamp).setMinutes(0, 0, 0);
    hourlyMetrics[hour] = (hourlyMetrics[hour] || 0) + 1;
  });

  // Convert to array format
  const metrics = Object.entries(hourlyMetrics)
    .sort(([a], [b]) => a - b)
    .map(([timestamp, count]) => ({
      timestamp: new Date(parseInt(timestamp)),
      count
    }));

  // Event types breakdown
  const eventTypes = {};
  recentEvents.forEach(event => {
    eventTypes[event.type] = (eventTypes[event.type] || 0) + 1;
  });

  return {
    timeRange,
    totalEvents: recentEvents.length,
    hourlyMetrics: metrics,
    eventTypes,
    averageEventsPerHour: recentEvents.length / (duration / (60 * 60 * 1000))
  };
}

/**
 * Get incidents
 */
async function getIncidents({ severity, status, page = 1, limit = 50 }) {
  let filteredIncidents = [...incidents];

  if (severity) {
    filteredIncidents = filteredIncidents.filter(i => i.severity === severity);
  }

  if (status) {
    filteredIncidents = filteredIncidents.filter(i => i.status === status);
  }

  // Sort by date (newest first)
  filteredIncidents.sort((a, b) => b.createdAt - a.createdAt);

  // Paginate
  const startIndex = (page - 1) * limit;
  const endIndex = startIndex + limit;
  const paginatedIncidents = filteredIncidents.slice(startIndex, endIndex);

  return {
    data: paginatedIncidents,
    pagination: {
      page,
      limit,
      total: filteredIncidents.length,
      pages: Math.ceil(filteredIncidents.length / limit)
    }
  };
}

/**
 * Get incident by ID
 */
async function getIncidentById(id) {
  return incidents.find(i => i.id === id);
}

/**
 * Resolve incident
 */
async function resolveIncident(id, { resolution, notes, resolvedBy }) {
  const incident = incidents.find(i => i.id === id);

  if (!incident) {
    throw new Error('Incident not found');
  }

  incident.status = 'resolved';
  incident.resolvedAt = new Date();
  incident.resolvedBy = resolvedBy;
  incident.resolution = resolution;

  incident.actions.push({
    timestamp: new Date(),
    action: 'resolved',
    userId: resolvedBy,
    notes
  });

  logger.info('Incident resolved', { incidentId: id, resolvedBy });

  return incident;
}

/**
 * Get blocked IPs
 */
async function getBlockedIPs() {
  return Array.from(blockedIPs.entries()).map(([ip, data]) => ({
    ip,
    ...data
  }));
}

/**
 * Block IP address
 */
async function blockIP(ip, { reason, duration, blockedBy }) {
  blockedIPs.set(ip, {
    reason,
    blockedAt: new Date(),
    blockedBy,
    expiresAt: duration ? new Date(Date.now() + duration) : null
  });

  logSecurityEvent({
    type: 'ip_blocked',
    severity: 'medium',
    ip,
    message: `IP ${ip} has been blocked`,
    reason,
    blockedBy
  });

  // Auto-unblock after duration
  if (duration) {
    setTimeout(() => {
      unblockIP(ip);
    }, duration);
  }

  logger.warn('IP blocked', { ip, reason, blockedBy });
}

/**
 * Unblock IP address
 */
async function unblockIP(ip) {
  blockedIPs.delete(ip);

  logSecurityEvent({
    type: 'ip_unblocked',
    severity: 'low',
    ip,
    message: `IP ${ip} has been unblocked`
  });

  logger.info('IP unblocked', { ip });
}

/**
 * Check if IP is blocked
 */
function isIPBlocked(ip) {
  const blocked = blockedIPs.get(ip);

  if (!blocked) {
    return false;
  }

  // Check if block expired
  if (blocked.expiresAt && blocked.expiresAt < new Date()) {
    blockedIPs.delete(ip);
    return false;
  }

  return true;
}

/**
 * Get threat summary
 */
async function getThreatSummary() {
  return {
    totalThreats: Object.values(threatIntelligence).reduce((a, b) => a + b, 0),
    byType: threatIntelligence,
    topThreats: Object.entries(threatIntelligence)
      .sort(([, a], [, b]) => b - a)
      .slice(0, 5)
      .map(([type, count]) => ({ type, count }))
  };
}

/**
 * Get audit log
 */
async function getAuditLog({ action, userId, page = 1, limit = 100 }) {
  let filteredLog = [...auditLog];

  if (action) {
    filteredLog = filteredLog.filter(entry => entry.action === action);
  }

  if (userId) {
    filteredLog = filteredLog.filter(entry => entry.userId === userId);
  }

  // Sort by date (newest first)
  filteredLog.sort((a, b) => b.timestamp - a.timestamp);

  // Paginate
  const startIndex = (page - 1) * limit;
  const endIndex = startIndex + limit;
  const paginatedLog = filteredLog.slice(startIndex, endIndex);

  return {
    data: paginatedLog,
    pagination: {
      page,
      limit,
      total: filteredLog.length,
      pages: Math.ceil(filteredLog.length / limit)
    }
  };
}

/**
 * Log audit event
 */
function logAuditEvent(event) {
  const auditEvent = {
    id: generateId(),
    timestamp: new Date(),
    ...event
  };

  auditLog.push(auditEvent);

  // Keep only last 10000 entries
  if (auditLog.length > 10000) {
    auditLog.shift();
  }
}

/**
 * Get security health status
 */
function getHealthStatus() {
  const openIncidents = incidents.filter(i => i.status === 'open');
  const criticalIncidents = openIncidents.filter(i => i.severity === 'critical');

  let status = 'healthy';
  let message = 'All security systems operating normally';

  if (criticalIncidents.length > 0) {
    status = 'critical';
    message = `${criticalIncidents.length} critical incident(s) require attention`;
  } else if (openIncidents.length > 10) {
    status = 'warning';
    message = `${openIncidents.length} open incidents`;
  } else if (openIncidents.length > 5) {
    status = 'degraded';
    message = `${openIncidents.length} open incidents`;
  }

  return {
    status,
    message,
    openIncidents: openIncidents.length,
    criticalIncidents: criticalIncidents.length,
    blockedIPs: blockedIPs.size,
    lastUpdated: new Date()
  };
}

/**
 * Helper: Generate unique ID
 */
function generateId() {
  return `${Date.now()}-${Math.random().toString(36).substr(2, 9)}`;
}

/**
 * Helper: Parse time range
 */
function parseTimeRange(range) {
  const units = {
    h: 60 * 60 * 1000,
    d: 24 * 60 * 60 * 1000,
    w: 7 * 24 * 60 * 60 * 1000
  };

  const match = range.match(/^(\d+)([hdw])$/);
  if (!match) {
    return 24 * 60 * 60 * 1000; // Default 24 hours
  }

  const [, value, unit] = match;
  return parseInt(value) * (units[unit] || units.h);
}

module.exports = {
  logSecurityEvent,
  createIncident,
  getDashboard,
  getMetrics,
  getIncidents,
  getIncidentById,
  resolveIncident,
  getBlockedIPs,
  blockIP,
  unblockIP,
  isIPBlocked,
  getThreatSummary,
  getAuditLog,
  logAuditEvent,
  getHealthStatus
};
