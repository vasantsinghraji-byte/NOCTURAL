const fs = require('fs');
const path = require('path');
const express = require('express');
const request = require('supertest');
const { body } = require('express-validator');

const projectRoot = path.resolve(__dirname, '..', '..', '..');
const read = (relativePath) => fs.readFileSync(path.join(projectRoot, relativePath), 'utf8');

describe('additional risk hardening', () => {
  it('uses atomic payment invoice sequencing instead of count plus one', () => {
    const source = read('models/payment.js');

    expect(source).toContain('Counter.findByIdAndUpdate');
    expect(source).toContain("$inc: { seq: 1 }");
    expect(source).not.toMatch(/countDocuments\(\)/);
  });

  it('calculates shift series compensation correctly across midnight', async () => {
    const ShiftSeries = require('../../../models/shiftSeries');

    const series = new ShiftSeries({
      title: 'Night coverage',
      description: 'Recurring night coverage',
      hospitalId: '507f1f77bcf86cd799439010',
      postedBy: '507f1f77bcf86cd799439011',
      specialty: 'Emergency Medicine',
      location: 'ER',
      seriesType: 'CUSTOM',
      shifts: [{
        date: new Date('2026-06-27T00:00:00.000Z'),
        startTime: '22:30',
        endTime: '06:00',
        hourlyRate: 100
      }],
      totalShifts: 1,
      baseHourlyRate: 100,
      discountedRate: 100,
      totalCompensation: 1
    });

    await series.validate();

    expect(series.discountedRate).toBe(90);
    expect(series.totalCompensation).toBe(675);
  });

  it('uses Redis SCAN helpers instead of blocking KEYS calls', () => {
    const source = read('config/redis.js');
    expect(source).toContain('scanKeys');
    expect(source).not.toMatch(/\.keys\(/);
  });

  it('redacts sensitive request bodies and validator values before logging', async () => {
    jest.resetModules();
    jest.doMock('../../../utils/logger', () => ({
      warn: jest.fn(),
      error: jest.fn(),
      info: jest.fn(),
      debug: jest.fn()
    }));

    const logger = require('../../../utils/logger');
    const { validateRequest } = require('../../../middleware/validateRequest');
    const app = express();
    app.use(express.json());
    app.post('/validate',
      validateRequest([
        body('email').isEmail(),
        body('password').isLength({ min: 20 }),
        body('profile.apiKey').isLength({ min: 20 })
      ]),
      (_req, res) => res.json({ success: true })
    );

    await request(app)
      .post('/validate')
      .send({
        email: 'invalid',
        password: 'SecretPass1!',
        profile: {
          apiKey: 'short',
          displayName: 'Visible Name'
        }
      })
      .expect(400);

    const logContext = logger.warn.mock.calls[0][1];
    expect(logContext.body.password).toBe('[REDACTED]');
    expect(logContext.body.profile.apiKey).toBe('[REDACTED]');
    expect(logContext.body.profile.displayName).toBe('Visible Name');
    expect(JSON.stringify(logContext.errors)).not.toContain('SecretPass1!');
    expect(JSON.stringify(logContext.errors)).not.toContain('short');
  });

  it('documents runtime secret requirements in .env.example', () => {
    const envExample = read('.env.example');

    expect(envExample).toContain('JWT_SECRET=                             # REQUIRED. Min 64 chars');
    expect(envExample).toContain('ENCRYPTION_KEY=                         # REQUIRED. Exactly 64 hex chars / 32 bytes');
  });
});
