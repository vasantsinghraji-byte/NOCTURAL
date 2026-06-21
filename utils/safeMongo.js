const mongoose = require('mongoose');

const SAFE_FIELD_NAME = /^[A-Za-z][A-Za-z0-9_.-]{0,127}$/;
const BLOCKED_FIELD_SEGMENTS = new Set(['__proto__', 'prototype', 'constructor']);

const isSafeFieldName = (field) => {
  if (typeof field !== 'string' || !SAFE_FIELD_NAME.test(field)) return false;
  return field.split('.').every(segment => segment && !BLOCKED_FIELD_SEGMENTS.has(segment));
};

const normalizeObjectId = (value, fieldName = 'id') => {
  const stringValue = typeof value === 'string' ? value.trim() : String(value || '');
  if (!mongoose.Types.ObjectId.isValid(stringValue)) {
    const error = new Error(`Invalid ${fieldName}`);
    error.statusCode = 400;
    throw error;
  }
  return new mongoose.Types.ObjectId(stringValue);
};

const normalizeOptionalObjectId = (value, fieldName = 'id') => (
  value === undefined || value === null || value === ''
    ? undefined
    : normalizeObjectId(value, fieldName)
);

const escapeRegExp = (value) => String(value || '').replace(/[\\^$.*+?()[\]{}|]/g, '\\$&');

const safeCaseInsensitiveRegex = (value, maxLength = 80) => {
  const trimmed = String(value || '').trim().slice(0, maxLength);
  return trimmed ? new RegExp(escapeRegExp(trimmed), 'i') : null;
};

const nullProtoObject = () => Object.create(null);

const setSafeField = (target, field, value) => {
  if (!isSafeFieldName(field)) return false;
  Object.defineProperty(target, field, {
    value,
    enumerable: true,
    configurable: true,
    writable: true
  });
  return true;
};

module.exports = {
  escapeRegExp,
  isSafeFieldName,
  normalizeObjectId,
  normalizeOptionalObjectId,
  nullProtoObject,
  safeCaseInsensitiveRegex,
  setSafeField
};
