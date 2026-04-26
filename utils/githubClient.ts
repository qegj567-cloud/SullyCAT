/**
 * GitHub Releases Client for Cloud Backup
 *
 * Why Releases (not Gist / Contents API):
 *   - Single asset can be up to 2 GB (full backups with media routinely exceed
 *     25 MB, the practical Contents API ceiling).
 *   - Binary upload — no Base64 33% bloat.
 *   - Each backup = one release, so listing/cleanup map cleanly to the same
 *     UX as WebDAV ('cleanupOldBackups keeps latest N').
 *
 * Two transports, mirroring webdavClient.ts:
 *   - Native (Capacitor): CapacitorHttp talks straight to api.github.com /
 *     uploads.github.com. Bypasses CORS and the worker entirely.
 *   - Web: direct fetch by default. api.github.com sets CORS for any origin
 *     (per GitHub docs); uploads.github.com does too. If the user's network
 *     can't reach github.com (GFW), they flip 'githubUseProxy' on and we
 *     route through the same sully-n CF Worker that handles WebDAV — Worker
 *     free tier caps each request body at ~100 MB, but it's enough to
 *     unblock most users.
 */
import { Capacitor, CapacitorHttp } from '@capacitor/core';

import { CloudBackupConfig, CloudBackupFile } from '../types';

const WORKER_URL = 'https://sully-n.qegj567.workers.dev';
const API_HOST = 'https://api.github.com';
const UPLOAD_HOST = 'https://uploads.github.com';
const DEFAULT_REPO = 'sully-backup';
const TAG_PREFIX = 'sully-backup-';
const RELEASE_NAME_PREFIX = 'Sully Backup ';

const isNative = (): boolean => {
    try { return Capacitor.isNativePlatform(); } catch { return false; }
};

// 国内用户大部分摸不到 github.com，所以代理默认开（undefined 视为 true）。
// 只有用户在高级选项里明确把勾去掉（githubUseProxy === false）才直连。
const useProxy = (config: CloudBackupConfig): boolean =>
    !isNative() && config.githubUseProxy !== false;

const proxify = (url: string): string =>
    `${WORKER_URL}/github?url=${encodeURIComponent(url)}`;

const authHeaders = (token: string, extra: Record<string, string> = {}): Record<string, string> => ({
    Authorization: `Bearer ${token}`,
    Accept: 'application/vnd.github+json',
    'X-GitHub-Api-Version': '2022-11-28',
    ...extra,
});

type GhMethod = 'GET' | 'POST' | 'DELETE' | 'PATCH';
type GhResponse = {
    status: number;
    headers: Record<string, string>;
    text: () => Promise<string>;
    json: () => Promise<any>;
    arrayBuffer: () => Promise<ArrayBuffer>;
};

const decodeBinary = (data: any): ArrayBuffer => {
    if (data instanceof ArrayBuffer) return data;
    if (data && data.buffer instanceof ArrayBuffer) return data.buffer;
    if (typeof data === 'string') {
        const bin = atob(data);
        const out = new Uint8Array(bin.length);
        for (let i = 0; i < bin.length; i++) out[i] = bin.charCodeAt(i);
        return out.buffer;
    }
    return new ArrayBuffer(0);
};

/**
 * Single request entry point. Native goes direct via CapacitorHttp; web
 * either fetches directly (default) or POSTs through the worker with the
 * real method in X-GitHub-Method.
 */
const ghRequest = async (
    config: CloudBackupConfig,
    fullUrl: string,
    method: GhMethod,
    opts: { headers?: Record<string, string>; body?: BodyInit | ArrayBuffer | Blob; binary?: boolean } = {},
): Promise<GhResponse> => {
    const baseHeaders = opts.headers || {};

    if (isNative()) {
        let data: any = undefined;
        if (opts.body !== undefined && opts.body !== null) {
            if (opts.body instanceof Blob) data = await opts.body.arrayBuffer();
            else if (typeof opts.body === 'string') data = opts.body;
            else data = opts.body;
        }
        const response = await CapacitorHttp.request({
            url: fullUrl,
            method,
            headers: baseHeaders,
            data,
            responseType: opts.binary ? 'arraybuffer' : 'json',
        });
        const respData = response.data;
        const respHeaders: Record<string, string> = {};
        for (const [k, v] of Object.entries(response.headers || {})) {
            respHeaders[k.toLowerCase()] = String(v);
        }
        return {
            status: response.status,
            headers: respHeaders,
            text: async () => (typeof respData === 'string' ? respData : JSON.stringify(respData)),
            json: async () => (typeof respData === 'string' ? JSON.parse(respData || 'null') : respData),
            arrayBuffer: async () => decodeBinary(respData),
        };
    }

    if (useProxy(config)) {
        const headers: Record<string, string> = {
            ...baseHeaders,
            'X-GitHub-Method': method,
        };
        const res = await fetch(proxify(fullUrl), {
            method: 'POST',
            headers,
            body: (opts.body as BodyInit | undefined) ?? null,
        });
        const respHeaders: Record<string, string> = {};
        res.headers.forEach((v, k) => { respHeaders[k.toLowerCase()] = v; });
        return {
            status: res.status,
            headers: respHeaders,
            text: () => res.text(),
            json: () => res.json(),
            arrayBuffer: () => res.arrayBuffer(),
        };
    }

    const res = await fetch(fullUrl, {
        method,
        headers: baseHeaders,
        body: (opts.body as BodyInit | undefined) ?? null,
        redirect: 'follow',
    });
    const respHeaders: Record<string, string> = {};
    res.headers.forEach((v, k) => { respHeaders[k.toLowerCase()] = v; });
    return {
        status: res.status,
        headers: respHeaders,
        text: () => res.text(),
        json: () => res.json(),
        arrayBuffer: () => res.arrayBuffer(),
    };
};

const repoName = (config: CloudBackupConfig): string =>
    (config.githubRepo || DEFAULT_REPO).trim();

/**
 * Step 1: validate the token and learn the user's login (so we don't make
 * the user fill in 'owner' themselves).
 */
export const verifyToken = async (
    token: string,
    useProxyOverride?: boolean,
): Promise<{ ok: boolean; login?: string; message: string }> => {
    try {
        const tempConfig: CloudBackupConfig = {
            enabled: false, webdavUrl: '', username: '', password: '', remotePath: '',
            githubToken: token, githubUseProxy: useProxyOverride,
        };
        const res = await ghRequest(tempConfig, `${API_HOST}/user`, 'GET', {
            headers: authHeaders(token),
        });
        if (res.status === 200) {
            const data = await res.json();
            return { ok: true, login: data.login, message: '已连接 GitHub' };
        }
        if (res.status === 401) return { ok: false, message: 'Token 无效或已过期' };
        if (res.status === 403) return { ok: false, message: '权限不足，请确认 Token 勾选了 repo 范围' };
        return { ok: false, message: `GitHub 返回 ${res.status}` };
    } catch (e: any) {
        return { ok: false, message: `连接失败: ${e?.message || '网络错误'}` };
    }
};

/**
 * Step 2: ensure the backup repo exists. If not, auto-create it as private
 * with auto_init=true (we need at least one commit so releases can tag it).
 */
export const ensureRepo = async (config: CloudBackupConfig): Promise<{ ok: boolean; message: string }> => {
    const token = config.githubToken;
    const owner = config.githubOwner;
    const repo = repoName(config);
    if (!token || !owner) return { ok: false, message: 'Token 或用户名未设置' };

    try {
        const get = await ghRequest(config, `${API_HOST}/repos/${owner}/${repo}`, 'GET', {
            headers: authHeaders(token),
        });
        if (get.status === 200) return { ok: true, message: '仓库已就绪' };
        if (get.status !== 404) return { ok: false, message: `检查仓库失败 (${get.status})` };

        const create = await ghRequest(config, `${API_HOST}/user/repos`, 'POST', {
            headers: authHeaders(token, { 'Content-Type': 'application/json' }),
            body: JSON.stringify({
                name: repo,
                description: 'Sully 自动备份仓库',
                private: true,
                auto_init: true,
            }),
        });
        if (create.status === 201) return { ok: true, message: '已自动创建私有仓库' };
        if (create.status === 422) return { ok: false, message: `仓库名 "${repo}" 已被占用，请换一个` };
        if (create.status === 403) return { ok: false, message: '权限不足，Token 需要 repo 范围' };
        return { ok: false, message: `创建仓库失败 (${create.status})` };
    } catch (e: any) {
        return { ok: false, message: `连接失败: ${e?.message || '网络错误'}` };
    }
};

/**
 * Combines verifyToken + ensureRepo for the one-click connect flow.
 * Returns the resolved owner so the caller can persist it.
 */
export const testConnection = async (
    config: CloudBackupConfig,
): Promise<{ ok: boolean; message: string; login?: string }> => {
    const token = config.githubToken;
    if (!token) return { ok: false, message: '请先填写 Token' };

    const ver = await verifyToken(token, config.githubUseProxy);
    if (!ver.ok) return { ok: false, message: ver.message };

    const cfg = { ...config, githubOwner: ver.login };
    const repo = await ensureRepo(cfg);
    if (!repo.ok) return { ok: false, message: repo.message, login: ver.login };

    return { ok: true, message: `已连接 @${ver.login} → ${repoName(cfg)}`, login: ver.login };
};

/**
 * Upload a backup as a Release asset.
 *
 * Flow:
 *   1. POST /releases  → get release_id and upload_url
 *   2. POST {upload_url}?name=... with body=blob → asset
 *
 * Web path uses XMLHttpRequest for the asset upload so we get real upload
 * progress events; native uses CapacitorHttp.
 */
export const uploadBackup = async (
    config: CloudBackupConfig,
    blob: Blob,
    filename: string,
    onProgress?: (percent: number) => void,
): Promise<{ ok: boolean; message: string }> => {
    const token = config.githubToken;
    const owner = config.githubOwner;
    const repo = repoName(config);
    if (!token || !owner) return { ok: false, message: '未连接 GitHub' };

    try {
        onProgress?.(2);
        const ts = Date.now();
        const tag = `${TAG_PREFIX}${ts}`;
        const releaseRes = await ghRequest(config, `${API_HOST}/repos/${owner}/${repo}/releases`, 'POST', {
            headers: authHeaders(token, { 'Content-Type': 'application/json' }),
            body: JSON.stringify({
                tag_name: tag,
                name: `${RELEASE_NAME_PREFIX}${new Date(ts).toISOString()}`,
                body: `自动备份 · ${new Date(ts).toLocaleString('zh-CN')}`,
                draft: false,
                prerelease: true,
            }),
        });
        if (releaseRes.status !== 201) {
            const msg = await releaseRes.text();
            return { ok: false, message: `创建 release 失败 (${releaseRes.status}): ${msg.slice(0, 120)}` };
        }
        const release = await releaseRes.json();
        const releaseId = release.id;

        onProgress?.(8);

        const assetUrl = `${UPLOAD_HOST}/repos/${owner}/${repo}/releases/${releaseId}/assets?name=${encodeURIComponent(filename)}`;

        // Native: CapacitorHttp PUT direct, no upload progress events (we just
        // bookend with 8% → 100%).
        if (isNative()) {
            const res = await ghRequest(config, assetUrl, 'POST', {
                headers: authHeaders(token, { 'Content-Type': 'application/zip' }),
                body: blob,
            });
            onProgress?.(100);
            if (res.status === 201) return { ok: true, message: '上传成功' };
            const msg = await res.text();
            return { ok: false, message: `上传失败 (${res.status}): ${msg.slice(0, 120)}` };
        }

        // Web: XHR for real upload progress. If proxy is on, route through worker.
        return await new Promise((resolve) => {
            const targetUrl = useProxy(config) ? proxify(assetUrl) : assetUrl;
            const xhr = new XMLHttpRequest();
            xhr.open('POST', targetUrl);
            xhr.setRequestHeader('Authorization', `Bearer ${token}`);
            xhr.setRequestHeader('Accept', 'application/vnd.github+json');
            xhr.setRequestHeader('Content-Type', 'application/zip');
            if (useProxy(config)) xhr.setRequestHeader('X-GitHub-Method', 'POST');
            xhr.upload.onprogress = (e) => {
                if (!e.lengthComputable) return;
                const pct = 8 + Math.floor((e.loaded / e.total) * 90);
                onProgress?.(Math.min(99, pct));
            };
            xhr.onload = () => {
                onProgress?.(100);
                if (xhr.status === 201) resolve({ ok: true, message: '上传成功' });
                else resolve({ ok: false, message: `上传失败 (${xhr.status}): ${(xhr.responseText || '').slice(0, 120)}` });
            };
            xhr.onerror = () => resolve({ ok: false, message: '上传失败: 网络错误（如果在国内，试试在高级设置里开启代理）' });
            xhr.onabort = () => resolve({ ok: false, message: '上传已取消' });
            xhr.ontimeout = () => resolve({ ok: false, message: '上传超时' });
            xhr.send(blob);
        });
    } catch (e: any) {
        return { ok: false, message: `上传失败: ${e?.message || '未知错误'}` };
    }
};

/**
 * Each release with an asset is treated as one "backup file". We sort newest
 * first to mirror the WebDAV ordering and stash 'releaseId:assetId' in href
 * so download/delete don't need to re-fetch the listing.
 */
export const listBackups = async (config: CloudBackupConfig): Promise<CloudBackupFile[]> => {
    const token = config.githubToken;
    const owner = config.githubOwner;
    const repo = repoName(config);
    if (!token || !owner) return [];

    try {
        const res = await ghRequest(config, `${API_HOST}/repos/${owner}/${repo}/releases?per_page=50`, 'GET', {
            headers: authHeaders(token),
        });
        if (res.status !== 200) return [];
        const releases: any[] = await res.json();
        const files: CloudBackupFile[] = [];
        for (const rel of releases) {
            if (!rel.tag_name?.startsWith(TAG_PREFIX)) continue;
            const assets = Array.isArray(rel.assets) ? rel.assets : [];
            for (const asset of assets) {
                if (!asset.name?.endsWith('.zip')) continue;
                files.push({
                    name: asset.name,
                    size: asset.size || 0,
                    lastModified: asset.updated_at || rel.created_at || '',
                    href: `${rel.id}:${asset.id}`,
                });
            }
        }
        files.sort((a, b) => (b.lastModified || '').localeCompare(a.lastModified || ''));
        return files;
    } catch {
        return [];
    }
};

/**
 * Asset download: GET /releases/assets/{id} with Accept:octet-stream returns
 * a 302 to a signed CDN URL. fetch() with redirect:'follow' handles it on
 * web; CapacitorHttp follows redirects by default.
 */
export const downloadBackup = async (
    config: CloudBackupConfig,
    file: CloudBackupFile,
    onProgress?: (percent: number) => void,
): Promise<Blob | null> => {
    const token = config.githubToken;
    const owner = config.githubOwner;
    const repo = repoName(config);
    if (!token || !owner) return null;

    const [, assetIdStr] = file.href.split(':');
    const assetId = Number(assetIdStr);
    if (!assetId) return null;

    try {
        onProgress?.(2);
        const res = await ghRequest(
            config,
            `${API_HOST}/repos/${owner}/${repo}/releases/assets/${assetId}`,
            'GET',
            {
                headers: authHeaders(token, { Accept: 'application/octet-stream' }),
                binary: true,
            },
        );
        if (res.status !== 200 && res.status !== 206) return null;
        onProgress?.(80);
        const buf = await res.arrayBuffer();
        onProgress?.(100);
        return new Blob([buf], { type: 'application/zip' });
    } catch {
        return null;
    }
};

/**
 * Delete = DELETE the release. GitHub keeps the underlying tag dangling, so
 * we delete the tag too via /git/refs to keep the repo tidy.
 */
export const deleteBackup = async (
    config: CloudBackupConfig,
    file: CloudBackupFile,
): Promise<boolean> => {
    const token = config.githubToken;
    const owner = config.githubOwner;
    const repo = repoName(config);
    if (!token || !owner) return false;

    const [releaseIdStr] = file.href.split(':');
    const releaseId = Number(releaseIdStr);
    if (!releaseId) return false;

    try {
        // Look up tag name first so we can clean it up after the release goes.
        let tagName: string | null = null;
        try {
            const meta = await ghRequest(config, `${API_HOST}/repos/${owner}/${repo}/releases/${releaseId}`, 'GET', {
                headers: authHeaders(token),
            });
            if (meta.status === 200) {
                const data = await meta.json();
                tagName = data.tag_name || null;
            }
        } catch { /* non-fatal */ }

        const del = await ghRequest(config, `${API_HOST}/repos/${owner}/${repo}/releases/${releaseId}`, 'DELETE', {
            headers: authHeaders(token),
        });
        const ok = del.status === 204;
        if (ok && tagName) {
            await ghRequest(config, `${API_HOST}/repos/${owner}/${repo}/git/refs/tags/${tagName}`, 'DELETE', {
                headers: authHeaders(token),
            }).catch(() => {});
        }
        return ok;
    } catch {
        return false;
    }
};

export const cleanupOldBackups = async (
    config: CloudBackupConfig,
    keepCount: number = 5,
): Promise<number> => {
    const files = await listBackups(config);
    if (files.length <= keepCount) return 0;
    let deleted = 0;
    for (const file of files.slice(keepCount)) {
        if (await deleteBackup(config, file)) deleted++;
    }
    return deleted;
};
