/**
 * Memory Palace — IndexedDB CRUD 操作
 *
 * 封装 6 张表的增删改查，复用主 db.ts 的 openDB()。
 */

import { openDB } from '../db';
import type {
    MemoryNode, MemoryVector, MemoryLink, MemoryBatch,
    TopicBox, Anticipation, MemoryRoom, BoxStatus, AnticipationStatus,
    EventBox,
} from './types';
import { bm25Index } from './bm25Index';

// ─── Store 名称常量 ────────────────────────────────────

const STORE_MEMORY_NODES   = 'memory_nodes';
const STORE_MEMORY_VECTORS = 'memory_vectors';
const STORE_MEMORY_LINKS   = 'memory_links';
const STORE_MEMORY_BATCHES = 'memory_batches';
const STORE_TOPIC_BOXES    = 'topic_boxes';
const STORE_ANTICIPATIONS  = 'anticipations';
const STORE_EVENT_BOXES    = 'event_boxes';

// ─── 通用辅助 ──────────────────────────────────────────

/** 通用 getAll by index */
async function getAllByIndex<T>(
    storeName: string, indexName: string, value: IDBValidKey
): Promise<T[]> {
    const db = await openDB();
    return new Promise((resolve, reject) => {
        const tx = db.transaction(storeName, 'readonly');
        const store = tx.objectStore(storeName);
        const index = store.index(indexName);
        const req = index.getAll(IDBKeyRange.only(value));
        req.onsuccess = () => resolve(req.result || []);
        req.onerror = () => reject(req.error);
    });
}

/** 通用 put */
async function put<T>(storeName: string, data: T): Promise<void> {
    const db = await openDB();
    return new Promise((resolve, reject) => {
        const tx = db.transaction(storeName, 'readwrite');
        tx.objectStore(storeName).put(data);
        tx.oncomplete = () => resolve();
        tx.onerror = () => reject(tx.error);
    });
}

/** 通用 get by key */
async function getByKey<T>(storeName: string, key: IDBValidKey): Promise<T | undefined> {
    const db = await openDB();
    return new Promise((resolve, reject) => {
        const tx = db.transaction(storeName, 'readonly');
        const req = tx.objectStore(storeName).get(key);
        req.onsuccess = () => resolve(req.result);
        req.onerror = () => reject(req.error);
    });
}

/** 通用 delete by key */
async function deleteByKey(storeName: string, key: IDBValidKey): Promise<void> {
    const db = await openDB();
    return new Promise((resolve, reject) => {
        const tx = db.transaction(storeName, 'readwrite');
        tx.objectStore(storeName).delete(key);
        tx.oncomplete = () => resolve();
        tx.onerror = () => reject(tx.error);
    });
}

/** 通用 getAll (全表) */
async function getAll<T>(storeName: string): Promise<T[]> {
    const db = await openDB();
    return new Promise((resolve, reject) => {
        const tx = db.transaction(storeName, 'readonly');
        const req = tx.objectStore(storeName).getAll();
        req.onsuccess = () => resolve(req.result || []);
        req.onerror = () => reject(req.error);
    });
}

// ─── MemoryNode CRUD ──────────────────────────────────

/** 读取远程向量配置（轻量，仅 localStorage 读取） */
function getRemoteVectorConfig(): { enabled: boolean; supabaseUrl: string; supabaseAnonKey: string; initialized: boolean } | null {
    try {
        const raw = localStorage.getItem('os_remote_vector_config');
        if (!raw) return null;
        const c = JSON.parse(raw);
        return (c.enabled && c.initialized) ? c : null;
    } catch { return null; }
}

/** save 后自动同步已向量化节点的 metadata 到远程 */
function syncNodeMetadataToRemote(node: MemoryNode): void {
    if (!node.embedded) return;
    const rc = getRemoteVectorConfig();
    if (!rc) return;
    // 懒加载 + fire-and-forget
    import('./supabaseVector').then(({ upsertVector }) => {
        // 只更新 metadata（room/importance/tags/mood/content），需要拿到向量
        getByKey<MemoryVector>(STORE_MEMORY_VECTORS, node.id).then(vec => {
            if (vec) upsertVector(rc, node.id, node.charId, vec.vector, node, vec.dimensions, vec.model).catch(() => {});
        });
    }).catch(() => {});
}

export const MemoryNodeDB = {
    save: async (node: MemoryNode) => {
        await put<MemoryNode>(STORE_MEMORY_NODES, node);
        // 写入验证：确认数据真的持久化了
        const verify = await getByKey<MemoryNode>(STORE_MEMORY_NODES, node.id);
        if (!verify) {
            console.error(`❌ [MemoryNodeDB] WRITE VERIFICATION FAILED for ${node.id}`);
            throw new Error(`Memory node write failed: ${node.id}`);
        }
        // BM25 倒排索引：内部按 contentSig 判断是否需要重新 tokenize，
        // touchAccess 之类只改 metadata 的写入会被自动跳过。
        bm25Index.onNodeSaved(node);
        syncNodeMetadataToRemote(node);
    },

    getById: (id: string) => getByKey<MemoryNode>(STORE_MEMORY_NODES, id),

    delete: async (id: string) => {
        await deleteByKey(STORE_MEMORY_NODES, id);
        bm25Index.onNodeDeleted(id);
    },

    getByCharId: (charId: string) =>
        getAllByIndex<MemoryNode>(STORE_MEMORY_NODES, 'charId', charId),

    getByRoom: (charId: string, room: MemoryRoom): Promise<MemoryNode[]> =>
        getAllByIndex<MemoryNode>(STORE_MEMORY_NODES, 'charId', charId)
            .then(nodes => nodes.filter(n => n.room === room)),

    getUnembedded: (charId: string): Promise<MemoryNode[]> =>
        getAllByIndex<MemoryNode>(STORE_MEMORY_NODES, 'charId', charId)
            .then(nodes => nodes.filter(n => !n.embedded)),

    /** @deprecated 旧话题盒 ID 查询，保留以兼容残留数据；新代码请用 getByEventBoxId */
    getByBoxId: (boxId: string) =>
        getAllByIndex<MemoryNode>(STORE_MEMORY_NODES, 'boxId', boxId),

    /** 按 EventBox ID 查询所属记忆节点（含 live + archived + summary） */
    getByEventBoxId: (eventBoxId: string) =>
        getAllByIndex<MemoryNode>(STORE_MEMORY_NODES, 'eventBoxId', eventBoxId),

    /** 批量保存 */
    saveMany: async (nodes: MemoryNode[]): Promise<void> => {
        const db = await openDB();
        await new Promise<void>((resolve, reject) => {
            const tx = db.transaction(STORE_MEMORY_NODES, 'readwrite');
            const store = tx.objectStore(STORE_MEMORY_NODES);
            for (const node of nodes) {
                store.put(node);
            }
            tx.oncomplete = () => resolve();
            tx.onerror = () => reject(tx.error);
        });
        bm25Index.onNodesSaved(nodes);
    },

    /** 更新访问记录（检索后调用） */
    touchAccess: async (id: string): Promise<void> => {
        const node = await getByKey<MemoryNode>(STORE_MEMORY_NODES, id);
        if (!node) return;
        node.lastAccessedAt = Date.now();
        node.accessCount += 1;
        await put<MemoryNode>(STORE_MEMORY_NODES, node);
        syncNodeMetadataToRemote(node);
    },
};

// ─── Float32Array 工具 ───────────────────────────────

/** 确保向量是 Float32Array（从 IndexedDB 取出的可能是普通 number[]） */
export function ensureFloat32(vec: number[] | Float32Array): Float32Array {
    if (vec instanceof Float32Array) return vec;
    return new Float32Array(vec);
}

/** 存入 IndexedDB 前转为普通数组（IndexedDB 结构化克隆支持 Float32Array，但为兼容性转为 Array） */
function vecForStorage(vec: number[] | Float32Array): number[] {
    if (vec instanceof Float32Array) return Array.from(vec);
    return vec;
}

// ─── MemoryVector CRUD ────────────────────────────────

export const MemoryVectorDB = {
    save: async (vec: MemoryVector) => {
        const stored = { ...vec, vector: vecForStorage(vec.vector) };
        await put<MemoryVector>(STORE_MEMORY_VECTORS, stored);
        // 写入验证
        const verify = await getByKey<MemoryVector>(STORE_MEMORY_VECTORS, vec.memoryId);
        if (!verify) {
            console.error(`❌ [MemoryVectorDB] WRITE VERIFICATION FAILED for ${vec.memoryId}`);
            throw new Error(`Memory vector write failed: ${vec.memoryId}`);
        }
    },

    getByMemoryId: (memoryId: string) =>
        getByKey<MemoryVector>(STORE_MEMORY_VECTORS, memoryId),

    delete: (memoryId: string) => deleteByKey(STORE_MEMORY_VECTORS, memoryId),

    /**
     * 获取角色的全部向量 — 优先使用 charId 索引直查，避免全表扫描。
     * 向量自动转为 Float32Array 以减少内存占用。
     *
     * 兼容旧数据（无 charId 字段）：回退到 memory_nodes 联合查询。
     */
    getAllByCharId: async (charId: string): Promise<MemoryVector[]> => {
        // 尝试通过 charId 索引直查（新数据路径）
        try {
            const indexed = await getAllByIndex<MemoryVector>(STORE_MEMORY_VECTORS, 'charId', charId);
            if (indexed.length > 0) {
                // 转为 Float32Array 减少内存
                return indexed.map(v => ({ ...v, vector: ensureFloat32(v.vector) }));
            }
        } catch {
            // 索引不存在（旧版本 DB），走兼容路径
        }

        // 兼容旧数据回退：通过 memory_nodes 联合查询
        const nodes = await getAllByIndex<MemoryNode>(STORE_MEMORY_NODES, 'charId', charId);
        const embeddedIds = new Set(nodes.filter(n => n.embedded).map(n => n.id));
        if (embeddedIds.size === 0) return [];

        const allVectors = await getAll<MemoryVector>(STORE_MEMORY_VECTORS);
        const matched = allVectors.filter(v => embeddedIds.has(v.memoryId));

        // 顺便回填 charId 字段，下次就能走索引了
        if (matched.length > 0) {
            const db = await openDB();
            const tx = db.transaction(STORE_MEMORY_VECTORS, 'readwrite');
            const store = tx.objectStore(STORE_MEMORY_VECTORS);
            for (const v of matched) {
                if (!v.charId) {
                    v.charId = charId;
                    store.put({ ...v, vector: vecForStorage(v.vector) });
                }
            }
        }

        return matched.map(v => ({ ...v, charId, vector: ensureFloat32(v.vector) }));
    },

    /** 批量保存 */
    saveMany: async (vectors: MemoryVector[]): Promise<void> => {
        const db = await openDB();
        return new Promise((resolve, reject) => {
            const tx = db.transaction(STORE_MEMORY_VECTORS, 'readwrite');
            const store = tx.objectStore(STORE_MEMORY_VECTORS);
            for (const vec of vectors) {
                store.put({ ...vec, vector: vecForStorage(vec.vector) });
            }
            tx.oncomplete = () => resolve();
            tx.onerror = () => reject(tx.error);
        });
    },
};

// ─── MemoryLink CRUD ──────────────────────────────────

export const MemoryLinkDB = {
    save: (link: MemoryLink) => put<MemoryLink>(STORE_MEMORY_LINKS, link),

    delete: (id: string) => deleteByKey(STORE_MEMORY_LINKS, id),

    getBySourceId: (sourceId: string) =>
        getAllByIndex<MemoryLink>(STORE_MEMORY_LINKS, 'sourceId', sourceId),

    getByTargetId: (targetId: string) =>
        getAllByIndex<MemoryLink>(STORE_MEMORY_LINKS, 'targetId', targetId),

    /** 获取与某节点相关的所有链接（source 或 target） */
    getByNodeId: async (nodeId: string): Promise<MemoryLink[]> => {
        const [asSource, asTarget] = await Promise.all([
            getAllByIndex<MemoryLink>(STORE_MEMORY_LINKS, 'sourceId', nodeId),
            getAllByIndex<MemoryLink>(STORE_MEMORY_LINKS, 'targetId', nodeId),
        ]);
        // 去重（同一条 link 不会同时出现在两个结果中，因为 sourceId ≠ targetId）
        const seen = new Set<string>();
        const result: MemoryLink[] = [];
        for (const link of [...asSource, ...asTarget]) {
            if (!seen.has(link.id)) {
                seen.add(link.id);
                result.push(link);
            }
        }
        return result;
    },

    /** 批量保存 */
    saveMany: async (links: MemoryLink[]): Promise<void> => {
        const db = await openDB();
        return new Promise((resolve, reject) => {
            const tx = db.transaction(STORE_MEMORY_LINKS, 'readwrite');
            const store = tx.objectStore(STORE_MEMORY_LINKS);
            for (const link of links) {
                store.put(link);
            }
            tx.oncomplete = () => resolve();
            tx.onerror = () => reject(tx.error);
        });
    },
};

// ─── MemoryBatch CRUD ─────────────────────────────────

export const MemoryBatchDB = {
    save: (batch: MemoryBatch) => put<MemoryBatch>(STORE_MEMORY_BATCHES, batch),

    getByCharId: (charId: string) =>
        getAllByIndex<MemoryBatch>(STORE_MEMORY_BATCHES, 'charId', charId),
};

// ─── TopicBox CRUD ────────────────────────────────────

export const TopicBoxDB = {
    save: (box: TopicBox) => put<TopicBox>(STORE_TOPIC_BOXES, box),

    getById: (id: string) => getByKey<TopicBox>(STORE_TOPIC_BOXES, id),

    getByCharId: (charId: string) =>
        getAllByIndex<TopicBox>(STORE_TOPIC_BOXES, 'charId', charId),

    /** 获取角色当前 open 的盒子（最多一个） */
    getOpenBox: async (charId: string): Promise<TopicBox | undefined> => {
        const boxes = await getAllByIndex<TopicBox>(STORE_TOPIC_BOXES, 'charId', charId);
        return boxes.find(b => b.status === 'open');
    },

    /** 按状态过滤 */
    getByStatus: (charId: string, status: BoxStatus): Promise<TopicBox[]> =>
        getAllByIndex<TopicBox>(STORE_TOPIC_BOXES, 'charId', charId)
            .then(boxes => boxes.filter(b => b.status === status)),
};

// ─── EventBox CRUD ────────────────────────────────────

export const EventBoxDB = {
    save: (box: EventBox) => put<EventBox>(STORE_EVENT_BOXES, box),

    getById: (id: string) => getByKey<EventBox>(STORE_EVENT_BOXES, id),

    delete: (id: string) => deleteByKey(STORE_EVENT_BOXES, id),

    getByCharId: (charId: string) =>
        getAllByIndex<EventBox>(STORE_EVENT_BOXES, 'charId', charId),

    /** 批量保存（merge/compression 场景用） */
    saveMany: async (boxes: EventBox[]): Promise<void> => {
        if (boxes.length === 0) return;
        const db = await openDB();
        return new Promise((resolve, reject) => {
            const tx = db.transaction(STORE_EVENT_BOXES, 'readwrite');
            const store = tx.objectStore(STORE_EVENT_BOXES);
            for (const box of boxes) store.put(box);
            tx.oncomplete = () => resolve();
            tx.onerror = () => reject(tx.error);
        });
    },
};

// ─── Anticipation CRUD ────────────────────────────────

export const AnticipationDB = {
    save: (ant: Anticipation) => put<Anticipation>(STORE_ANTICIPATIONS, ant),

    getById: (id: string) => getByKey<Anticipation>(STORE_ANTICIPATIONS, id),

    getByCharId: (charId: string) =>
        getAllByIndex<Anticipation>(STORE_ANTICIPATIONS, 'charId', charId),

    getByStatus: (charId: string, status: AnticipationStatus): Promise<Anticipation[]> =>
        getAllByIndex<Anticipation>(STORE_ANTICIPATIONS, 'charId', charId)
            .then(ants => ants.filter(a => a.status === status)),

    getActive: (charId: string) =>
        AnticipationDB.getByStatus(charId, 'active'),
};
