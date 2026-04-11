/**
 * WebDAV proxy route handler for Cloudflare Worker
 *
 * Add this to your existing sully-n Worker.
 * Route: /webdav?url=<encoded target URL>
 *
 * Example integration in your Worker's fetch handler:
 *
 *   if (pathname === '/webdav') {
 *       return handleWebDAV(request);
 *   }
 */

export async function handleWebDAV(req: Request): Promise<Response> {
    const CORS: Record<string, string> = {
        'Access-Control-Allow-Origin': '*',
        'Access-Control-Allow-Headers': 'Authorization, Content-Type, X-WebDAV-Method, X-WebDAV-Depth, Depth',
        'Access-Control-Allow-Methods': 'GET, POST, OPTIONS',
        'Access-Control-Max-Age': '86400',
    };

    if (req.method === 'OPTIONS') {
        return new Response(null, { status: 204, headers: CORS });
    }

    if (req.method !== 'POST') {
        return new Response(JSON.stringify({ error: 'Method not allowed' }), {
            status: 405,
            headers: { ...CORS, 'Content-Type': 'application/json' },
        });
    }

    const url = new URL(req.url);
    const targetUrl = url.searchParams.get('url');

    if (!targetUrl) {
        return new Response(JSON.stringify({ error: 'Missing url parameter' }), {
            status: 400,
            headers: { ...CORS, 'Content-Type': 'application/json' },
        });
    }

    // Only allow HTTPS
    let parsed: URL;
    try {
        parsed = new URL(targetUrl);
        if (parsed.protocol !== 'https:') {
            return new Response(JSON.stringify({ error: 'Only HTTPS URLs allowed' }), {
                status: 400,
                headers: { ...CORS, 'Content-Type': 'application/json' },
            });
        }
    } catch {
        return new Response(JSON.stringify({ error: 'Invalid URL' }), {
            status: 400,
            headers: { ...CORS, 'Content-Type': 'application/json' },
        });
    }

    const webdavMethod = req.headers.get('X-WebDAV-Method') || 'GET';
    const allowed = ['GET', 'PUT', 'PROPFIND', 'MKCOL', 'DELETE'];
    if (!allowed.includes(webdavMethod.toUpperCase())) {
        return new Response(JSON.stringify({ error: 'WebDAV method not allowed' }), {
            status: 400,
            headers: { ...CORS, 'Content-Type': 'application/json' },
        });
    }

    const fwd: Record<string, string> = {};
    const auth = req.headers.get('Authorization');
    if (auth) fwd['Authorization'] = auth;
    const ct = req.headers.get('Content-Type');
    if (ct) fwd['Content-Type'] = ct;
    const depth = req.headers.get('X-WebDAV-Depth') || req.headers.get('Depth');
    if (depth) fwd['Depth'] = depth;

    try {
        let body: ArrayBuffer | null = null;
        if (webdavMethod !== 'GET' && webdavMethod !== 'MKCOL') {
            body = await req.arrayBuffer();
            if (body.byteLength === 0) body = null;
        }

        const resp = await fetch(targetUrl, {
            method: webdavMethod,
            headers: fwd,
            body,
        });

        const resHeaders = new Headers(CORS);
        const rct = resp.headers.get('Content-Type');
        if (rct) resHeaders.set('Content-Type', rct);
        const rcl = resp.headers.get('Content-Length');
        if (rcl) resHeaders.set('Content-Length', rcl);

        return new Response(await resp.arrayBuffer(), {
            status: resp.status,
            headers: resHeaders,
        });
    } catch (e: any) {
        return new Response(JSON.stringify({ error: `Proxy error: ${e.message}` }), {
            status: 502,
            headers: { ...CORS, 'Content-Type': 'application/json' },
        });
    }
}
