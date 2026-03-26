import React, { useState, useEffect, useCallback } from 'react';
import { useOS } from '../context/OSContext';
import {
    MemoryRoom, MemoryNode, ROOM_CONFIGS, ROOM_LABELS,
    MemoryNodeDB, TopicBoxDB, AnticipationDB, MemoryLinkDB,
    migrateOldMemories, runCognitiveDigestion, processHistoricalChat,
} from '../utils/memoryPalace';
import type { Anticipation, MigrationProgress, DigestResult, HistoryProcessProgress } from '../utils/memoryPalace';

// ─── 房间图标映射 ─────────────────────────────────────

const ROOM_ICONS: Record<MemoryRoom, string> = {
    living_room: '🛋️',
    bedroom: '🛏️',
    study: '📚',
    user_room: '👤',
    self_room: '🪞',
    attic: '🧠',
    windowsill: '🌅',
};

const ROOM_COLORS: Record<MemoryRoom, string> = {
    living_room: '#22c55e',
    bedroom: '#ec4899',
    study: '#3b82f6',
    user_room: '#f59e0b',
    self_room: '#8b5cf6',
    attic: '#6b7280',
    windowsill: '#f97316',
};

// ─── 通用样式 ─────────────────────────────────────────

const inputClass = "w-full bg-white/50 border border-slate-200/60 rounded-xl px-4 py-2.5 text-sm font-mono focus:bg-white focus:outline-none focus:ring-1 focus:ring-violet-300 transition-all";
const labelClass = "text-[10px] font-bold text-slate-400 uppercase tracking-widest mb-1.5 block pl-1";

// ─── 主组件 ───────────────────────────────────────────

export default function MemoryPalaceApp() {
    const { activeCharacterId, characters, updateCharacter, setActiveCharacterId, closeApp, apiPresets, userProfile } = useOS();
    const char = characters.find(c => c.id === activeCharacterId);

    const [view, setView] = useState<'palace' | 'room' | 'memory' | 'settings'>('palace');
    const [selectedRoom, setSelectedRoom] = useState<MemoryRoom | null>(null);
    const [selectedNode, setSelectedNode] = useState<MemoryNode | null>(null);
    const [roomCounts, setRoomCounts] = useState<Record<MemoryRoom, number>>({} as any);
    const [showCharPicker, setShowCharPicker] = useState(false);
    const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());
    const [selectMode, setSelectMode] = useState(false);
    const [deleting, setDeleting] = useState(false);
    const [roomNodes, setRoomNodes] = useState<MemoryNode[]>([]);
    const [totalCount, setTotalCount] = useState(0);
    const [linkCount, setLinkCount] = useState(0);
    const [boxCount, setBoxCount] = useState(0);
    const [anticipations, setAnticipations] = useState<Anticipation[]>([]);

    // 迁移状态
    const [migrating, setMigrating] = useState(false);
    const [migrationProgress, setMigrationProgress] = useState<MigrationProgress | null>(null);
    const [migrationResult, setMigrationResult] = useState<string | null>(null);

    // 历史聊天处理状态
    const [processingHistory, setProcessingHistory] = useState(false);
    const [historyProgress, setHistoryProgress] = useState<HistoryProcessProgress | null>(null);
    const [historyResult, setHistoryResult] = useState<string | null>(null);

    // 认知消化状态
    const [digesting, setDigesting] = useState(false);
    const [digestResult, setDigestResult] = useState<string | null>(null);

    // Embedding 配置本地状态
    const [embUrl, setEmbUrl] = useState('https://api.siliconflow.cn/v1');
    const [embKey, setEmbKey] = useState('');
    const [embModel, setEmbModel] = useState('BAAI/bge-m3');
    const [embDimensions, setEmbDimensions] = useState(1024);
    const [configSaved, setConfigSaved] = useState(false);
    const [testingEmb, setTestingEmb] = useState(false);
    const [testResult, setTestResult] = useState<string | null>(null);

    // 副 API 配置（emotionConfig.api）
    const [lightUrl, setLightUrl] = useState('');
    const [lightKey, setLightKey] = useState('');
    const [lightModel, setLightModel] = useState('');
    const [lightSaved, setLightSaved] = useState(false);

    // 初始化 embedding 配置（已有配置则加载，否则保持默认值）
    useEffect(() => {
        if (char?.embeddingConfig) {
            setEmbUrl(char.embeddingConfig.baseUrl || 'https://api.siliconflow.cn/v1');
            setEmbKey(char.embeddingConfig.apiKey || '');
            setEmbModel(char.embeddingConfig.model || 'BAAI/bge-m3');
            setEmbDimensions(char.embeddingConfig.dimensions || 1024);
        }
    }, [char?.id, char?.embeddingConfig]);

    // 初始化副 API 配置
    useEffect(() => {
        const api = (char as any)?.emotionConfig?.api;
        if (api) {
            setLightUrl(api.baseUrl || '');
            setLightKey(api.apiKey || '');
            setLightModel(api.model || '');
        }
    }, [char?.id, (char as any)?.emotionConfig]);

    // 判断是否已配置
    const hasEmbeddingConfig = !!(char?.embeddingConfig?.baseUrl && char?.embeddingConfig?.apiKey);
    const hasLightApi = !!((char as any)?.emotionConfig?.api?.baseUrl && (char as any)?.emotionConfig?.api?.apiKey);

    // 加载数据
    const loadStats = useCallback(async () => {
        if (!char) return;

        const allNodes = await MemoryNodeDB.getByCharId(char.id);
        setTotalCount(allNodes.length);

        const counts: Record<string, number> = {};
        const rooms: MemoryRoom[] = ['living_room', 'bedroom', 'study', 'user_room', 'self_room', 'attic', 'windowsill'];
        for (const room of rooms) {
            counts[room] = allNodes.filter(n => n.room === room).length;
        }
        setRoomCounts(counts as any);

        const boxes = await TopicBoxDB.getByCharId(char.id);
        setBoxCount(boxes.length);

        const ants = await AnticipationDB.getByCharId(char.id);
        setAnticipations(ants);

        let links = 0;
        for (const node of allNodes.slice(0, 5)) {
            const nodeLinks = await MemoryLinkDB.getByNodeId(node.id);
            links += nodeLinks.length;
        }
        setLinkCount(links);
    }, [char]);

    useEffect(() => { loadStats(); }, [loadStats]);

    const openRoom = async (room: MemoryRoom) => {
        if (!char) return;
        const nodes = await MemoryNodeDB.getByRoom(char.id, room);
        nodes.sort((a: MemoryNode, b: MemoryNode) => b.createdAt - a.createdAt);
        setRoomNodes(nodes);
        setSelectedRoom(room);
        setView('room');
    };

    const openMemory = (node: MemoryNode) => {
        setSelectedNode(node);
        setView('memory');
    };

    const handleSaveEmbeddingConfig = () => {
        if (!char) return;
        updateCharacter(char.id, {
            embeddingConfig: {
                baseUrl: embUrl.trim(),
                apiKey: embKey.trim(),
                model: embModel.trim() || 'text-embedding-3-small',
                dimensions: embDimensions || 1024,
            },
        } as any);
        setConfigSaved(true);
        setTimeout(() => setConfigSaved(false), 2000);
    };

    const handleSaveLightApi = () => {
        if (!char) return;
        updateCharacter(char.id, {
            emotionConfig: {
                ...((char as any).emotionConfig || {}),
                enabled: true,
                api: {
                    baseUrl: lightUrl.trim(),
                    apiKey: lightKey.trim(),
                    model: lightModel.trim(),
                },
            },
        } as any);
        setLightSaved(true);
        setTimeout(() => setLightSaved(false), 2000);
    };

    const handleSwitchChar = (id: string) => {
        setActiveCharacterId(id);
        setShowCharPicker(false);
        setView('palace');
        setSelectedRoom(null);
        setSelectedNode(null);
    };

    const handleMigrate = async () => {
        if (!char || migrating) return;
        const emb = char.embeddingConfig as any;
        if (!emb?.baseUrl || !emb?.apiKey) {
            setMigrationResult('❌ 请先配置 Embedding API');
            return;
        }

        const oldMemories = char.memories || [];
        if (oldMemories.length === 0) {
            setMigrationResult('没有旧记忆可以迁移');
            return;
        }

        const lightApi = (char as any).emotionConfig?.api;
        if (!lightApi?.baseUrl) {
            setMigrationResult('❌ 需要配置 emotionConfig.api（轻量副模型），用于 LLM 记忆提取');
            return;
        }

        setMigrating(true);
        setMigrationResult(null);

        try {
            const { ContextBuilder } = await import('../utils/context');
            const charContext = ContextBuilder.buildCoreContext(char, userProfile, false);
            const result = await migrateOldMemories(
                char.id,
                char.name,
                oldMemories,
                char.refinedMemories,
                lightApi,
                emb,
                (p) => setMigrationProgress(p),
                charContext,
            );
            setMigrationResult(`✅ 迁移完成：${result.months} 个月 → ${result.migrated} 条记忆，${result.skipped} 条去重跳过`);
            loadStats(); // 刷新数据
        } catch (err: any) {
            setMigrationResult(`❌ 迁移失败：${err.message}`);
        } finally {
            setMigrating(false);
            setMigrationProgress(null);
        }
    };

    const handleDigest = async () => {
        if (!char || digesting) return;
        const lightApi = (char as any).emotionConfig?.api;
        if (!lightApi?.baseUrl) {
            setDigestResult('❌ 请先配置 emotionConfig.api（轻量副模型）');
            return;
        }

        setDigesting(true);
        setDigestResult(null);

        try {
            const persona = [char.systemPrompt || '', char.worldview || ''].filter(Boolean).join('\n');
            const result = await runCognitiveDigestion(char.id, char.name, persona, lightApi, true);
            if (!result) {
                setDigestResult('没有需要消化的内容');
            } else {
                const parts: string[] = [];
                if (result.resolved.length) parts.push(`${result.resolved.length} 条困惑化解`);
                if (result.deepened.length) parts.push(`${result.deepened.length} 条创伤加深`);
                if (result.faded.length) parts.push(`${result.faded.length} 条淡忘`);
                if (result.fulfilled.length) parts.push(`${result.fulfilled.length} 个期盼实现`);
                if (result.disappointed.length) parts.push(`${result.disappointed.length} 个期盼落空`);
                if (result.internalized.length) parts.push(`${result.internalized.length} 条知识内化`);
                setDigestResult(parts.length > 0 ? `✅ ${parts.join('，')}` : '没有变化');
            }
            loadStats();
        } catch (err: any) {
            setDigestResult(`❌ 消化失败：${err.message}`);
        } finally {
            setDigesting(false);
        }
    };

    /** 彻底删除一条记忆（node + vector + links） */
    const deleteMemory = async (nodeId: string) => {
        // 删关联
        const links = await MemoryLinkDB.getByNodeId(nodeId);
        for (const link of links) {
            await MemoryLinkDB.delete(link.id);
        }
        // 删向量
        const { MemoryVectorDB } = await import('../utils/memoryPalace');
        await MemoryVectorDB.delete(nodeId);
        // 删节点
        await MemoryNodeDB.delete(nodeId);
    };

    /** 批量删除选中的记忆 */
    const handleBatchDelete = async () => {
        if (selectedIds.size === 0 || !char) return;
        setDeleting(true);
        try {
            for (const id of selectedIds) {
                await deleteMemory(id);
            }
            // 刷新房间数据
            if (selectedRoom) {
                const nodes = await MemoryNodeDB.getByRoom(char.id, selectedRoom);
                nodes.sort((a: MemoryNode, b: MemoryNode) => b.createdAt - a.createdAt);
                setRoomNodes(nodes);
            }
            setSelectedIds(new Set());
            setSelectMode(false);
            loadStats();
        } finally {
            setDeleting(false);
        }
    };

    /** 删除单条记忆并返回房间视图 */
    const handleDeleteSingle = async (nodeId: string) => {
        setDeleting(true);
        try {
            await deleteMemory(nodeId);
            setSelectedNode(null);
            setView('room');
            if (selectedRoom && char) {
                const nodes = await MemoryNodeDB.getByRoom(char.id, selectedRoom);
                nodes.sort((a: MemoryNode, b: MemoryNode) => b.createdAt - a.createdAt);
                setRoomNodes(nodes);
            }
            loadStats();
        } finally {
            setDeleting(false);
        }
    };

    /** 清除所有已迁移数据 */
    const handleClearMigrated = async () => {
        if (!char) return;
        setDeleting(true);
        try {
            const allNodes = await MemoryNodeDB.getByCharId(char.id);
            const migrated = allNodes.filter(n => n.boxId.startsWith('migrated_'));
            for (const node of migrated) {
                await deleteMemory(node.id);
            }
            setMigrationResult(`🗑️ 已清除 ${migrated.length} 条迁移数据`);
            loadStats();
        } finally {
            setDeleting(false);
        }
    };

    /** 处理历史聊天记录 */
    const handleProcessHistory = async () => {
        if (!char || processingHistory) return;
        const emb = char.embeddingConfig as any;
        if (!emb?.baseUrl || !emb?.apiKey) {
            setHistoryResult('❌ 请先配置 Embedding API');
            return;
        }
        const lightApi = (char as any).emotionConfig?.api;
        if (!lightApi?.baseUrl) {
            setHistoryResult('❌ 需要配置 emotionConfig.api（轻量副模型）');
            return;
        }

        setProcessingHistory(true);
        setHistoryResult(null);

        try {
            const result = await processHistoricalChat(
                char.id, char.name, emb, lightApi,
                (p) => setHistoryProgress(p),
                userProfile?.name || '',
            );
            setHistoryResult(`✅ 完成：${result.boxes} 个话题盒 → ${result.memories} 条记忆`);
            loadStats();
        } catch (err: any) {
            setHistoryResult(`❌ 处理失败：${err.message}`);
        } finally {
            setProcessingHistory(false);
            setHistoryProgress(null);
        }
    };

    const toggleSelect = (id: string) => {
        setSelectedIds(prev => {
            const next = new Set(prev);
            if (next.has(id)) next.delete(id);
            else next.add(id);
            return next;
        });
    };

    // ─── 未选角色 → 显示角色选择 ─────────────────────

    if (!char) {
        return (
            <div style={{ padding: 16 }}>
                <div style={{ textAlign: 'center', marginBottom: 20 }}>
                    <div style={{ fontSize: 28, marginBottom: 4 }}>🏰</div>
                    <div style={{ fontSize: 16, fontWeight: 700 }}>记忆宫殿</div>
                    <div style={{ fontSize: 12, color: '#9ca3af', marginTop: 4 }}>选择一个角色</div>
                </div>
                <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10 }}>
                    {characters.map(c => (
                        <div
                            key={c.id}
                            onClick={() => handleSwitchChar(c.id)}
                            style={{
                                padding: 16, borderRadius: 16, textAlign: 'center',
                                border: '1px solid #e5e7eb', cursor: 'pointer',
                                backgroundColor: '#fafafa',
                            }}
                        >
                            <img src={c.avatar} alt="" style={{ width: 48, height: 48, borderRadius: 16, objectFit: 'cover', margin: '0 auto 8px' }} />
                            <div style={{ fontSize: 14, fontWeight: 600 }}>{c.name}</div>
                            <div style={{ fontSize: 11, color: '#9ca3af', marginTop: 2 }}>{c.description?.slice(0, 20)}</div>
                        </div>
                    ))}
                </div>
            </div>
        );
    }

    // ─── 未启用记忆宫殿 ─────────────────────────────────

    if (!char.memoryPalaceEnabled) {
        return (
            <div style={{ padding: 16 }}>
                <div
                    onClick={closeApp}
                    style={{ fontSize: 13, color: '#6b7280', cursor: 'pointer', marginBottom: 16 }}
                >
                    ← 退出
                </div>
                <div style={{ textAlign: 'center', color: '#9ca3af' }}>
                    <div style={{ fontSize: 48, marginBottom: 16 }}>🏰</div>
                    <div style={{ fontSize: 16, fontWeight: 600, marginBottom: 8 }}>记忆宫殿</div>
                    <div style={{ fontSize: 13, marginBottom: 20 }}>
                        {char.name} 尚未开启记忆宫殿功能
                    </div>
                    <div style={{ fontSize: 12, color: '#6b7280', marginBottom: 20 }}>
                        请在「神经链接 → 角色设置 → 设定」中开启
                    </div>
                </div>
                {/* 切换到其他角色 */}
                <div style={{ fontSize: 12, fontWeight: 600, color: '#6b7280', marginBottom: 8 }}>切换角色</div>
                <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 8 }}>
                    {characters.filter(c => c.id !== char.id).map(c => (
                        <div
                            key={c.id}
                            onClick={() => handleSwitchChar(c.id)}
                            style={{
                                display: 'flex', alignItems: 'center', gap: 8,
                                padding: 10, borderRadius: 12, cursor: 'pointer',
                                border: '1px solid #e5e7eb', backgroundColor: '#fafafa',
                            }}
                        >
                            <img src={c.avatar} alt="" style={{ width: 28, height: 28, borderRadius: 8, objectFit: 'cover' }} />
                            <div>
                                <div style={{ fontSize: 12, fontWeight: 600 }}>{c.name}</div>
                                <div style={{ fontSize: 10, color: '#9ca3af' }}>
                                    {(c as any).memoryPalaceEnabled ? '🏰' : ''}
                                </div>
                            </div>
                        </div>
                    ))}
                </div>
            </div>
        );
    }

    // ─── 设置视图（Embedding 配置） ──────────────────────

    if (view === 'settings') {
        return (
            <div style={{ padding: 16, maxHeight: '100%', overflowY: 'auto' }}>
                <div
                    onClick={() => setView('palace')}
                    style={{ fontSize: 13, color: '#6b7280', cursor: 'pointer', marginBottom: 16 }}
                >
                    ← 返回宫殿
                </div>

                <div style={{ textAlign: 'center', marginBottom: 20 }}>
                    <div style={{ fontSize: 28, marginBottom: 4 }}>⚙️</div>
                    <div style={{ fontSize: 16, fontWeight: 700 }}>记忆宫殿配置</div>
                    <div style={{ fontSize: 12, color: '#9ca3af', marginTop: 4 }}>
                        配置 Embedding API 以启用向量检索
                    </div>
                </div>

                {/* ⚠️ 费用警告 */}
                <div style={{
                    padding: 14, borderRadius: 14, marginBottom: 16,
                    background: '#fef2f2', border: '2px solid #fca5a5',
                    fontSize: 12, color: '#991b1b', lineHeight: 1.7,
                }}>
                    <div style={{ fontSize: 14, fontWeight: 800, marginBottom: 6 }}>⚠️ 重要：请使用按量计费的模型</div>
                    记忆宫殿的后台处理（话题切分、记忆提取、关联分析、认知消化）使用下方配置的「副 API」。
                    每轮对话后台约 <b>1-6 次 API 调用</b>。<br/>
                    <b>强烈建议使用按量计费的廉价模型</b>（如 DeepSeek-V2-Lite、GLM-4-Flash、Qwen-Turbo），
                    不要使用包月套餐的主力模型，否则额度会被后台任务大量消耗。
                </div>

                {/* 副 API 配置 */}
                <div style={{ background: '#f0fdf4', borderRadius: 16, padding: 16, border: '1px solid #bbf7d0', marginBottom: 16 }}>
                    <div style={{ fontSize: 12, fontWeight: 700, color: '#166534', marginBottom: 4 }}>
                        🤖 副 API（后台处理用）
                    </div>
                    <div style={{ fontSize: 10, color: '#6b7280', marginBottom: 12 }}>
                        用于话题切分、记忆提取、关联分析等后台任务。与情绪感知共用同一个配置。
                    </div>

                    {/* API 预设快速填充 */}
                    {apiPresets.length > 0 && (
                        <div style={{ marginBottom: 10 }}>
                            <label className={labelClass}>从预设导入</label>
                            <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap' }}>
                                {apiPresets.map(p => (
                                    <button key={p.id} onClick={() => {
                                        setLightUrl(p.config.baseUrl);
                                        setLightKey(p.config.apiKey);
                                        setLightModel(p.config.model);
                                    }} style={{
                                        padding: '4px 10px', borderRadius: 8, fontSize: 11, fontWeight: 600,
                                        border: '1px solid #bbf7d0', background: 'white', color: '#166534',
                                        cursor: 'pointer',
                                    }}>
                                        {p.name}
                                    </button>
                                ))}
                            </div>
                        </div>
                    )}

                    <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
                        <div>
                            <label className={labelClass}>BASE URL</label>
                            <input type="text" value={lightUrl} onChange={e => setLightUrl(e.target.value)}
                                placeholder="https://api.siliconflow.cn/v1" className={inputClass} />
                        </div>
                        <div>
                            <label className={labelClass}>API KEY</label>
                            <input type="password" value={lightKey} onChange={e => setLightKey(e.target.value)}
                                placeholder="sk-..." className={inputClass} />
                        </div>
                        <div>
                            <label className={labelClass}>MODEL</label>
                            <input type="text" value={lightModel} onChange={e => setLightModel(e.target.value)}
                                placeholder="deepseek-ai/DeepSeek-V2.5" className={inputClass} />
                            <div style={{ fontSize: 10, color: '#9ca3af', marginTop: 4, paddingLeft: 4 }}>
                                推荐: deepseek-ai/DeepSeek-V2.5 · Qwen/Qwen2.5-7B-Instruct · GLM-4-Flash
                            </div>
                        </div>
                    </div>

                    <button onClick={handleSaveLightApi}
                        disabled={!lightUrl.trim() || !lightKey.trim() || !lightModel.trim()}
                        style={{
                            width: '100%', marginTop: 12, padding: '10px 0', borderRadius: 12,
                            border: 'none', fontWeight: 700, fontSize: 13, color: 'white',
                            background: (!lightUrl.trim() || !lightKey.trim() || !lightModel.trim()) ? '#cbd5e1' : '#16a34a',
                            cursor: (!lightUrl.trim() || !lightKey.trim() || !lightModel.trim()) ? 'not-allowed' : 'pointer',
                        }}
                    >
                        {lightSaved ? '✓ 已保存' : '保存副 API 配置'}
                    </button>

                    {!hasLightApi && (
                        <div style={{ marginTop: 8, fontSize: 11, color: '#dc2626', fontWeight: 600 }}>
                            ❌ 未配置 — 记忆宫殿的后台处理（封盒、提取、消化等）无法运行
                        </div>
                    )}
                </div>

                {/* Embedding API */}
                <div style={{ background: '#f8f7ff', borderRadius: 16, padding: 16, border: '1px solid #e9e5ff' }}>
                    <div style={{ fontSize: 12, fontWeight: 700, color: '#7c3aed', marginBottom: 12 }}>
                        🔗 Embedding API（OpenAI 兼容格式）
                    </div>
                    <div style={{ fontSize: 11, color: '#6b7280', marginBottom: 16, lineHeight: 1.6 }}>
                        支持 OpenAI / 硅基流动 / 阿里云 / 字节跳动等提供的 Embedding 端点。
                        需要一个独立于聊天 API 的 Embedding 接口地址和密钥。
                    </div>

                    {/* Embedding 预设：只填充 URL 和 Key，模型保持 embedding 专用 */}
                    {apiPresets.length > 0 && (
                        <div style={{ marginBottom: 12 }}>
                            <label className={labelClass}>从预设导入 URL 和 KEY</label>
                            <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap' }}>
                                {apiPresets.map(p => (
                                    <button key={p.id} onClick={() => {
                                        setEmbUrl(p.config.baseUrl);
                                        setEmbKey(p.config.apiKey);
                                    }} style={{
                                        padding: '4px 10px', borderRadius: 8, fontSize: 11, fontWeight: 600,
                                        border: '1px solid #e9e5ff', background: 'white', color: '#7c3aed',
                                        cursor: 'pointer',
                                    }}>
                                        {p.name}
                                    </button>
                                ))}
                            </div>
                            <div style={{ fontSize: 9, color: '#9ca3af', marginTop: 4 }}>
                                仅导入 URL 和 Key，模型名需手动填写 Embedding 专用模型
                            </div>
                        </div>
                    )}

                    <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
                        <div>
                            <label className={labelClass}>BASE URL</label>
                            <input
                                type="text"
                                value={embUrl}
                                onChange={e => setEmbUrl(e.target.value)}
                                placeholder="https://api.siliconflow.cn/v1"
                                className={inputClass}
                            />
                        </div>

                        <div>
                            <label className={labelClass}>API KEY</label>
                            <input
                                type="password"
                                value={embKey}
                                onChange={e => setEmbKey(e.target.value)}
                                placeholder="sk-..."
                                className={inputClass}
                            />
                        </div>

                        <div>
                            <label className={labelClass}>MODEL</label>
                            <input
                                type="text"
                                value={embModel}
                                onChange={e => setEmbModel(e.target.value)}
                                placeholder="text-embedding-3-small"
                                className={inputClass}
                            />
                            <div style={{ fontSize: 10, color: '#9ca3af', marginTop: 4, paddingLeft: 4 }}>
                                常用: text-embedding-3-small · BAAI/bge-m3 · text-embedding-v3
                            </div>
                        </div>

                        <div>
                            <label className={labelClass}>DIMENSIONS</label>
                            <input
                                type="number"
                                value={embDimensions}
                                onChange={e => setEmbDimensions(parseInt(e.target.value) || 1024)}
                                placeholder="1024"
                                className={inputClass}
                            />
                            <div style={{ fontSize: 10, color: '#9ca3af', marginTop: 4, paddingLeft: 4 }}>
                                推荐 1024。部分模型支持 Matryoshka 降维（512 / 768 也可）
                            </div>
                        </div>
                    </div>

                    <button
                        onClick={handleSaveEmbeddingConfig}
                        disabled={!embUrl.trim() || !embKey.trim()}
                        style={{
                            width: '100%',
                            marginTop: 16,
                            padding: '12px 0',
                            borderRadius: 16,
                            border: 'none',
                            fontWeight: 700,
                            fontSize: 14,
                            color: 'white',
                            background: (!embUrl.trim() || !embKey.trim()) ? '#cbd5e1' : '#7c3aed',
                            cursor: (!embUrl.trim() || !embKey.trim()) ? 'not-allowed' : 'pointer',
                            transition: 'all 0.15s',
                        }}
                    >
                        {configSaved ? '✓ 已保存' : '保存配置'}
                    </button>

                    {/* 测试 Embedding 连接 */}
                    <button
                        onClick={async () => {
                            if (!embUrl.trim() || !embKey.trim()) return;
                            setTestingEmb(true);
                            setTestResult(null);
                            try {
                                const { getEmbedding } = await import('../utils/memoryPalace/embedding');
                                const config = {
                                    baseUrl: embUrl.trim(),
                                    apiKey: embKey.trim(),
                                    model: embModel.trim() || 'BAAI/bge-m3',
                                    dimensions: embDimensions || 1024,
                                };
                                const vec = await getEmbedding('测试文本', config);
                                setTestResult(`✅ 成功！返回 ${vec.length} 维向量`);
                            } catch (err: any) {
                                setTestResult(`❌ 失败：${err.message}`);
                            } finally {
                                setTestingEmb(false);
                            }
                        }}
                        disabled={testingEmb || !embUrl.trim() || !embKey.trim()}
                        style={{
                            width: '100%',
                            marginTop: 8,
                            padding: '10px 0',
                            borderRadius: 12,
                            border: '1px solid #7c3aed44',
                            fontWeight: 600,
                            fontSize: 13,
                            color: '#7c3aed',
                            background: 'white',
                            cursor: testingEmb ? 'not-allowed' : 'pointer',
                        }}
                    >
                        {testingEmb ? '测试中...' : '🧪 测试连接'}
                    </button>

                    {testResult && (
                        <div style={{
                            marginTop: 8, fontSize: 12, padding: '8px 12px', borderRadius: 8,
                            background: testResult.startsWith('✅') ? '#f0fdf4' : '#fef2f2',
                            color: testResult.startsWith('✅') ? '#16a34a' : '#dc2626',
                        }}>
                            {testResult}
                        </div>
                    )}
                </div>

                {/* 高级设置 */}
                <div style={{ marginTop: 16, background: '#f9fafb', borderRadius: 16, padding: 16, border: '1px solid #e5e7eb' }}>
                    <div style={{ fontSize: 12, fontWeight: 700, color: '#6b7280', marginBottom: 12 }}>
                        🎛️ 高级设置
                    </div>

                    <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
                        <div>
                            <label className={labelClass}>人格风格（影响联想偏好）</label>
                            <select
                                value={(char as any).personalityStyle || 'emotional'}
                                onChange={e => updateCharacter(char.id, { personalityStyle: e.target.value } as any)}
                                className={inputClass}
                                style={{ fontFamily: 'inherit' }}
                            >
                                <option value="emotional">情感型 — 偏好情感链接</option>
                                <option value="narrative">叙事型 — 偏好时间链接</option>
                                <option value="imagery">意象型 — 偏好隐喻链接</option>
                                <option value="analytical">分析型 — 偏好因果链接</option>
                            </select>
                        </div>

                        <div>
                            <label className={labelClass}>反刍倾向（0-1，阁楼记忆浮现概率）</label>
                            <input
                                type="range"
                                min="0"
                                max="1"
                                step="0.1"
                                value={(char as any).ruminationTendency ?? 0.3}
                                onChange={e => updateCharacter(char.id, { ruminationTendency: parseFloat(e.target.value) } as any)}
                                style={{ width: '100%' }}
                            />
                            <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 10, color: '#9ca3af' }}>
                                <span>0（从不反刍）</span>
                                <span style={{ fontWeight: 600 }}>{((char as any).ruminationTendency ?? 0.3).toFixed(1)}</span>
                                <span>1（高频反刍）</span>
                            </div>
                        </div>
                    </div>
                </div>

                {/* 聊天记录向量化 */}
                <div style={{ marginTop: 16, background: '#eff6ff', borderRadius: 16, padding: 16, border: '1px solid #bfdbfe' }}>
                    <div style={{ fontSize: 12, fontWeight: 700, color: '#1e40af', marginBottom: 8 }}>
                        💬 聊天记录向量化
                    </div>
                    <div style={{ fontSize: 11, color: '#6b7280', marginBottom: 12, lineHeight: 1.6 }}>
                        将所有历史聊天记录走完整流程：自动切话题 → 封盒 → 以 {char.name} 的第一人称提取记忆 → 向量化。
                        首次启用记忆宫殿时建议执行一次。处理量较大时请耐心等待。
                    </div>

                    {historyProgress && (
                        <div style={{ fontSize: 11, color: '#1e40af', marginBottom: 8 }}>
                            {historyProgress.detail || `${historyProgress.phase}...`}
                        </div>
                    )}

                    {historyResult && (
                        <div style={{ fontSize: 12, marginBottom: 8, color: historyResult.startsWith('✅') ? '#16a34a' : '#dc2626' }}>
                            {historyResult}
                        </div>
                    )}

                    <button
                        onClick={handleProcessHistory}
                        disabled={processingHistory || !hasEmbeddingConfig}
                        style={{
                            width: '100%', padding: '10px 0', borderRadius: 12,
                            border: 'none', fontWeight: 700, fontSize: 13,
                            color: 'white',
                            background: processingHistory ? '#d4d4d4' : !hasEmbeddingConfig ? '#cbd5e1' : '#2563eb',
                            cursor: processingHistory || !hasEmbeddingConfig ? 'not-allowed' : 'pointer',
                        }}
                    >
                        {processingHistory ? '处理中...' : '开始向量化'}
                    </button>
                </div>

                {/* 迁移旧记忆 */}
                <div style={{ marginTop: 16, background: '#fefce8', borderRadius: 16, padding: 16, border: '1px solid #fde68a' }}>
                    <div style={{ fontSize: 12, fontWeight: 700, color: '#92400e', marginBottom: 8 }}>
                        📦 导入旧记忆
                    </div>
                    <div style={{ fontSize: 11, color: '#78716c', marginBottom: 12, lineHeight: 1.6 }}>
                        按月将旧的日度记忆 ({char.memories?.length || 0} 条) 送给 LLM，
                        以 {char.name} 的第一人称视角重新提取为记忆节点。旧数据不会被删除。
                    </div>

                    {migrationProgress && (
                        <div style={{ fontSize: 11, color: '#92400e', marginBottom: 8 }}>
                            {migrationProgress.phase === 'grouping' && `📅 按月分组中...`}
                            {migrationProgress.phase === 'extracting' && `🧠 LLM 提取中... ${migrationProgress.currentMonth || ''} (${migrationProgress.current}/${migrationProgress.total} 月)`}
                            {migrationProgress.phase === 'vectorizing' && `🧮 向量化中... ${migrationProgress.current}/${migrationProgress.total}`}
                            {migrationProgress.phase === 'linking' && `🔗 建立关联...`}
                            {migrationProgress.phase === 'done' && `✅ 完成`}
                        </div>
                    )}

                    {migrationResult && (
                        <div style={{ fontSize: 12, marginBottom: 8, color: migrationResult.startsWith('✅') ? '#16a34a' : '#dc2626' }}>
                            {migrationResult}
                        </div>
                    )}

                    <button
                        onClick={handleMigrate}
                        disabled={migrating || !hasEmbeddingConfig}
                        style={{
                            width: '100%', padding: '10px 0', borderRadius: 12,
                            border: 'none', fontWeight: 700, fontSize: 13,
                            color: 'white',
                            background: migrating ? '#d4d4d4' : !hasEmbeddingConfig ? '#cbd5e1' : '#f59e0b',
                            cursor: migrating || !hasEmbeddingConfig ? 'not-allowed' : 'pointer',
                        }}
                    >
                        {migrating ? '迁移中...' : !hasEmbeddingConfig ? '请先配置 Embedding API' : '开始迁移'}
                    </button>

                    <button
                        onClick={() => {
                            if (confirm('确定清除所有已迁移的数据？（boxId 以 migrated_ 开头的记忆 + 向量 + 关联）')) {
                                handleClearMigrated();
                            }
                        }}
                        disabled={deleting}
                        style={{
                            width: '100%', marginTop: 8, padding: '8px 0',
                            borderRadius: 10, border: '1px solid #fecaca',
                            fontSize: 12, fontWeight: 600,
                            color: '#dc2626', background: 'white',
                            cursor: deleting ? 'not-allowed' : 'pointer',
                        }}
                    >
                        {deleting ? '清除中...' : '🗑️ 清除已迁移数据'}
                    </button>
                </div>

                {/* 认知消化（手动触发/测试） */}
                <div style={{ marginTop: 16, background: '#f0fdf4', borderRadius: 16, padding: 16, border: '1px solid #bbf7d0' }}>
                    <div style={{ fontSize: 12, fontWeight: 700, color: '#166534', marginBottom: 8 }}>
                        🧠 认知消化
                    </div>
                    <div style={{ fontSize: 11, color: '#6b7280', marginBottom: 12, lineHeight: 1.6 }}>
                        角色会安静地回想最近的事情：阁楼里的困惑有没有想开？窗台上的期盼实现了吗？
                        反复学到的东西是否已经内化成性格的一部分？正常使用时每次封盒后自动触发（30分钟冷却）。
                    </div>

                    {digestResult && (
                        <div style={{ fontSize: 12, marginBottom: 8, color: digestResult.startsWith('✅') ? '#16a34a' : digestResult.startsWith('❌') ? '#dc2626' : '#6b7280' }}>
                            {digestResult}
                        </div>
                    )}

                    <button
                        onClick={handleDigest}
                        disabled={digesting}
                        style={{
                            width: '100%', padding: '10px 0', borderRadius: 12,
                            border: 'none', fontWeight: 700, fontSize: 13,
                            color: 'white',
                            background: digesting ? '#d4d4d4' : '#16a34a',
                            cursor: digesting ? 'not-allowed' : 'pointer',
                        }}
                    >
                        {digesting ? '消化中...' : '手动触发消化'}
                    </button>
                </div>
            </div>
        );
    }

    // ─── 宫殿概览视图 ────────────────────────────────

    if (view === 'palace') {
        return (
            <div style={{ padding: 16, maxHeight: '100%', overflowY: 'auto' }}>
                {/* 标题 + 退出 + 设置 */}
                <div style={{ textAlign: 'center', marginBottom: 20, position: 'relative' }}>
                    {/* 退出按钮 */}
                    <div
                        onClick={closeApp}
                        style={{
                            position: 'absolute', left: 0, top: 0,
                            fontSize: 13, color: '#6b7280', cursor: 'pointer',
                            padding: '4px 0',
                        }}
                    >
                        ← 退出
                    </div>
                    {/* 设置齿轮 */}
                    <div
                        onClick={() => setView('settings')}
                        style={{
                            position: 'absolute', right: 0, top: 0,
                            width: 32, height: 32, borderRadius: 10,
                            display: 'flex', alignItems: 'center', justifyContent: 'center',
                            cursor: 'pointer', fontSize: 16,
                            background: '#f3f0ff', color: '#7c3aed',
                        }}
                    >
                        ⚙️
                    </div>

                    <div style={{ fontSize: 28, marginBottom: 4 }}>🏰</div>
                    {/* 角色名（可点击切换） */}
                    <div
                        onClick={() => setShowCharPicker(!showCharPicker)}
                        style={{ fontSize: 18, fontWeight: 700, cursor: 'pointer', display: 'inline-flex', alignItems: 'center', gap: 6 }}
                    >
                        <img src={char.avatar} alt="" style={{ width: 24, height: 24, borderRadius: 8, objectFit: 'cover' }} />
                        {char.name} 的记忆宫殿
                        <span style={{ fontSize: 10, color: '#9ca3af' }}>▼</span>
                    </div>
                    <div style={{ fontSize: 12, color: '#9ca3af', marginTop: 4 }}>
                        {totalCount} 条记忆 · {boxCount} 个话题盒 · {anticipations.length} 个期盼
                    </div>

                    {/* 角色切换面板 */}
                    {showCharPicker && (
                        <div style={{
                            marginTop: 12, padding: 8, borderRadius: 12,
                            border: '1px solid #e5e7eb', backgroundColor: 'white',
                            textAlign: 'left', boxShadow: '0 4px 12px rgba(0,0,0,0.08)',
                        }}>
                            {characters.map(c => (
                                <div
                                    key={c.id}
                                    onClick={() => handleSwitchChar(c.id)}
                                    style={{
                                        display: 'flex', alignItems: 'center', gap: 10,
                                        padding: '8px 10px', borderRadius: 8, cursor: 'pointer',
                                        backgroundColor: c.id === activeCharacterId ? '#f3f0ff' : 'transparent',
                                    }}
                                >
                                    <img src={c.avatar} alt="" style={{ width: 32, height: 32, borderRadius: 10, objectFit: 'cover' }} />
                                    <div>
                                        <div style={{ fontSize: 13, fontWeight: 600 }}>{c.name}</div>
                                        <div style={{ fontSize: 10, color: '#9ca3af' }}>
                                            {(c as any).memoryPalaceEnabled ? '🏰 已启用' : '未启用'}
                                        </div>
                                    </div>
                                    {c.id === activeCharacterId && <span style={{ marginLeft: 'auto', color: '#7c3aed', fontSize: 14 }}>✓</span>}
                                </div>
                            ))}
                        </div>
                    )}

                    {/* Embedding 配置警告 */}
                    {!hasEmbeddingConfig && (
                        <div
                            onClick={() => setView('settings')}
                            style={{
                                marginTop: 12, padding: '8px 12px', borderRadius: 10,
                                background: '#fef3c7', border: '1px solid #fde68a',
                                fontSize: 12, color: '#92400e', cursor: 'pointer',
                            }}
                        >
                            ⚠️ 尚未配置 Embedding API — 点击此处配置
                        </div>
                    )}
                </div>

                {/* 七个房间 */}
                <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10, marginBottom: 20 }}>
                    {(Object.keys(ROOM_CONFIGS) as MemoryRoom[]).map(room => {
                        const config = ROOM_CONFIGS[room];
                        const count = roomCounts[room] || 0;
                        const color = ROOM_COLORS[room];
                        return (
                            <div
                                key={room}
                                onClick={() => openRoom(room)}
                                style={{
                                    padding: 14,
                                    borderRadius: 12,
                                    border: `1px solid ${color}33`,
                                    backgroundColor: `${color}11`,
                                    cursor: 'pointer',
                                    transition: 'transform 0.15s',
                                }}
                            >
                                <div style={{ fontSize: 24, marginBottom: 4 }}>{ROOM_ICONS[room]}</div>
                                <div style={{ fontSize: 14, fontWeight: 600, color }}>{ROOM_LABELS[room]}</div>
                                <div style={{ fontSize: 11, color: '#9ca3af', marginTop: 2 }}>{config.description}</div>
                                <div style={{ fontSize: 20, fontWeight: 700, marginTop: 8, color }}>
                                    {count}
                                    <span style={{ fontSize: 11, fontWeight: 400, color: '#9ca3af', marginLeft: 4 }}>
                                        {config.capacity ? `/ ${config.capacity}` : '条'}
                                    </span>
                                </div>
                            </div>
                        );
                    })}
                </div>

                {/* 期盼区 */}
                {anticipations.length > 0 && (
                    <div style={{ marginBottom: 16 }}>
                        <div style={{ fontSize: 14, fontWeight: 600, marginBottom: 8 }}>🌅 窗台期盼</div>
                        {anticipations.map((ant: Anticipation) => (
                            <div key={ant.id} style={{
                                padding: 10, borderRadius: 8, marginBottom: 6,
                                backgroundColor: ant.status === 'fulfilled' ? '#ecfdf5' :
                                    ant.status === 'disappointed' ? '#fef2f2' : '#fefce8',
                                fontSize: 13,
                            }}>
                                <span style={{ marginRight: 6 }}>
                                    {ant.status === 'active' ? '✨' : ant.status === 'anchor' ? '🔒' :
                                        ant.status === 'fulfilled' ? '🎉' : '💔'}
                                </span>
                                {ant.content}
                                <div style={{ fontSize: 11, color: '#9ca3af', marginTop: 2 }}>
                                    {new Date(ant.createdAt).toLocaleDateString('zh-CN')} · {ant.status}
                                </div>
                            </div>
                        ))}
                    </div>
                )}
            </div>
        );
    }

    // ─── 房间详情视图 ────────────────────────────────

    if (view === 'room' && selectedRoom) {
        const roomLabel = ROOM_LABELS[selectedRoom];
        const roomIcon = ROOM_ICONS[selectedRoom];
        const roomColor = ROOM_COLORS[selectedRoom];

        return (
            <div style={{ padding: 16, maxHeight: '100%', overflowY: 'auto' }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 12 }}>
                    <div
                        onClick={() => { setView('palace'); setSelectedRoom(null); setSelectMode(false); setSelectedIds(new Set()); }}
                        style={{ fontSize: 13, color: '#6b7280', cursor: 'pointer' }}
                    >
                        ← 返回宫殿
                    </div>
                    {roomNodes.length > 0 && (
                        <div
                            onClick={() => { setSelectMode(!selectMode); setSelectedIds(new Set()); }}
                            style={{ fontSize: 12, color: selectMode ? '#dc2626' : '#6b7280', cursor: 'pointer', fontWeight: 600 }}
                        >
                            {selectMode ? '取消选择' : '选择'}
                        </div>
                    )}
                </div>

                <div style={{ marginBottom: 16 }}>
                    <span style={{ fontSize: 28 }}>{roomIcon}</span>
                    <span style={{ fontSize: 18, fontWeight: 700, color: roomColor, marginLeft: 8 }}>{roomLabel}</span>
                    <span style={{ fontSize: 12, color: '#9ca3af', marginLeft: 8 }}>{roomNodes.length} 条记忆</span>
                </div>

                {/* 批量删除工具栏 */}
                {selectMode && (
                    <div style={{
                        display: 'flex', justifyContent: 'space-between', alignItems: 'center',
                        padding: '8px 12px', borderRadius: 10, marginBottom: 12,
                        background: '#fef2f2', border: '1px solid #fecaca',
                    }}>
                        <div style={{ fontSize: 12, color: '#991b1b' }}>
                            已选 {selectedIds.size} 条
                            <span
                                onClick={() => setSelectedIds(new Set(roomNodes.map(n => n.id)))}
                                style={{ marginLeft: 8, color: '#6b7280', cursor: 'pointer', textDecoration: 'underline' }}
                            >全选</span>
                        </div>
                        <button
                            onClick={handleBatchDelete}
                            disabled={selectedIds.size === 0 || deleting}
                            style={{
                                padding: '4px 12px', borderRadius: 8, border: 'none',
                                fontSize: 12, fontWeight: 700,
                                color: 'white', background: selectedIds.size > 0 ? '#dc2626' : '#d4d4d4',
                                cursor: selectedIds.size > 0 ? 'pointer' : 'not-allowed',
                            }}
                        >
                            {deleting ? '删除中...' : `删除 (${selectedIds.size})`}
                        </button>
                    </div>
                )}

                {roomNodes.length === 0 ? (
                    <div style={{ textAlign: 'center', color: '#9ca3af', padding: 40, fontSize: 13 }}>
                        这个房间还是空的
                    </div>
                ) : (
                    roomNodes.map((node: MemoryNode) => (
                        <div
                            key={node.id}
                            onClick={() => selectMode ? toggleSelect(node.id) : openMemory(node)}
                            style={{
                                padding: 12, borderRadius: 10, marginBottom: 8,
                                border: `1px solid ${selectMode && selectedIds.has(node.id) ? '#dc2626' : '#e5e7eb'}`,
                                cursor: 'pointer',
                                backgroundColor: selectMode && selectedIds.has(node.id) ? '#fef2f2' : '#fafafa',
                            }}
                        >
                            {selectMode && (
                                <div style={{ float: 'right', fontSize: 16, marginLeft: 8 }}>
                                    {selectedIds.has(node.id) ? '☑️' : '⬜'}
                                </div>
                            )}
                            <div style={{ fontSize: 13, lineHeight: 1.5 }}>{node.content}</div>
                            <div style={{ fontSize: 11, color: '#9ca3af', marginTop: 6, display: 'flex', gap: 8 }}>
                                <span>重要性: {node.importance}</span>
                                <span>{node.mood}</span>
                                <span>{new Date(node.createdAt).toLocaleDateString('zh-CN')}</span>
                                <span>访问 {node.accessCount} 次</span>
                            </div>
                            {node.tags.length > 0 && (
                                <div style={{ marginTop: 4, display: 'flex', gap: 4, flexWrap: 'wrap' }}>
                                    {node.tags.map((t: string) => (
                                        <span key={t} style={{
                                            fontSize: 10, padding: '1px 6px', borderRadius: 4,
                                            backgroundColor: `${roomColor}22`, color: roomColor,
                                        }}>{t}</span>
                                    ))}
                                </div>
                            )}
                        </div>
                    ))
                )}
            </div>
        );
    }

    // ─── 单条记忆详情 ────────────────────────────────

    if (view === 'memory' && selectedNode) {
        const roomColor = ROOM_COLORS[selectedNode.room];
        return (
            <div style={{ padding: 16, maxHeight: '100%', overflowY: 'auto' }}>
                <div
                    onClick={() => { setView('room'); setSelectedNode(null); }}
                    style={{ fontSize: 13, color: '#6b7280', cursor: 'pointer', marginBottom: 12 }}
                >
                    ← 返回 {ROOM_LABELS[selectedNode.room]}
                </div>

                <div style={{
                    padding: 16, borderRadius: 12,
                    border: `1px solid ${roomColor}44`,
                    backgroundColor: `${roomColor}08`,
                }}>
                    <div style={{ fontSize: 15, lineHeight: 1.6, marginBottom: 12 }}>{selectedNode.content}</div>

                    <div style={{ fontSize: 12, color: '#6b7280', lineHeight: 1.8 }}>
                        <div>{ROOM_ICONS[selectedNode.room]} {ROOM_LABELS[selectedNode.room]}</div>
                        <div>重要性: {'★'.repeat(selectedNode.importance)}{'☆'.repeat(10 - selectedNode.importance)}</div>
                        <div>情绪: {selectedNode.mood}</div>
                        <div>创建: {new Date(selectedNode.createdAt).toLocaleString('zh-CN')}</div>
                        <div>最后访问: {new Date(selectedNode.lastAccessedAt).toLocaleString('zh-CN')}</div>
                        <div>访问次数: {selectedNode.accessCount}</div>
                        {selectedNode.boxTopic && <div>话题: {selectedNode.boxTopic}</div>}
                        <div>向量化: {selectedNode.embedded ? '✅' : '❌'}</div>
                    </div>

                    {selectedNode.tags.length > 0 && (
                        <div style={{ marginTop: 10, display: 'flex', gap: 4, flexWrap: 'wrap' }}>
                            {selectedNode.tags.map((t: string) => (
                                <span key={t} style={{
                                    fontSize: 11, padding: '2px 8px', borderRadius: 6,
                                    backgroundColor: `${roomColor}22`, color: roomColor,
                                }}>{t}</span>
                            ))}
                        </div>
                    )}

                    {/* 删除按钮 */}
                    <button
                        onClick={() => {
                            if (confirm('确定删除这条记忆？（包括对应的向量和关联）')) {
                                handleDeleteSingle(selectedNode.id);
                            }
                        }}
                        disabled={deleting}
                        style={{
                            marginTop: 16, width: '100%', padding: '10px 0',
                            borderRadius: 10, border: '1px solid #fecaca',
                            fontSize: 12, fontWeight: 600,
                            color: '#dc2626', background: '#fef2f2',
                            cursor: deleting ? 'not-allowed' : 'pointer',
                        }}
                    >
                        {deleting ? '删除中...' : '🗑️ 删除这条记忆'}
                    </button>
                </div>
            </div>
        );
    }

    return null;
}
