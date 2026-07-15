const { EventEmitter } = require('events');

function deferred() {
  let resolve;
  let reject;
  const promise = new Promise((innerResolve, innerReject) => {
    resolve = innerResolve;
    reject = innerReject;
  });
  return { promise, resolve, reject };
}

function loadServerWithMocks(connectResult) {
  jest.resetModules();

  const mockServer = new EventEmitter();
  mockServer.close = jest.fn(callback => callback());
  const app = {
    listen: jest.fn((_port, callback) => {
      process.nextTick(callback);
      return mockServer;
    })
  };
  const paymentService = {
    startRefundOutboxWorker: jest.fn(),
    stopRefundOutboxWorker: jest.fn()
  };
  const securityNotificationOutboxService = {
    start: jest.fn(),
    stop: jest.fn()
  };
  const auditExportCleanupScheduler = {
    start: jest.fn(),
    stop: jest.fn()
  };
  const auditLifecycleReportCleanupScheduler = {
    start: jest.fn(),
    stop: jest.fn()
  };
  const reconciliationScheduler = {
    start: jest.fn(),
    stop: jest.fn()
  };
  const database = {
    connectDB: jest.fn(() => connectResult),
    disconnectDB: jest.fn().mockResolvedValue()
  };

  jest.doMock('../../../app', () => app);
  jest.doMock('../../../utils/logger', () => ({
    info: jest.fn(),
    error: jest.fn(),
    warn: jest.fn(),
    debug: jest.fn()
  }));
  jest.doMock('../../../utils/monitoring', () => ({
    cleanup: jest.fn()
  }));
  jest.doMock('../../../routes/admin/metrics', () => ({
    cleanup: jest.fn()
  }));
  jest.doMock('../../../services/paymentService', () => paymentService);
  jest.doMock('../../../config/database', () => database);
  jest.doMock('../../../config/rateLimit', () => ({
    cleanup: jest.fn()
  }));
  jest.doMock('../../../config/validateEnv', () => ({
    validateEnvironment: jest.fn()
  }));
  jest.doMock('../../../services/securityNotificationOutboxService', () => securityNotificationOutboxService);
  jest.doMock('../../../services/auditExportCleanupScheduler', () => auditExportCleanupScheduler);
  jest.doMock('../../../services/auditLifecycleReportCleanupScheduler', () => auditLifecycleReportCleanupScheduler);
  jest.doMock('../../../services/reconciliationScheduler', () => reconciliationScheduler);

  const serverModule = require('../../../server');
  return {
    serverModule,
    app,
    database,
    paymentService,
    securityNotificationOutboxService,
    auditExportCleanupScheduler,
    auditLifecycleReportCleanupScheduler,
    reconciliationScheduler
  };
}

describe('server startup database readiness', () => {
  const originalEnv = { ...process.env };

  beforeEach(() => {
    process.env = {
      ...originalEnv,
      NODE_ENV: 'test',
      MONGODB_URI: 'mongodb://localhost:27017/nocturnal_test'
    };
    jest.clearAllMocks();
  });

  afterEach(() => {
    process.env = { ...originalEnv };
    jest.restoreAllMocks();
    jest.resetModules();
  });

  it('does not listen or start workers until database readiness resolves', async () => {
    const dbReady = deferred();
    const {
      serverModule,
      app,
      database,
      paymentService,
      securityNotificationOutboxService
    } = loadServerWithMocks(dbReady.promise);

    const startPromise = serverModule.startServer({
      port: 0,
      registerProcessHandlers: false
    });

    await Promise.resolve();

    expect(database.connectDB).toHaveBeenCalledWith({ failFast: true });
    expect(app.listen).not.toHaveBeenCalled();
    expect(paymentService.startRefundOutboxWorker).not.toHaveBeenCalled();

    dbReady.resolve(true);
    await startPromise;

    expect(app.listen).toHaveBeenCalledTimes(1);
    expect(paymentService.startRefundOutboxWorker).toHaveBeenCalledTimes(1);
    expect(securityNotificationOutboxService.start).toHaveBeenCalledTimes(1);

    await serverModule.stopServer();
  });

  it('rejects startup without listening or starting workers when database readiness fails', async () => {
    const startupError = new Error('MongoDB unavailable');
    const {
      serverModule,
      app,
      paymentService,
      reconciliationScheduler
    } = loadServerWithMocks(Promise.reject(startupError));

    await expect(serverModule.startServer({
      port: 0,
      registerProcessHandlers: false
    })).rejects.toThrow('MongoDB unavailable');

    expect(app.listen).not.toHaveBeenCalled();
    expect(paymentService.startRefundOutboxWorker).not.toHaveBeenCalled();
    expect(reconciliationScheduler.start).not.toHaveBeenCalled();
  });

  it('preserves explicit no-database startup for production smoke tests', async () => {
    const {
      serverModule,
      app,
      database,
      paymentService,
      securityNotificationOutboxService,
      auditExportCleanupScheduler,
      auditLifecycleReportCleanupScheduler,
      reconciliationScheduler
    } = loadServerWithMocks(Promise.resolve(true));

    await serverModule.startServer({
      port: 0,
      registerProcessHandlers: false,
      connectDatabase: false
    });

    expect(database.connectDB).not.toHaveBeenCalled();
    expect(app.listen).toHaveBeenCalledTimes(1);
    expect(paymentService.startRefundOutboxWorker).not.toHaveBeenCalled();
    expect(securityNotificationOutboxService.start).not.toHaveBeenCalled();
    expect(auditExportCleanupScheduler.start).not.toHaveBeenCalled();
    expect(auditLifecycleReportCleanupScheduler.start).not.toHaveBeenCalled();
    expect(reconciliationScheduler.start).not.toHaveBeenCalled();

    await serverModule.stopServer();
  });
});
