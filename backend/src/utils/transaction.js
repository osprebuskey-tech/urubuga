const mongoose = require('mongoose');

/** True when the connected MongoDB supports multi-document transactions (a replica set or Atlas cluster, not a standalone). */
function supportsTransactions() {
  try {
    const type = mongoose.connection.getClient().topology?.description?.type;
    return ['ReplicaSetWithPrimary', 'Sharded', 'LoadBalanced'].includes(type);
  } catch {
    return false;
  }
}

/**
 * Runs `work(session)` in a transaction when the deployment supports it, so every write succeeds or none does.
 * On a standalone MongoDB (local dev, the in-memory test server) `session` is null and `work` must
 * protect itself with guarded updates and compensation. Pass `session ? { session } : {}` to every query.
 */
async function runInTransaction(work) {
  if (!supportsTransactions()) return work(null);
  const session = await mongoose.startSession();
  try {
    let result;
    await session.withTransaction(async () => { result = await work(session); });
    return result;
  } finally {
    await session.endSession();
  }
}

module.exports = { supportsTransactions, runInTransaction };
