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
            // 优先尝试解析 JSON, 失败则返回原文
            try {
                return { success: true, data: JSON.parse(fullText), rawText: fullText };
            } catch {
                return { success: true, data: fullText, rawText: fullText };
            }
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
