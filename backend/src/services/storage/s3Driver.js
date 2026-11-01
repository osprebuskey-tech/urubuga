// S3-compatible driver (AWS S3, Cloudflare R2, MinIO...). The AWS SDK is loaded lazily so the
// local driver and the test suite never need it.
const crypto = require('crypto');
const env = require('../../config/env');

let client;
function getClient() {
  if (!client) {
    const { S3Client } = require('@aws-sdk/client-s3');
    client = new S3Client({
      region: env.S3_REGION,
      endpoint: env.S3_ENDPOINT,
      forcePathStyle: Boolean(env.S3_ENDPOINT),
      credentials: { accessKeyId: env.S3_ACCESS_KEY_ID, secretAccessKey: env.S3_SECRET_ACCESS_KEY },
    });
  }
  return client;
}

async function save({ buffer, ext, mime, folder }) {
  const { PutObjectCommand } = require('@aws-sdk/client-s3');
  const key = `${folder}/${crypto.randomUUID()}.${ext}`;
  await getClient().send(
    new PutObjectCommand({
      Bucket: env.S3_BUCKET,
      Key: key,
      Body: buffer,
      ContentType: mime,
      CacheControl: 'public, max-age=31536000, immutable',
    }),
  );
  return { key, url: `${env.S3_PUBLIC_BASE_URL.replace(/\/$/, '')}/${key}` };
}

async function remove(key) {
  const { DeleteObjectCommand } = require('@aws-sdk/client-s3');
  await getClient().send(new DeleteObjectCommand({ Bucket: env.S3_BUCKET, Key: key }));
}

// Private files go to S3_PRIVATE_BUCKET (falling back to the main bucket under a "private/" prefix for development).
// They are never given a public URL; the API reads them and streams them after an access check.
const privateBucket = () => env.S3_PRIVATE_BUCKET || env.S3_BUCKET;
async function savePrivate({ buffer, ext, mime, folder }) {
  const { PutObjectCommand } = require('@aws-sdk/client-s3');
  const key = `private/${folder}/${crypto.randomUUID()}.${ext}`;
  await getClient().send(new PutObjectCommand({ Bucket: privateBucket(), Key: key, Body: buffer, ContentType: mime, CacheControl: 'private, no-store', ServerSideEncryption: 'AES256' }));
  return { key };
}
async function readPrivate(key) {
  const { GetObjectCommand } = require('@aws-sdk/client-s3');
  const res = await getClient().send(new GetObjectCommand({ Bucket: privateBucket(), Key: key }));
  return Buffer.from(await res.Body.transformToByteArray());
}
async function removePrivate(key) {
  const { DeleteObjectCommand } = require('@aws-sdk/client-s3');
  await getClient().send(new DeleteObjectCommand({ Bucket: privateBucket(), Key: key }));
}

module.exports = { save, remove, savePrivate, readPrivate, removePrivate };
