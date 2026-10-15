/**
 * Limit guesses at a secret (password, OTP, visit / delivery code) in a way
 * parallel requests can't get around.
 *
 * The old pattern read the failure count, checked it, compared the secret and
 * only then added one. Sixty guesses sent at the same instant all read "0"
 * first, so all sixty were checked (bot testing started a visit this way).
 * Here each guess first reserves an attempt with one atomic update that only
 * succeeds while the counter is below the limit, so at most `max` guesses are
 * ever compared, however many arrive together.
 */

const now = () => new Date();
const unset = (path) => ({ $or: [{ [path]: { $exists: false } }, { [path]: null }] });

/**
 * Reserve one attempt. Returns true if the caller may check the secret.
 * With `lockPath`, a counter that reaches `max` locks the record until
 * `lockMs` from now; an expired lock starts a fresh count.
 */
async function reserveAttempt(Model, filter, counterPath, max, { lockPath, lockMs } = {}) {
  const conditions = [{ $or: [{ [counterPath]: { $exists: false } }, { [counterPath]: null }, { [counterPath]: { $lt: max } }] }];
  if (lockPath) {
    await Model.updateOne({ ...filter, [lockPath]: { $lte: now() } }, { $set: { [counterPath]: 0 }, $unset: { [lockPath]: 1 } });
    conditions.push(unset(lockPath));
  }
  const doc = await Model.findOneAndUpdate(
    { ...filter, $and: conditions },
    { $inc: { [counterPath]: 1 } },
    { new: true, projection: { _id: 1 } }
  ).lean();
  if (!doc && lockPath) await lockIfExhausted(Model, filter, counterPath, max, { lockPath, lockMs });
  return !!doc;
}

/** After a wrong guess: lock once the limit is reached (no-op without lockPath). */
async function lockIfExhausted(Model, filter, counterPath, max, { lockPath, lockMs } = {}) {
  if (!lockPath) return;
  await Model.updateOne(
    { ...filter, [counterPath]: { $gte: max }, ...unset(lockPath) },
    { $set: { [lockPath]: new Date(Date.now() + lockMs) } }
  );
}

/** After a right guess: the reservation wasn't a failure, start over. */
async function resetAttempts(Model, filter, counterPath, { lockPath } = {}) {
  await Model.updateOne(filter, { $set: { [counterPath]: 0 }, ...(lockPath ? { $unset: { [lockPath]: 1 } } : {}) });
}

/** Minutes left on a lock, or 0. */
async function lockedMinutes(Model, filter, lockPath) {
  const doc = await Model.findOne(filter).select(`+${lockPath}`).lean();
  const until = lockPath.split('.').reduce((o, k) => (o ? o[k] : undefined), doc);
  return until && new Date(until) > now() ? Math.ceil((new Date(until) - now()) / 60000) : 0;
}

module.exports = { reserveAttempt, lockIfExhausted, resetAttempts, lockedMinutes };
