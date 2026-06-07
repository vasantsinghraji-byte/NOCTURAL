const FunnelDailyMetric = require('../models/funnelDailyMetric');
const logger = require('../utils/logger');

const MAX_VALUE_LENGTH = 300;

const normalizeValue = (value, fallback = '') => {
  const normalized = String(value || fallback).trim();
  return normalized.slice(0, MAX_VALUE_LENGTH) || fallback;
};

const toDayKey = (value = new Date()) => new Date(value).toISOString().slice(0, 10);

const incrementEvent = async ({ event, path, target = '', occurredAt = new Date() }) => {
  const eventName = normalizeValue(event, 'unknown_event').slice(0, 80);
  const pagePath = normalizeValue(path, '/');
  const targetPath = normalizeValue(target);
  const day = toDayKey(occurredAt);

  try {
    await FunnelDailyMetric.updateOne(
      {
        day,
        event: eventName,
        path: pagePath,
        target: targetPath
      },
      {
        $inc: { count: 1 },
        $set: { lastSeenAt: occurredAt }
      },
      { upsert: true }
    );
  } catch (error) {
    logger.warn('Funnel analytics event was not persisted', {
      event: eventName,
      path: pagePath,
      target: targetPath,
      error: error.message
    });
  }
};

const getDailyReport = async ({ days = 30, event, path } = {}) => {
  const boundedDays = Math.min(Math.max(Number(days) || 30, 1), 180);
  const since = new Date();
  since.setUTCDate(since.getUTCDate() - boundedDays + 1);
  const sinceDay = toDayKey(since);

  const filter = { day: { $gte: sinceDay } };
  if (event) filter.event = event;
  if (path) filter.path = path;

  const rows = await FunnelDailyMetric.find(filter)
    .sort({ day: -1, event: 1, path: 1 })
    .lean();

  const totals = rows.reduce((acc, row) => ({
    ...acc,
    [row.event]: (acc[row.event] || 0) + row.count
  }), {});

  return { rows, totals };
};

module.exports = {
  incrementEvent,
  getDailyReport
};
