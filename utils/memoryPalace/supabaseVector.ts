/**
 * Memory Palace — Supabase pgvector 远程向量存储
 *
 * 用户在自己的 Supabase 项目里存储向量，本地只做缓存。
 * 使用原生 fetch 调用 PostgREST API，无需额外依赖。
 *
 * 数据归属：100% 在用户自己的 Supabase 项目，我们不碰不存。
 */

import type { RemoteVectorConfig, MemoryNode } from './types';

// ─── 初始化 SQL（用户需在 Supabase SQL Editor 运行一次） ──

export const INIT_SQL = `
-- 1. 启用 pgvector 扩展
create extension if not exists vector;

-- 2. 创建向量表
create table if not exists memory_vectors (
  memory_id text primary key,
  char_id text not null,
  content text not null default '',
  vector vector(1024),
  dimensions int default 1024,
  model text,
  room text,
  importance int default 5,
  tags text[] default '{}',
  mood text default '',
  created_at bigint default (extract(epoch from now()) * 1000)::bigint
);

-- 3. 创建索引
create index if not exists idx_mv_char_id on memory_vectors(char_id);
create index if not exists idx_mv_hnsw on memory_vectors
  using hnsw (vector vector_cosine_ops);

-- 4. 相似度搜索函数
create or replace function match_vectors(
  query_embedding vector(1024),
  match_char_id text,
  match_threshold float default 0.3,
  match_count int default 20
)
returns table (
  memory_id text,
  char_id text,
  content text,
  similarity float,
  room text,
  importance int,
  tags text[],
  mood text
)
language sql stable
as $$
  select
    mv.memory_id,
    mv.char_id,
    mv.content,
    1 - (mv.vector <=> query_embedding) as similarity,
    mv.room,
    mv.importance,
    mv.tags,
    mv.mood
  from memory_vectors mv
  where mv.char_id = match_char_id
    and 1 - (mv.vector <=> query_embedding) > match_threshold
  order by mv.vector <=> query_embedding
  limit match_count;
$$;

-- 5. 行级安全（允许 anon key 完全访问 — 这是用户自己的数据库）
alter table memory_vectors enable row level security;
drop policy if exists "Allow all access" on memory_vectors;
create policy "Allow all access" on memory_vectors
  for all using (true) with check (true);
`.trim();

// ─── Supabase REST helpers ───────────────────────────

function headers(config: RemoteVectorConfig): Record<string, string> {
    return {
        'apikey': config.supabaseAnonKey,
        'Authorization': `Bearer ${config.supabaseAnonKey}`,
        'Content-Type': 'application/json',
        'Prefer': 'return=minimal',
    };
}

function restUrl(config: RemoteVectorConfig, path: string): string {
    return `${config.supabaseUrl.replace(/\/+$/, '')}/rest/v1${path}`;
}

function rpcUrl(config: RemoteVectorConfig, fn: string): string {
    return `${config.supabaseUrl.replace(/\/+$/, '')}/rest/v1/rpc/${fn}`;
}

// ─── 公共 API ────────────────────────────────────────

/**
 * 测试连接 + 检测表是否存在
 */
export async function testConnection(config: RemoteVectorConfig): Promise<{
    ok: boolean;
    tableExists: boolean;
    message: string;
}> {
    try {
        const res = await fetch(restUrl(config, '/memory_vectors?select=memory_id&limit=1'), {
            headers: headers(config),
        });

        if (res.status === 200) {
            return { ok: true, tableExists: true, message: '连接成功，表已就绪' };
        }
        if (res.status === 404 || res.status === 406) {
            // Table doesn't exist — PostgREST returns 404 or specific error
            return { ok: true, tableExists: false, message: '连接成功，但表尚未创建（请运行初始化 SQL）' };
        }
        if (res.status === 401) {
            return { ok: false, tableExists: false, message: '认证失败：请检查 anon key' };
        }
        const body = await res.text().catch(() => '');
        // Check for "relation does not exist" error
        if (body.includes('does not exist') || body.includes('relation')) {
            return { ok: true, tableExists: false, message: '连接成功，但表尚未创建（请运行初始化 SQL）' };
        }
        return { ok: false, tableExists: false, message: `服务器返回 ${res.status}: ${body.slice(0, 100)}` };
    } catch (e: any) {
        return { ok: false, tableExists: false, message: `连接失败: ${e.message}` };
    }
}

/**
 * 插入或更新向量（upsert）
 */
export async function upsertVector(
    config: RemoteVectorConfig,
    memoryId: string,
    charId: string,
    vector: number[] | Float32Array,
    node: MemoryNode,
    dimensions: number,
    model?: string,
): Promise<boolean> {
    try {
        const vecArray = vector instanceof Float32Array ? Array.from(vector) : vector;
        const body = {
            memory_id: memoryId,
            char_id: charId,
            content: node.content,
            vector: `[${vecArray.join(',')}]`,
            dimensions,
            model: model || null,
            room: node.room,
            importance: node.importance,
            tags: node.tags,
            mood: node.mood,
            created_at: node.createdAt,
        };

        const res = await fetch(restUrl(config, '/memory_vectors'), {
            method: 'POST',
            headers: {
                ...headers(config),
                'Prefer': 'resolution=merge-duplicates,return=minimal',
            },
            body: JSON.stringify(body),
        });

        return res.ok;
    } catch {
        return false;
    }
}

/**
 * 批量插入向量
 */
export async function upsertVectorBatch(
    config: RemoteVectorConfig,
    items: {
        memoryId: string;
        charId: string;
        vector: number[] | Float32Array;
        node: MemoryNode;
        dimensions: number;
        model?: string;
    }[],
): Promise<boolean> {
    if (items.length === 0) return true;
    try {
        const body = items.map(item => {
            const vecArray = item.vector instanceof Float32Array ? Array.from(item.vector) : item.vector;
            return {
                memory_id: item.memoryId,
                char_id: item.charId,
                content: item.node.content,
                vector: `[${vecArray.join(',')}]`,
                dimensions: item.dimensions,
                model: item.model || null,
                room: item.node.room,
                importance: item.node.importance,
                tags: item.node.tags,
                mood: item.node.mood,
                created_at: item.node.createdAt,
            };
        });

        const res = await fetch(restUrl(config, '/memory_vectors'), {
            method: 'POST',
            headers: {
                ...headers(config),
                'Prefer': 'resolution=merge-duplicates,return=minimal',
            },
            body: JSON.stringify(body),
        });

        return res.ok;
    } catch {
        return false;
    }
}

/**
 * 向量相似度搜索（调用 match_vectors RPC 函数）
 */
export async function searchVectors(
    config: RemoteVectorConfig,
    queryVector: number[] | Float32Array,
    charId: string,
    threshold: number = 0.3,
    topK: number = 20,
): Promise<{
    memoryId: string;
    content: string;
    similarity: number;
    room: string;
    importance: number;
    tags: string[];
    mood: string;
}[]> {
    try {
        const vecArray = queryVector instanceof Float32Array ? Array.from(queryVector) : queryVector;

        const res = await fetch(rpcUrl(config, 'match_vectors'), {
            method: 'POST',
            headers: headers(config),
            body: JSON.stringify({
                query_embedding: `[${vecArray.join(',')}]`,
                match_char_id: charId,
                match_threshold: threshold,
                match_count: topK,
            }),
        });

        if (!res.ok) return [];

        const data = await res.json();
        return (data || []).map((row: any) => ({
            memoryId: row.memory_id,
            content: row.content,
            similarity: row.similarity,
            room: row.room,
            importance: row.importance,
            tags: row.tags || [],
            mood: row.mood || '',
        }));
    } catch {
        return [];
    }
}

/**
 * 删除向量
 */
export async function deleteVector(config: RemoteVectorConfig, memoryId: string): Promise<boolean> {
    try {
        const res = await fetch(restUrl(config, `/memory_vectors?memory_id=eq.${encodeURIComponent(memoryId)}`), {
            method: 'DELETE',
            headers: headers(config),
        });
        return res.ok;
    } catch {
        return false;
    }
}

/**
 * 获取远程向量数量（用于 UI 显示）
 */
export async function getVectorCount(config: RemoteVectorConfig, charId?: string): Promise<number> {
    try {
        const filter = charId ? `&char_id=eq.${encodeURIComponent(charId)}` : '';
        const res = await fetch(restUrl(config, `/memory_vectors?select=memory_id${filter}`), {
            method: 'HEAD',
            headers: {
                ...headers(config),
                'Prefer': 'count=exact',
            },
        });
        const range = res.headers.get('content-range');
        if (range) {
            const match = range.match(/\/(\d+)/);
            if (match) return parseInt(match[1], 10);
        }
        return 0;
    } catch {
        return 0;
    }
}

/**
 * 将本地向量同步到远程（一次性迁移）
 */
export async function syncLocalToRemote(
    config: RemoteVectorConfig,
    getLocalVectors: () => Promise<{ memoryId: string; charId: string; vector: number[] | Float32Array; node: MemoryNode; dimensions: number; model?: string }[]>,
    onProgress?: (done: number, total: number) => void,
): Promise<{ synced: number; failed: number }> {
    const locals = await getLocalVectors();
    if (locals.length === 0) return { synced: 0, failed: 0 };

    let synced = 0, failed = 0;
    const BATCH = 50;

    for (let i = 0; i < locals.length; i += BATCH) {
        const batch = locals.slice(i, i + BATCH);
        const ok = await upsertVectorBatch(config, batch);
        if (ok) {
            synced += batch.length;
        } else {
            failed += batch.length;
        }
        onProgress?.(Math.min(i + BATCH, locals.length), locals.length);
    }

    return { synced, failed };
}
