describe('Database idempotency index startup contract', () => {
  const loadDatabaseModule = ({ indexes, readyState = 0 } = {}) => {
    const collection = {
      createIndex: jest.fn().mockResolvedValue('created'),
      indexes: jest.fn().mockResolvedValue(indexes || [
        { name: '_id_' },
        { name: 'scope_unique_idx', unique: true },
        { name: 'idempotency_ttl_idx', expireAfterSeconds: 86400 }
      ])
    };
    const mockMongoose = {
      connect: jest.fn().mockResolvedValue(),
      connection: {
        readyState,
        db: {
          collection: jest.fn(() => collection)
        },
        on: jest.fn(),
        close: jest.fn().mockResolvedValue()
      }
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
    const mockIdempotencyIndexes = {
      markReady: jest.fn(),
      markUnavailable: jest.fn()
    };

    let databaseModule;
    jest.isolateModules(() => {
      jest.doMock('mongoose', () => mockMongoose);
      jest.doMock('../../../utils/logger', () => mockLogger);
      jest.doMock('../../../utils/monitoring', () => mockMonitoring);
      jest.doMock('../../../config/idempotencyIndexes', () => mockIdempotencyIndexes);
      databaseModule = require('../../../config/database');
    });

    return { databaseModule, collection, mockLogger, mockMonitoring, mockIdempotencyIndexes, mockMongoose };
  };

  beforeEach(() => {
    jest.resetModules();
    jest.clearAllMocks();
    process.env.IDEMPOTENCY_TTL_SECONDS = '86400';
  });

  afterEach(() => {
    delete process.env.IDEMPOTENCY_TTL_SECONDS;
    jest.restoreAllMocks();
  });

  it('creates and verifies the production idempotency indexes', async () => {
    const { databaseModule, collection, mockLogger, mockIdempotencyIndexes } = loadDatabaseModule();

    await databaseModule.ensureIdempotencyIndexes();

    expect(collection.createIndex).toHaveBeenNthCalledWith(1, { scope: 1 }, {
      name: 'scope_unique_idx',
      unique: true,
      background: true
    });
    expect(collection.createIndex).toHaveBeenCalledTimes(1);
    expect(mockIdempotencyIndexes.markReady).toHaveBeenCalledTimes(1);
    expect(mockLogger.info).toHaveBeenCalledWith('Idempotency indexes verified', {
      uniqueScope: true,
      retentionSeconds: 86400
    });
  });

  it('fails verification when the unique claim index is not unique', async () => {
    const { databaseModule } = loadDatabaseModule({
      indexes: [
        { name: 'scope_unique_idx', unique: false },
        { name: 'idempotency_ttl_idx', expireAfterSeconds: 86400 }
      ]
    });

    await expect(databaseModule.ensureIdempotencyIndexes())
      .rejects.toThrow('Idempotency index verification failed');
  });

  it('keeps the database connected but disables protected mutations when verification fails', async () => {
    const { databaseModule, collection, mockMonitoring, mockIdempotencyIndexes, mockMongoose } = loadDatabaseModule({
      readyState: 1,
      indexes: [
        { name: 'scope_unique_idx', unique: false },
        { name: 'idempotency_ttl_idx', expireAfterSeconds: 86400 }
      ]
    });

    await databaseModule.connectDB();

    expect(collection.indexes).toHaveBeenCalled();
    expect(databaseModule.isConnected()).toBe(true);
    expect(mockMongoose.connection.close).not.toHaveBeenCalled();
    expect(mockIdempotencyIndexes.markUnavailable).toHaveBeenCalled();
    expect(mockMonitoring.triggerAlert).toHaveBeenCalledWith(
      'idempotency_indexes_unavailable',
      expect.objectContaining({ error: expect.any(String) })
    );
  });

  it('reports a TTL mismatch before attempting a conflicting createIndex', async () => {
    const { databaseModule, collection, mockIdempotencyIndexes } = loadDatabaseModule({
      indexes: [
        { name: 'scope_unique_idx', unique: true },
        { name: 'idempotency_ttl_idx', expireAfterSeconds: 3600 }
      ]
    });

    await expect(databaseModule.ensureIdempotencyIndexes())
      .rejects.toThrow('update it with collMod before deployment');

    expect(collection.createIndex).toHaveBeenCalledTimes(1);
    expect(collection.createIndex).toHaveBeenCalledWith(
      { scope: 1 },
      expect.objectContaining({ name: 'scope_unique_idx', unique: true })
    );
    expect(mockIdempotencyIndexes.markUnavailable).toHaveBeenCalled();
  });
});
