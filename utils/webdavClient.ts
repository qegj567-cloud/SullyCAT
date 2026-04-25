/**
 * WebDAV Client for Cloud Backup
 *
 * Supports: 坚果云 (Nutstore), Nextcloud, Synology NAS, TeraCloud, Box, etc.
 *
 * All platforms (web + Capacitor native) route through the Cloudflare Worker
 * proxy. Capacitor's Android WebView is still Chromium and enforces CORS on
 * fetch(), so WebDAV servers that don't return CORS headers (TeraCloud /
 * infini-cloud, most NAS) fail with "Failed to fetch" on direct calls.
 */

import { CloudBackupConfig, CloudBackupFile } from '../types';

// Cloudflare Worker 代理地址（与 Notion/飞书等共用同一个 Worker）
const WORKER_URL = 'https://sully-n.qegj567.workers.dev';

// Build the actual fetch URL — always via CF Worker proxy (bypasses CORS on
// both browsers and Capacitor WebViews).
const buildFetchUrl = (webdavUrl: string, path: string): string => {
    const fullUrl = webdavUrl.replace(/\/+$/, '') + '/' + path.replace(/^\/+/, '');
    return `${WORKER_URL}/webdav?url=${encodeURIComponent(fullUrl)}`;
};

const buildHeaders = (config: CloudBackupConfig): Record<string, string> => {
    const token = btoa(`${config.username}:${config.password}`);
    return {
        'Authorization': `Basic ${token}`,
    };
};

/**
 * Test WebDAV connection by doing a PROPFIND on the remote path
 */
export const testConnection = async (config: CloudBackupConfig): Promise<{ ok: boolean; message: string }> => {
    try {
        const url = buildFetchUrl(config.webdavUrl, config.remotePath);
        const headers = buildHeaders(config);

        const res = await fetch(url, {
            method: 'POST',
            headers: {
                ...headers,
                'Content-Type': 'application/xml; charset=utf-8',
                'X-WebDAV-Method': 'PROPFIND',
                'X-WebDAV-Depth': '0',
            },
            body: '<?xml version="1.0" encoding="utf-8"?><d:propfind xmlns:d="DAV:"><d:prop><d:resourcetype/></d:prop></d:propfind>',
        });

        if (res.status === 207 || res.status === 200) {
            return { ok: true, message: '连接成功' };
        }
        if (res.status === 401) {
            return { ok: false, message: '认证失败：请检查用户名和密码' };
        }
        if (res.status === 404) {
            // Try to create the directory
            const mkcolOk = await createDirectory(config);
            if (mkcolOk) return { ok: true, message: '连接成功（已自动创建备份目录）' };
            return { ok: false, message: '备份目录不存在且无法创建' };
        }
        return { ok: false, message: `服务器返回 ${res.status}` };
    } catch (e: any) {
        return { ok: false, message: `连接失败: ${e.message}` };
    }
};

/**
 * Create remote directory (MKCOL)
 */
export const createDirectory = async (config: CloudBackupConfig): Promise<boolean> => {
    try {
        const url = buildFetchUrl(config.webdavUrl, config.remotePath);
        const headers = buildHeaders(config);

        const res = await fetch(url, {
            method: 'POST',
            headers: {
                ...headers,
                'X-WebDAV-Method': 'MKCOL',
            },
        });
        return res.status === 201 || res.status === 405; // 405 = already exists
    } catch {
        return false;
    }
};

/**
 * Upload a backup file to WebDAV via XHR so we get real byte-level progress
 * (fetch() doesn't expose upload progress in any browser).
 */
export const uploadBackup = (
    config: CloudBackupConfig,
    blob: Blob,
    filename: string,
    onProgress?: (percent: number) => void,
): Promise<{ ok: boolean; message: string }> => {
    return new Promise((resolve) => {
        const remotePath = config.remotePath.replace(/\/+$/, '') + '/' + filename;
        const url = buildFetchUrl(config.webdavUrl, remotePath);
        const token = btoa(`${config.username}:${config.password}`);

        const xhr = new XMLHttpRequest();
        xhr.open('POST', url);
        xhr.setRequestHeader('Authorization', `Basic ${token}`);
        xhr.setRequestHeader('Content-Type', 'application/zip');
        xhr.setRequestHeader('X-WebDAV-Method', 'PUT');

        xhr.upload.onprogress = (e) => {
            if (!e.lengthComputable) return;
            const pct = Math.min(99, Math.floor((e.loaded / e.total) * 100));
            onProgress?.(pct);
        };

        xhr.onload = () => {
            onProgress?.(100);
            const s = xhr.status;
            if (s === 200 || s === 201 || s === 204) return resolve({ ok: true, message: '上传成功' });
            if (s === 401) return resolve({ ok: false, message: '认证失败' });
            if (s === 507) return resolve({ ok: false, message: '云端空间不足' });
            resolve({ ok: false, message: `上传失败 (${s})` });
        };
        xhr.onerror = () => resolve({ ok: false, message: '上传失败: 网络错误' });
        xhr.onabort = () => resolve({ ok: false, message: '上传已取消' });
        xhr.ontimeout = () => resolve({ ok: false, message: '上传超时' });

        xhr.send(blob);
    });
};

/**
 * List backup files on WebDAV
 */
export const listBackups = async (config: CloudBackupConfig): Promise<CloudBackupFile[]> => {
    try {
        const url = buildFetchUrl(config.webdavUrl, config.remotePath);
        const headers = buildHeaders(config);

        const res = await fetch(url, {
            method: 'POST',
            headers: {
                ...headers,
                'Content-Type': 'application/xml; charset=utf-8',
                'X-WebDAV-Method': 'PROPFIND',
                'X-WebDAV-Depth': '1',
            },
            body: '<?xml version="1.0" encoding="utf-8"?><d:propfind xmlns:d="DAV:"><d:prop><d:getcontentlength/><d:getlastmodified/><d:displayname/><d:resourcetype/></d:prop></d:propfind>',
        });

        if (res.status !== 207 && res.status !== 200) {
            return [];
        }

        const xml = await res.text();
        return parseWebDAVListing(xml, config);
    } catch {
        return [];
    }
};

/**
 * Download a backup file from WebDAV.
 *
 * Large backups (≳ a few MB) reliably failed when streamed through the CF
 * Worker proxy in a single request: the browser would log
 * `net::ERR_FAILED 200 (OK)` mid-stream because the upstream→worker→client
 * pipe outlived the worker's wall-clock budget on slow connections. To make
 * imports work for any size, we download in fixed-size chunks via HTTP
 * Range, with per-chunk retry, and fall back to a single GET only when the
 * server doesn't support ranges.
 */
const CHUNK_SIZE = 8 * 1024 * 1024; // 8 MB per range request — fewer worker hits
const MAX_CHUNK_RETRIES = 3;

const fetchChunk = async (
    url: string,
    headers: Record<string, string>,
    rangeHeader: string,
): Promise<ArrayBuffer> => {
    let lastErr: any = null;
    for (let attempt = 0; attempt < MAX_CHUNK_RETRIES; attempt++) {
        try {
            const res = await fetch(url, {
                method: 'POST',
                headers: {
                    ...headers,
                    'X-WebDAV-Method': 'GET',
                    'X-WebDAV-Range': rangeHeader,
                },
            });
            if (res.status === 206 || res.status === 200) {
                return await res.arrayBuffer();
            }
            lastErr = new Error(`chunk HTTP ${res.status}`);
        } catch (e) {
            lastErr = e;
        }
        await new Promise(r => setTimeout(r, 500 * (attempt + 1)));
    }
    throw lastErr || new Error('chunk failed');
};

export const downloadBackup = async (
    config: CloudBackupConfig,
    file: CloudBackupFile,
    onProgress?: (percent: number) => void,
): Promise<Blob | null> => {
    try {
        const url = buildFetchUrl(config.webdavUrl, file.href);
        const headers = buildHeaders(config);

        onProgress?.(2);

        // Path A: known size + reasonably large → chunked range download
        if (file.size > CHUNK_SIZE) {
            const total = file.size;
            const parts: ArrayBuffer[] = [];
            let received = 0;
            for (let start = 0; start < total; start += CHUNK_SIZE) {
                const end = Math.min(start + CHUNK_SIZE - 1, total - 1);
                const buf = await fetchChunk(url, headers, `bytes=${start}-${end}`);
                parts.push(buf);
                received += buf.byteLength;
                onProgress?.(Math.min(99, Math.floor((received / total) * 100)));
            }
            const blob = new Blob(parts, { type: 'application/zip' });
            onProgress?.(100);
            return blob;
        }

        // Path B: small or unknown size → single GET
        const res = await fetch(url, {
            method: 'POST',
            headers: {
                ...headers,
                'X-WebDAV-Method': 'GET',
            },
        });
        if (!res.ok) return null;
        onProgress?.(50);
        const blob = await res.blob();
        onProgress?.(100);
        return blob;
    } catch {
        return null;
    }
};

/**
 * Delete a backup file from WebDAV
 */
export const deleteBackup = async (
    config: CloudBackupConfig,
    file: CloudBackupFile,
): Promise<boolean> => {
    try {
        const url = buildFetchUrl(config.webdavUrl, file.href);
        const headers = buildHeaders(config);

        const res = await fetch(url, {
            method: 'POST',
            headers: {
                ...headers,
                'X-WebDAV-Method': 'DELETE',
            },
        });
        return res.status === 204 || res.status === 200;
    } catch {
        return false;
    }
};

/**
 * Parse WebDAV PROPFIND XML response into file list
 */
const parseWebDAVListing = (xml: string, config: CloudBackupConfig): CloudBackupFile[] => {
    const parser = new DOMParser();
    const doc = parser.parseFromString(xml, 'application/xml');
    const responses = doc.querySelectorAll('response');
    const files: CloudBackupFile[] = [];

    responses.forEach((response) => {
        const href = response.querySelector('href')?.textContent || '';
        const isCollection = response.querySelector('resourcetype collection') !== null;
        if (isCollection) return; // Skip directories

        const displayName = response.querySelector('displayname')?.textContent || '';
        const contentLength = response.querySelector('getcontentlength')?.textContent || '0';
        const lastModified = response.querySelector('getlastmodified')?.textContent || '';

        // Only show .zip files that match our backup pattern
        const name = displayName || href.split('/').filter(Boolean).pop() || '';
        if (!name.endsWith('.zip')) return;

        files.push({
            name,
            size: parseInt(contentLength, 10),
            lastModified,
            href: config.remotePath.replace(/\/+$/, '') + '/' + name,
        });
    });

    // Sort by name descending (newest first, since names contain timestamps)
    files.sort((a, b) => b.name.localeCompare(a.name));
    return files;
};

/**
 * Clean up old backups, keeping only the latest N
 */
export const cleanupOldBackups = async (config: CloudBackupConfig, keepCount: number = 5): Promise<number> => {
    const files = await listBackups(config);
    if (files.length <= keepCount) return 0;

    let deleted = 0;
    const toDelete = files.slice(keepCount); // files are sorted newest-first
    for (const file of toDelete) {
        if (await deleteBackup(config, file)) deleted++;
    }
    return deleted;
};

/**
 * Format file size for display
 */
export const formatFileSize = (bytes: number): string => {
    if (bytes < 1024) return `${bytes} B`;
    if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
    return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
};
