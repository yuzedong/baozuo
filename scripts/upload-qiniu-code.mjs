import { createHmac } from 'node:crypto';

const urlSafeBase64 = bytes => Buffer.from(bytes).toString('base64')
  .replaceAll('+', '-').replaceAll('/', '_');

export async function uploadCodeAssets(assets) {
  const { QINIU_BUCKET, QINIU_UPLOAD_HOST, QINIU_ACCESS_KEY, QINIU_SECRET_KEY } = process.env;
  if (!QINIU_BUCKET || !QINIU_UPLOAD_HOST || !QINIU_ACCESS_KEY || !QINIU_SECRET_KEY) {
    throw new Error('七牛上传需要配置空间名、上传域名及 GitHub Secrets');
  }
  const endpoint = new URL(`https://${QINIU_UPLOAD_HOST}`);
  if (!endpoint.hostname.endsWith('.qiniup.com') || endpoint.host !== QINIU_UPLOAD_HOST) {
    throw new Error('QINIU_UPLOAD_HOST 须填写七牛官方上传域名');
  }

  for (const [file, contents] of Object.entries(assets)) {
    const key = `site-static/code/${file}`;
    const policy = urlSafeBase64(JSON.stringify({
      scope: `${QINIU_BUCKET}:${key}`,
      deadline: Math.floor(Date.now() / 1000) + 300,
      insertOnly: 1
    }));
    const signature = urlSafeBase64(createHmac('sha1', QINIU_SECRET_KEY).update(policy).digest());
    const form = new FormData();
    form.set('token', `${QINIU_ACCESS_KEY}:${signature}:${policy}`);
    form.set('key', key);
    const type = file.endsWith('.css') ? 'text/css' : 'application/javascript';
    form.set('file', new Blob([contents], { type }), file);
    const response = await fetch(endpoint, {
      method: 'POST', body: form, redirect: 'error', signal: AbortSignal.timeout(30000)
    });
    await response.body?.cancel();
    if (!response.ok && response.status !== 614) {
      throw new Error(`七牛上传失败：${key}（HTTP ${response.status}）`);
    }
    console.log(`七牛对象 ${response.status === 614 ? '已存在' : '已上传'}：${key}`);
  }
}
