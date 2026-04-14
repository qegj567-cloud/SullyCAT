/**
 * Memory Palace — 浏览器 Console 调试工具
 *
 * 模块首次被加载时（任何记忆宫殿功能启动时），自动把以下函数挂到 window：
 *
 *   __mpFind(keyword, charId?)
 *       列出 content/tags/boxTopic 包含 keyword 的所有记忆节点，
 *       展示 id / content / room / importance / embedded / createdAt / accessCount。
 *
 *   __mpStats(charId?)
 *       统计该角色的记忆分布：各房间数量、已向量化 vs 未向量化、
 *       importance 分布、最老/最新记忆日期。
 *
 *   __mpListChars()
 *       列出所有角色的 charId + 记忆条数，方便找正确的 charId。
 *
 * 不要在生产 UI 里依赖这些函数，它们只是给你和我排查问题用的。
 */

import { MemoryNodeDB, MemoryVectorDB } from './db';
import type { MemoryNode } from './types';

function formatNode(n: MemoryNode) {
    const d = new Date(n.createdAt);
    const dateStr = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
    return {
        id: n.id.slice(-8),  // 只显示 id 尾部 8 位，节省表格宽度
        日期: dateStr,
        room: n.room,
        imp: n.importance,
        embedded: n.embedded ? '✓' : '✗',
        访问: n.accessCount,
        tags: (n.tags || []).join(','),
        内容: n.content.slice(0, 60) + (n.content.length > 60 ? '…' : ''),
    };
}

async function resolveCharId(charId?: string): Promise<string | null> {
    if (charId) return charId;
    // 从 localStorage 找活跃角色
    try {
        const { DB } = await import('../db');
        const chars = await DB.getAllCharacters();
        if (chars.length === 1) return chars[0].id;
        if (chars.length === 0) {
            console.warn('[__mp] 没有任何角色');
            return null;
        }
        // 多角色时列出让用户选
        console.warn(`[__mp] 有 ${chars.length} 个角色，请指定 charId。调用 __mpListChars() 查看。`);
        return null;
    } catch (e: any) {
        console.error('[__mp] 读取角色失败:', e.message);
        return null;
    }
}

/** 按关键词搜索记忆（字面匹配 content / tags / boxTopic） */
async function mpFind(keyword: string, charId?: string): Promise<void> {
    if (!keyword) {
        console.warn('用法: __mpFind("外公") 或 __mpFind("外公", "charId_xxx")');
        return;
    }
    const id = await resolveCharId(charId);
    if (!id) return;

    const allNodes = await MemoryNodeDB.getByCharId(id);
    const kw = keyword.toLowerCase();
    const matches = allNodes.filter(n =>
        n.content.toLowerCase().includes(kw)
        || (n.tags || []).some(t => t.toLowerCase().includes(kw))
        || (n.boxTopic || '').toLowerCase().includes(kw)
    );

    console.log(`🔎 [__mpFind] 角色 ${id} 共 ${allNodes.length} 条记忆，命中 "${keyword}" 的 ${matches.length} 条：`);
    if (matches.length === 0) {
        console.warn(`❗ 没有记忆包含 "${keyword}"。这说明：`);
        console.warn('   1) 要么这条记忆从未被 LLM 提取（聊天还没跑过 processNewMessages）');
        console.warn('   2) 要么 LLM 提取时用了别的表达（比如"姥爷"、"她的家人"、代词"他"）');
        console.warn(`   试试 __mpFind("姥爷"), __mpFind("心梗"), __mpFind("住院") 等近义词`);
        return;
    }
    console.table(matches.map(formatNode));

    // 附加：检查向量存在性
    const unembedded = matches.filter(n => !n.embedded);
    if (unembedded.length > 0) {
        console.warn(`⚠️ 其中 ${unembedded.length} 条 embedded=✗，向量和 BM25 搜索都拿不到它们！`);
    }
    // 逐条打印完整内容，方便复制核对
    console.groupCollapsed(`📜 完整内容（${matches.length} 条）`);
    for (const n of matches) {
        console.log(`[${n.room} · imp=${n.importance} · ${new Date(n.createdAt).toLocaleDateString('zh-CN')}] (id=${n.id})`);
        console.log(`  ${n.content}`);
        console.log(`  tags: [${(n.tags || []).join(', ')}] | embedded: ${n.embedded} | accessCount: ${n.accessCount}`);
    }
    console.groupEnd();
}

/** 统计当前角色的记忆分布 */
async function mpStats(charId?: string): Promise<void> {
    const id = await resolveCharId(charId);
    if (!id) return;

    const allNodes = await MemoryNodeDB.getByCharId(id);
    if (allNodes.length === 0) {
        console.warn(`[__mpStats] 角色 ${id} 没有任何记忆`);
        return;
    }

    const byRoom: Record<string, number> = {};
    const byImp: Record<number, number> = {};
    let embedded = 0;
    let unembedded = 0;
    let oldestTs = Infinity;
    let newestTs = -Infinity;

    for (const n of allNodes) {
        byRoom[n.room] = (byRoom[n.room] || 0) + 1;
        byImp[n.importance] = (byImp[n.importance] || 0) + 1;
        if (n.embedded) embedded++; else unembedded++;
        if (n.createdAt < oldestTs) oldestTs = n.createdAt;
        if (n.createdAt > newestTs) newestTs = n.createdAt;
    }

    // 向量数
    let vectorCount = 0;
    try {
        const vecs = await MemoryVectorDB.getAllByCharId(id);
        vectorCount = vecs.length;
    } catch {}

    console.log(`📊 [__mpStats] 角色 ${id}`);
    console.log(`  总记忆数: ${allNodes.length}`);
    console.log(`  已向量化: ${embedded}  |  未向量化: ${unembedded}  |  实际向量条数: ${vectorCount}`);
    console.log(`  最老: ${new Date(oldestTs).toLocaleDateString('zh-CN')} | 最新: ${new Date(newestTs).toLocaleDateString('zh-CN')}`);
    console.log(`  按房间分布:`); console.table(byRoom);
    console.log(`  按重要性分布:`); console.table(byImp);
}

async function mpListChars(): Promise<void> {
    try {
        const { DB } = await import('../db');
        const chars = await DB.getAllCharacters();
        const rows = [];
        for (const c of chars) {
            const nodes = await MemoryNodeDB.getByCharId(c.id);
            rows.push({ charId: c.id, 名称: c.name, 记忆数: nodes.length });
        }
        console.table(rows);
    } catch (e: any) {
        console.error('[__mpListChars] 失败:', e.message);
    }
}

// ─── 自动注册到 window ───────────────────────────────
if (typeof window !== 'undefined') {
    const w = window as any;
    if (!w.__mpFind) {
        w.__mpFind = mpFind;
        w.__mpStats = mpStats;
        w.__mpListChars = mpListChars;
        console.log('🔧 [MemoryPalace Debug] Console 工具已就绪：__mpFind(keyword) · __mpStats() · __mpListChars()');
    }
}
