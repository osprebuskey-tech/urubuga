const env = require('../../config/env');
const logger = require('../../config/logger');

const driver = env.STORAGE_PROVIDER === 's3' ? require('./s3Driver') : require('./localDriver');

/** save({ buffer, ext, mime, folder }) -> { key, url } */
const save = (file) => driver.save(file);

/** Best-effort delete: a storage hiccup must never fail the API request that triggered it. */
async function remove(key) {
  if (!key) return;
  try {
    await driver.remove(key);
  } catch (err) {
    logger.warn({ err, key }, 'Failed to delete stored file');
  }
}

/** Private (never public) files: identity documents. savePrivate -> { key }; readPrivate -> Buffer. */
const savePrivate = (file) => driver.savePrivate(file);
const readPrivate = (key) => driver.readPrivate(key);
async function removePrivate(key) {
  if (!key) return;
  try {
    await driver.removePrivate(key);
  } catch (err) {
    logger.warn({ err, key }, 'Failed to delete private file');
  }
}

module.exports = { save, remove, savePrivate, readPrivate, removePrivate };
