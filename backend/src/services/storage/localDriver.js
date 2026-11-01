const fs = require('fs/promises');
const path = require('path');
const crypto = require('crypto');
const env = require('../../config/env');

async function save({ buffer, ext, folder }) {
  const key = `${folder}/${crypto.randomUUID()}.${ext}`;
  const fullPath = path.join(env.uploadDir, key);
  await fs.mkdir(path.dirname(fullPath), { recursive: true });
  await fs.writeFile(fullPath, buffer, { flag: 'wx' });
  return { key, url: `${env.publicApiUrl}/uploads/${key}` };
}

async function remove(key) {
  const fullPath = path.resolve(env.uploadDir, key);
  if (!fullPath.startsWith(env.uploadDir + path.sep)) return; // never delete outside the upload dir
  await fs.rm(fullPath, { force: true });
}

// Private files live in their own directory that is never served statically; only the API streams them after an access check.
const resolvePrivate = (key) => {
  const full = path.resolve(env.privateUploadDir, key);
  if (!full.startsWith(env.privateUploadDir + path.sep)) throw new Error('Invalid storage key');
  return full;
};
async function savePrivate({ buffer, ext, folder }) {
  const key = `${folder}/${crypto.randomUUID()}.${ext}`;
  const full = resolvePrivate(key);
  await fs.mkdir(path.dirname(full), { recursive: true });
  await fs.writeFile(full, buffer, { flag: 'wx', mode: 0o600 });
  return { key };
}
const readPrivate = (key) => fs.readFile(resolvePrivate(key));
const removePrivate = (key) => fs.rm(resolvePrivate(key), { force: true });

module.exports = { save, remove, savePrivate, readPrivate, removePrivate };
