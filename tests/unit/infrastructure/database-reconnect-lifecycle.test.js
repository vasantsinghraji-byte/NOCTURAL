describe('Database reconnect lifecycle', () => {
  const loadDatabaseModule = () => {
    const eventHandlers = {};
    const mockAdmin = {
      serverStatus: jest.fn().mockResolvedValue({
        connections: {
          totalCreated: 3,
          current: 2,
          available: 8
        }
      })
    };
    const mockConnection = {
      db: {
        command: jest.fn().mockResolvedValue({ ok: 1 }),
        admin: jest.fn(() => mockAdmin)
      },
      on: jest.fn((event, handler) => {
        eventHandlers[event] = handler;
      }),
      close: jest.fn().mockResolvedValue()
    };
    const mockMongoose = {
      connect: jest.fn().mockResolvedValue(),
      connection: mockConnection
    };
    const mockLogger = {
      error: jest.fn(),
      warn: jest.fn(),
      info: jest.fn(),
      debug: jest.fn(),
      logSecurity: jest.fn()
    };
    const mockMonitoring = {
      trackError: jest.fn(),
      triggerAlert: jest.fn()
    };

    let databaseModule;

    jest.isolateModules(() => {
      jest.doMock('mongoose', () => mockMongoose);
      jest.doMock('../../../utils/logger', () => mockLogger);
      jest.doMock('../../../utils/monitoring', () => mockMonitoring);

      databaseModule = require('../../../config/database');
    });

    return {
      databaseModule,
      eventHandlers,
      mockMongoose,
      mockConnection,
      mockLogger,
      mockMonitoring
    };
  };

  beforeEach(() => {
    jest.resetModules();
    jest.clearAllMocks();
    process.env.MONGODB_URI = 'mongodb://user:password@localhost:27017/nocturnal';
    process.env.NODE_ENV = 'test';
  });

  afterEach(() => {
    delete process.env.MONGODB_URI;
    delete process.env.NODE_ENV;
    jest.restoreAllMocks();
  });

  it('should register connection listeners and the health check timer only once across reconnects', async () => {
    const intervalHandle = { id: 'db-health-check' };
    const setIntervalSpy = jest.spyOn(global, 'setInterval').mockReturnValue(intervalHandle);
    const clearIntervalSpy = jest.spyOn(global, 'clearInterval').mockImplementation(() => {});
    const setTimeoutSpy = jest.spyOn(global, 'setTimeout').mockImplementation(() => ({ id: 'reconnect-timeout' }));
    const clearTimeoutSpy = jest.spyOn(global, 'clearTimeout').mockImplementation(() => {});

    const { databaseModule, mockConnection, mockMongoose, mockLogger } = loadDatabaseModule();

    await databaseModule.connectDB();
    await databaseModule.connectDB();

    expect(mockMongoose.connect).toHaveBeenCalledTimes(2);
    expect(mockConnection.on).toHaveBeenCalledTimes(4);
    expect(mockConnection.on).toHaveBeenNthCalledWith(1, 'error', expect.any(Function));
    expect(mockConnection.on).toHaveBeenNthCalledWith(2, 'disconnected', expect.any(Function));
    expect(mockConnection.on).toHaveBeenNthCalledWith(3, 'connected', expect.any(Function));
    expect(mockConnection.on).toHaveBeenNthCalledWith(4, 'reconnected', expect.any(Function));
    expect(setIntervalSpy).toHaveBeenCalledTimes(1);
    expect(clearIntervalSpy).not.toHaveBeenCalled();
    expect(setTimeoutSpy).not.toHaveBeenCalled();
    expect(clearTimeoutSpy).not.toHaveBeenCalled();
    expect(
      mockLogger.info.mock.calls.filter(([message]) => message === 'MongoDB Connected')
    ).toHaveLength(2);
    expect(
      mockLogger.info.mock.calls.filter(([message]) => message === 'MongoDB Connected successfully')
    ).toHaveLength(0);
  });

  it('should clear timers during shutdown and avoid scheduling reconnects after intentional disconnect', async () => {
    const intervalHandle = { id: 'db-health-check' };
    const timeoutHandles = [];
    const setIntervalSpy = jest.spyOn(global, 'setInterval').mockReturnValue(intervalHandle);
    const clearIntervalSpy = jest.spyOn(global, 'clearInterval').mockImplementation(() => {});
    const setTimeoutSpy = jest.spyOn(global, 'setTimeout').mockImplementation((fn, ms) => {
      const handle = { fn, ms };
      timeoutHandles.push(handle);
      return handle;
    });
    const clearTimeoutSpy = jest.spyOn(global, 'clearTimeout').mockImplementation(() => {});

    const { databaseModule, eventHandlers, mockConnection, mockLogger } = loadDatabaseModule();

    await databaseModule.connectDB();
    eventHandlers.disconnected();

    expect(setIntervalSpy).toHaveBeenCalledTimes(1);
    expect(setTimeoutSpy).toHaveBeenCalledTimes(1);
    expect(
      mockLogger.warn.mock.calls.filter(([message]) => message === 'MongoDB disconnected')
    ).toHaveLength(1);

    await databaseModule.disconnectDB();

    expect(mockConnection.close).toHaveBeenCalledTimes(1);
    expect(clearIntervalSpy).toHaveBeenCalledWith(intervalHandle);
    expect(clearTimeoutSpy).toHaveBeenCalledWith(timeoutHandles[0]);

    eventHandlers.reconnected();
    expect(
      mockLogger.info.mock.calls.filter(([message]) => message === 'MongoDB reconnected')
    ).toHaveLength(1);

    eventHandlers.disconnected();

    expect(setTimeoutSpy).toHaveBeenCalledTimes(1);
    expect(
      mockLogger.warn.mock.calls.filter(([message]) => message === 'MongoDB disconnected')
    ).toHaveLength(2);
  });
});
