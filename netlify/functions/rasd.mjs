import legacy from '../../backend/netlifyHandler.js';

// Netlify's modern runtime initializes managed Database bindings before this
// handler runs. Adapt its Web Request to the existing Express application.
export default async function handler(request, context) {
  const url = new URL(request.url);
  const result = await legacy.handler({
    httpMethod: request.method,
    path: url.pathname,
    headers: Object.fromEntries(request.headers),
    body: ['GET', 'HEAD'].includes(request.method) ? '' : Buffer.from(await request.arrayBuffer()).toString('base64'),
    isBase64Encoded: !['GET', 'HEAD'].includes(request.method),
    multiValueQueryStringParameters: Object.fromEntries([...new Set(url.searchParams.keys())].map(key => [key, url.searchParams.getAll(key)])),
    requestContext: { identity: { sourceIp: context.ip } },
  }, context);
  const headers = new Headers(result.headers || {});
  for (const [name, values] of Object.entries(result.multiValueHeaders || {})) {
    headers.delete(name);
    for (const value of values) headers.append(name, value);
  }
  const body = request.method === 'HEAD' || [204, 304].includes(result.statusCode)
    ? null : Buffer.from(result.body || '', result.isBase64Encoded ? 'base64' : 'utf8');
  return new Response(body, { status: result.statusCode, headers });
}
