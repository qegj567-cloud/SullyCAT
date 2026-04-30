/**
 * 麦当劳 MCP 客户端 (Model Context Protocol over HTTP+SSE)
 *
 * 上游: https://mcp.mcd.cn  (官方麦当劳中国 MCP server)
 * 文档: https://open.mcd.cn/mcp/doc
 * Token: https://open.mcd.cn/mcp 申请, 每个用户独立, 存 localStorage
 *
 * 浏览器无法直连 mcd.cn (CORS), 走自家 Cloudflare Worker 透传:
 *   POST  https://sullymeow.ccwu.cc/mcp/mcd
 *   Authorization: Bearer <user_mcp_token>
 *   body: 标准 JSON-RPC 2.0 报文
 */

const MCP_PROXY_URL = 'https://sullymeow.ccwu.cc/mcp/mcd';
const MCP_TOKEN_KEY = 'aetheros.mcd.mcpToken';
const MCP_ENABLED_KEY = 'aetheros.mcd.mcpEnabled';

export interface McdToolDef {
    name: string;
    description?: string;
    inputSchema?: any;
}

export interface McdToolResult {
    success: boolean;
    data?: any;
    rawText?: string;
    error?: string;
}

interface McpJsonRpcRequest {
    jsonrpc: '2.0';
    method: string;
    params?: any;
    id?: number;
}

interface McpJsonRpcResponse {
    jsonrpc: '2.0';
    id?: number;
    result?: any;
    error?: { code: number; message: string; data?: any };
}

// ========== Token / 启用状态 (持久化在 localStorage) ==========

export const getMcdToken = (): string => {
    try { return localStorage.getItem(MCP_TOKEN_KEY) || ''; } catch { return ''; }
};

export const setMcdToken = (token: string): void => {
    try { localStorage.setItem(MCP_TOKEN_KEY, token.trim()); } catch { /* ignore */ }
};

export const isMcdEnabled = (): boolean => {
    try { return localStorage.getItem(MCP_ENABLED_KEY) === '1'; } catch { return false; }
};

export const setMcdEnabled = (enabled: boolean): void => {
    try { localStorage.setItem(MCP_ENABLED_KEY, enabled ? '1' : '0'); } catch { /* ignore */ }
};

export const isMcdConfigured = (): boolean => {
    return isMcdEnabled() && getMcdToken().length > 0;
};

// ========== JSON-RPC 会话状态 (内存, 进程级) ==========

let requestIdCounter = 0;
let sessionId: string | null = null;
let initialized = false;
let cachedTools: McdToolDef[] = [];
let initPromise: Promise<void> | null = null;

const buildRequest = (method: string, params?: any, isNotification = false): McpJsonRpcRequest => {
    const req: McpJsonRpcRequest = { jsonrpc: '2.0', method, params };
    if (!isNotification) req.id = ++requestIdCounter;
    return req;
};

const parseSse = (text: string): McpJsonRpcResponse | null => {
    const dataLines: string[] = [];
    for (const line of text.split('\n')) {
        if (line.startsWith('data: ')) dataLines.push(line.slice(6));
        else if (line.startsWith('data:')) dataLines.push(line.slice(5));
    }
    for (let i = dataLines.length - 1; i >= 0; i--) {
        try { return JSON.parse(dataLines[i]); } catch { /* try previous */ }
    }
    return null;
};

const parseResp = (text: string, contentType: string): McpJsonRpcResponse => {
    if (contentType.includes('text/event-stream') || /^\s*(event:|data:)/.test(text)) {
        const parsed = parseSse(text);
        if (parsed) return parsed;
    }
    try { return JSON.parse(text); } catch {
        const m = text.match(/\{[\s\S]*\}/);
        if (m) { try { return JSON.parse(m[0]); } catch { /* fall through */ } }
        throw new Error(`MCP: 无法解析响应: ${text.slice(0, 300)}`);
    }
};

const post = async (
    body: McpJsonRpcRequest,
    expectResponse = true
): Promise<{ response: McpJsonRpcResponse | null }> => {
    const token = getMcdToken();
    if (!token) throw new Error('未配置麦当劳 MCP Token，请到设置 → 麦当劳填入');

    const headers: Record<string, string> = {
        'Content-Type': 'application/json',
        'Accept': 'application/json, text/event-stream',
        'Authorization': `Bearer ${token}`,
    };
    if (sessionId) headers['Mcp-Session-Id'] = sessionId;

    const resp = await fetch(MCP_PROXY_URL, {
        method: 'POST',
        headers,
        body: JSON.stringify(body),
    });
    const newSid = resp.headers.get('Mcp-Session-Id') || resp.headers.get('mcp-session-id');
    if (newSid) sessionId = newSid;

    if (resp.status === 401 || resp.status === 403) {
        const txt = await resp.text().catch(() => '');
        throw new Error(`MCP 鉴权失败 (${resp.status}): Token 可能已过期或无效。${txt.slice(0, 120)}`);
    }
    if (resp.status === 202) return { response: null };
    if (!resp.ok) {
        const txt = await resp.text().catch(() => '');
        throw new Error(`MCP HTTP ${resp.status}: ${txt.slice(0, 200)}`);
    }
    if (!expectResponse) return { response: null };

    const ct = resp.headers.get('content-type') || '';
    const text = await resp.text();
    return { response: parseResp(text, ct) };
};

const doInitialize = async (): Promise<void> => {
    const initReq = buildRequest('initialize', {
        protocolVersion: '2024-11-05',
        capabilities: {},
        clientInfo: { name: 'AetherOS-Aetheros', version: '1.0.0' },
    });
    const { response } = await post(initReq);
    if (response?.error) throw new Error(`Initialize 失败: ${response.error.message}`);

    // 通知 server 初始化完成 (协议要求)
    const notif = buildRequest('notifications/initialized', {}, true);
    await post(notif, false).catch(() => { /* notification 失败不阻塞 */ });

    // 拉取工具清单
    try {
        const { response: toolsResp } = await post(buildRequest('tools/list'));
        if (toolsResp?.result?.tools && Array.isArray(toolsResp.result.tools)) {
            cachedTools = toolsResp.result.tools.map((t: any) => ({
                name: t.name,
                description: t.description || '',
                inputSchema: t.inputSchema || t.input_schema || { type: 'object', properties: {} },
            }));
            console.log('[MCD-MCP] 工具清单:', cachedTools.map(t => t.name).join(', '));
        }
    } catch (e) {
        console.warn('[MCD-MCP] tools/list 失败:', e);
    }

    initialized = true;
};

const ensureInitialized = async (): Promise<void> => {
    if (initialized) return;
    if (!initPromise) {
        initPromise = doInitialize().catch((e) => {
            initPromise = null;
            throw e;
        });
    }
    await initPromise;
};

// ========== 公开 API ==========

/** 拉取工具清单 (会触发首次 initialize, 之后内存缓存) */
export const listMcdTools = async (forceRefresh = false): Promise<McdToolDef[]> => {
    if (forceRefresh) {
        initialized = false;
        sessionId = null;
        cachedTools = [];
        initPromise = null;
    }
    await ensureInitialized();
    return cachedTools;
};

/** 调用一个工具 */
export const callMcdTool = async (toolName: string, args: Record<string, any> = {}): Promise<McdToolResult> => {
    try {
        await ensureInitialized();
        const body = buildRequest('tools/call', { name: toolName, arguments: args });
        const { response } = await post(body);
        if (!response) return { success: false, error: '空响应' };
        if (response.error) return { success: false, error: `MCP 错误 [${response.error.code}]: ${response.error.message}` };

        const result = response.result;
        if (result?.content && Array.isArray(result.content)) {
            const textParts = result.content.filter((c: any) => c?.type === 'text').map((c: any) => c.text || '');
            const fullText = textParts.join('\n').trim();
            if (result.isError) return { success: false, error: fullText || '麦当劳工具执行失败', rawText: fullText };

            // 在混合文本(markdown 说明 + JSON)里挖出 JSON。
            // 麦当劳 MCP 习惯在每个响应前塞一段 "## Response Structure" 渲染规范, 然后才接真数据。
            // 数据里有时会有未转义的真换行符 / 制表符, JSON.parse 会直接失败 → 加一道修复尝试。
            const repairJson = (s: string): string => {
                let inStr = false, esc = false, out = '';
                for (let i = 0; i < s.length; i++) {
                    const ch = s[i];
                    if (esc) { out += ch; esc = false; continue; }
                    if (ch === '\\') { out += ch; esc = true; continue; }
                    if (ch === '"') { inStr = !inStr; out += ch; continue; }
                    if (inStr && ch === '\n') { out += '\\n'; continue; }
                    if (inStr && ch === '\r') { out += '\\r'; continue; }
                    if (inStr && ch === '\t') { out += '\\t'; continue; }
                    out += ch;
                }
                return out;
            };
            const safeParse = (s: string): any => {
                try { return JSON.parse(s); } catch { /* try repair */ }
                try { return JSON.parse(repairJson(s)); } catch { return undefined; }
            };
            const tryExtractJsonFromMixed = (text: string): any => {
                if (!text) return undefined;
                // 1) 整段直接是 JSON
                const direct = safeParse(text);
                if (direct !== undefined) return direct;
                // 2) ```json 围栏
                const fenceMatch = text.match(/```(?:json)?\s*([\s\S]*?)```/i);
                if (fenceMatch) {
                    const fenced = safeParse(fenceMatch[1].trim());
                    if (fenced !== undefined) return fenced;
                }
                // 3) 扫描所有 { 和 [ 起点, 用括号配平找完整结构, 选择最大的那个
                const candidates: any[] = [];
                const tryBalanced = (start: number, open: string, close: string) => {
                    let depth = 0, inStr = false, esc = false;
                    for (let i = start; i < text.length; i++) {
                        const ch = text[i];
                        if (esc) { esc = false; continue; }
                        if (ch === '\\') { esc = true; continue; }
                        if (ch === '"') { inStr = !inStr; continue; }
                        if (inStr) continue;
                        if (ch === open) depth++;
                        else if (ch === close) {
                            depth--;
                            if (depth === 0) {
                                const slice = text.slice(start, i + 1);
                                const parsed = safeParse(slice);
                                if (parsed && typeof parsed === 'object') {
                                    candidates.push({ parsed, len: slice.length });
                                }
                                return; // 找到一个合法的就回主循环找下一个起点
                            }
                        }
                    }
                };
                for (let i = 0; i < text.length; i++) {
                    if (text[i] === '{') tryBalanced(i, '{', '}');
                    else if (text[i] === '[') tryBalanced(i, '[', ']');
                }
                if (candidates.length) {
                    candidates.sort((a, b) => b.len - a.len); // 选最长的那个 (大概率是数据本体)
                    return candidates[0].parsed;
                }
                return undefined;
            };
            // 解析: 上游有时把数据再次 stringify 装进 {data: "..."} / {result: "..."} 这类外壳,
            // 这里递归剥一层, 让卡片拿到真正的对象/数组
            const tryDeepParse = (v: any): any => {
                if (typeof v === 'string') {
                    const s = v.trim();
                    if (s.startsWith('{') || s.startsWith('[')) {
                        try { return tryDeepParse(JSON.parse(s)); } catch { return v; }
                    }
                    return v;
                }
                if (v && typeof v === 'object' && !Array.isArray(v)) {
                    // 麦当劳响应都套一层信封: {success, code, message, datetime, traceId, data: {...}}
                    // 自动剥掉, 直接把 data 字段当成数据本体
                    const envelopeKeys = ['success', 'code', 'message', 'datetime', 'traceId', 'msg', 'errorCode', 'errMsg'];
                    if ('data' in v && envelopeKeys.some(k => k in v)) {
                        const inner = v.data;
                        if (inner && typeof inner === 'object') return tryDeepParse(inner);
                        if (typeof inner === 'string') {
                            const s = inner.trim();
                            if (s.startsWith('{') || s.startsWith('[')) {
                                try { return tryDeepParse(JSON.parse(s)); } catch { /* fall through */ }
                            }
                        }
                    }
                    // 单字段壳: {data: "..."} / {result: "..."} 等
                    const keys = Object.keys(v);
                    const wrapKeys = ['data', 'result', 'response', 'body', 'payload'];
                    if (keys.length === 1 && wrapKeys.includes(keys[0]) && typeof v[keys[0]] === 'string') {
                        const inner = tryDeepParse(v[keys[0]]);
                        if (inner && typeof inner === 'object') return inner;
                    }
                    // 否则对每个 string 字段尝试解 (一层即可, 避免无限递归)
                    const out: any = Array.isArray(v) ? [] : {};
                    for (const k of keys) {
                        const cv = v[k];
                        if (typeof cv === 'string') {
                            const s = cv.trim();
                            if (s.startsWith('{') || s.startsWith('[')) {
                                try { out[k] = JSON.parse(s); continue; } catch { /* ignore */ }
                            }
                        }
                        out[k] = cv;
                    }
                    return out;
                }
                return v;
            };
            // 先尝试整段直接 parse, 不行再扫描混合文本
            let parsed: any = undefined;
            let parseRoute = 'none';
            try {
                parsed = JSON.parse(fullText);
                parseRoute = 'direct';
            } catch {
                parsed = tryExtractJsonFromMixed(fullText);
                if (parsed !== undefined) parseRoute = 'extracted';
            }
            if (parsed !== undefined) {
                const finalData = tryDeepParse(parsed);
                // 诊断日志: 让用户能看到工具到底返回了什么形态
                try {
                    const topKeys = finalData && typeof finalData === 'object' && !Array.isArray(finalData)
                        ? Object.keys(finalData).slice(0, 10).join(',')
                        : (Array.isArray(finalData) ? `[Array len=${finalData.length}]` : typeof finalData);
                    console.log(`🍔 [MCD-MCP] 工具结果 ${parseRoute} | rawLen=${fullText.length} | topKeys=${topKeys}`);
                } catch { /* ignore log errors */ }
                return { success: true, data: finalData, rawText: fullText };
            }
            console.warn(`🍔 [MCD-MCP] 工具结果 parse 全失败, rawLen=${fullText.length}, 前 200 字: ${fullText.slice(0, 200)}`);
            // 实在挖不到 JSON 就当成纯文本
            return { success: true, data: fullText, rawText: fullText };
        }
        return { success: true, data: result };
    } catch (e: any) {
        return { success: false, error: e?.message || String(e) };
    }
};

/** 测试连接: 仅验证 token 是否能成功 initialize + 拿到 tools */
export const testMcdConnection = async (): Promise<{ ok: boolean; message: string; tools?: McdToolDef[] }> => {
    try {
        // 重置状态以避免缓存的旧 session
        initialized = false;
        sessionId = null;
        cachedTools = [];
        initPromise = null;
        const tools = await listMcdTools(false);
        if (!tools.length) return { ok: true, message: '已连接, 但工具清单为空 (可能服务侧未挂载工具)', tools };
        return { ok: true, message: `已连接, 拿到 ${tools.length} 个工具`, tools };
    } catch (e: any) {
        return { ok: false, message: e?.message || String(e) };
    }
};

/** 强制重置会话 (token 改变 / 退出登录时调用) */
export const resetMcdSession = (): void => {
    initialized = false;
    sessionId = null;
    cachedTools = [];
    initPromise = null;
};
