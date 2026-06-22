/**
 * Regression guard for the mongoose 9 async pre-save hook bug (issue #97).
 *
 * mongoose 9 stopped passing `next` to async hook functions, so an
 * `async function(next) { ... next(); }` pre-save hook threw
 * "TypeError: next is not a function" on .create()/.save(). This was a latent
 * production bug on main (no test exercised User.save()), which is exactly why
 * it shipped silently. These tests fail fast if any model's save hook regresses
 * to the callback style under a mongoose major bump.
 */
const mongoose = require('mongoose');
const User = require('../../models/user');

describe('Model save hooks — mongoose 9 async-hook regression (#97)', () => {
  let databaseAvailable = false;
  const testEmailPattern = /save-hooks-regression/;

  beforeAll(async () => {
    if (mongoose.connection.readyState === 0) {
      try {
        await mongoose.connect(process.env.MONGODB_URI, {
          serverSelectionTimeoutMS: Number(process.env.TEST_MONGO_SERVER_SELECTION_TIMEOUT_MS) || 3000
        });
        databaseAvailable = true;
      } catch (error) {
        databaseAvailable = false;
        console.warn(`Skipping save-hooks regression: MongoDB unavailable (${error.message})`);
      }
    } else {
      databaseAvailable = true;
    }
  });

  afterAll(async () => {
    if (databaseAvailable) {
      await User.deleteMany({ email: testEmailPattern });
      await mongoose.connection.close();
    }
  });

  it('creates a User without "next is not a function" and runs the password-hashing hook', async () => {
    if (!databaseAvailable) return;
    const plain = 'RegressPass123!';
    const user = await User.create({
      name: 'Save Hooks Regression',
      email: `save-hooks-regression-${Date.now()}@integration.test`,
      password: plain,
      role: 'doctor',
      phone: '9999999999',
      specialty: 'General Medicine'
    });

    expect(user._id).toBeTruthy();
    // pre-save hook ran: password is hashed, not stored in plaintext
    expect(user.password).not.toBe(plain);
    expect(await user.comparePassword(plain)).toBe(true);
  });

  it('re-saves an existing User (the login lastActive path) without throwing', async () => {
    if (!databaseAvailable) return;
    const plain = 'RegressPass123!';
    const user = await User.create({
      name: 'Save Hooks Regression Login',
      email: `save-hooks-regression-login-${Date.now()}@integration.test`,
      password: plain,
      role: 'doctor',
      phone: '9999999999',
      specialty: 'General Medicine'
    });

    user.lastActive = new Date();
    await expect(user.save()).resolves.toBeTruthy();
    // password untouched on a non-password update, and still valid
    expect(await user.comparePassword(plain)).toBe(true);
  });
});
