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

    let databaseModule;
    jest.isolateModules(() => {
      jest.doMock('mongoose', () => mockMongoose);
      jest.doMock('../../../utils/logger', () => mockLogger);
      jest.doMock('../../../utils/monitoring', () => ({
        trackError: jest.fn(),
        triggerAlert: jest.fn()
      }));
      databaseModule = require('../../../config/database');
    });

    return { databaseModule, collection, mockLogger };
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
    const { databaseModule, collection, mockLogger } = loadDatabaseModule();

    await databaseModule.ensureIdempotencyIndexes();

    expect(collection.createIndex).toHaveBeenNthCalledWith(1, { scope: 1 }, {
      name: 'scope_unique_idx',
      unique: true,
      background: true
    });
    expect(collection.createIndex).toHaveBeenNthCalledWith(2, { createdAt: 1 }, {
      name: 'idempotency_ttl_idx',
      expireAfterSeconds: 86400,
      background: true
    });
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

  it('closes the connection when startup index verification fails', async () => {
    jest.spyOn(global, 'setTimeout').mockImplementation(() => ({ id: 'reconnect-timeout' }));
    const { databaseModule, collection } = loadDatabaseModule({
      readyState: 1,
      indexes: [
        { name: 'scope_unique_idx', unique: false },
        { name: 'idempotency_ttl_idx', expireAfterSeconds: 86400 }
      ]
    });

    await databaseModule.connectDB();

    expect(collection.indexes).toHaveBeenCalled();
    expect(databaseModule.isConnected()).toBe(false);
    expect(require('mongoose').connection.close).toHaveBeenCalledTimes(1);
  });
});
