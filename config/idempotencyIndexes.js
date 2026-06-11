let ready = false;
let lastError = 'Idempotency indexes have not been verified';

const markReady = () => {
  ready = true;
  lastError = null;
};

const markUnavailable = (error) => {
  ready = false;
  lastError = error instanceof Error ? error.message : String(error);
};

module.exports = {
  isReady: () => ready,
  getLastError: () => lastError,
  markReady,
  markUnavailable
};
