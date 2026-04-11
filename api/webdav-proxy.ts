/**
 * WebDAV Proxy — Vercel Edge Function
 *
 * Identical purpose to netlify/functions/webdav-proxy.ts:
 * bypasses browser CORS for web clients calling WebDAV servers (坚果云, etc.)
 *
 * The GitHub Pages frontend calls this via absolute URL when
 * VITE_WEBDAV_PROXY_URL is set to the Vercel deployment origin.
 */

export const config = { runtime: 'edge' };

const CORS_HEADERS: Record<string, string> = {
    'Access-Control-Allow-Origin': '*',
    'Access-Control-Allow-Headers': 'Authorization, Content-Type, X-WebDAV-Method, X-WebDAV-Depth, Depth',
    'Access-Control-Allow-Methods': 'GET, POST, OPTIONS',
    'Access-Control-Max-Age': '86400',
};

export default async function handler(req: Request) {
    // Handle CORS preflight
    if (req.method === 'OPTIONS') {
        return new Response(null, { status: 204, headers: CORS_HEADERS });
    }

    if (req.method !== 'POST') {
        return new Response(JSON.stringify({ error: 'Method not allowed' }), {
            status: 405,
            headers: { ...CORS_HEADERS, 'Content-Type': 'application/json' },
        });
    }

    const url = new URL(req.url);
    const targetUrl = url.searchParams.get('url');

    if (!targetUrl) {
        return new Response(JSON.stringify({ error: 'Missing url parameter' }), {
            status: 400,
            headers: { ...CORS_HEADERS, 'Content-Type': 'application/json' },
        });
    }

    // Validate target URL — only allow HTTPS WebDAV endpoints
    let parsedTarget: URL;
    try {
        parsedTarget = new URL(targetUrl);
        if (parsedTarget.protocol !== 'https:') {
            return new Response(JSON.stringify({ error: 'Only HTTPS URLs allowed' }), {
                status: 400,
                headers: { ...CORS_HEADERS, 'Content-Type': 'application/json' },
            });
        }
    } catch {
        return new Response(JSON.stringify({ error: 'Invalid URL' }), {
            status: 400,
            headers: { ...CORS_HEADERS, 'Content-Type': 'application/json' },
        });
    }

    // Extract the real WebDAV method from header
    const webdavMethod = req.headers.get('X-WebDAV-Method') || 'GET';
    const allowedMethods = ['GET', 'PUT', 'PROPFIND', 'MKCOL', 'DELETE'];
    if (!allowedMethods.includes(webdavMethod.toUpperCase())) {
        return new Response(JSON.stringify({ error: 'WebDAV method not allowed' }), {
            status: 400,
            headers: { ...CORS_HEADERS, 'Content-Type': 'application/json' },
        });
    }

    // Build headers to forward
    const forwardHeaders: Record<string, string> = {};
    const auth = req.headers.get('Authorization');
    if (auth) forwardHeaders['Authorization'] = auth;

    const contentType = req.headers.get('Content-Type');
    if (contentType) forwardHeaders['Content-Type'] = contentType;

    // PROPFIND-specific
    const depth = req.headers.get('X-WebDAV-Depth') || req.headers.get('Depth');
    if (depth) forwardHeaders['Depth'] = depth;

    try {
        // Read body (could be XML for PROPFIND, or binary for PUT)
        let body: ArrayBuffer | null = null;
        if (webdavMethod !== 'GET' && webdavMethod !== 'MKCOL') {
            body = await req.arrayBuffer();
            if (body.byteLength === 0) body = null;
        }

        const response = await fetch(targetUrl, {
            method: webdavMethod,
            headers: forwardHeaders,
            body: body,
        });

        // Build response — pass through status and body
        const responseHeaders = new Headers(CORS_HEADERS);
        const respContentType = response.headers.get('Content-Type');
        if (respContentType) responseHeaders.set('Content-Type', respContentType);
        const respContentLength = response.headers.get('Content-Length');
        if (respContentLength) responseHeaders.set('Content-Length', respContentLength);

        const responseBody = await response.arrayBuffer();

        return new Response(responseBody, {
            status: response.status,
            headers: responseHeaders,
        });
    } catch (e: any) {
        return new Response(JSON.stringify({ error: `Proxy error: ${e.message}` }), {
            status: 502,
            headers: { ...CORS_HEADERS, 'Content-Type': 'application/json' },
        });
    }
}
