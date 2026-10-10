const VALIDATED_QUERY_UPDATE_OPTIONS = Object.freeze({
  new: true,
  runValidators: true,
  context: 'query'
});

// Multi-document transactions must read from the primary. The connection's
// default read preference (primaryPreferred, config/database.js) is refused by
// MongoDB inside a transaction, so every withTransaction passes these.
const TRANSACTION_OPTIONS = Object.freeze({
  readPreference: 'primary',
  readConcern: { level: 'majority' },
  writeConcern: { w: 'majority' }
});

module.exports = {
  VALIDATED_QUERY_UPDATE_OPTIONS,
  TRANSACTION_OPTIONS
};
