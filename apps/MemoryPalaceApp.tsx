import React, { useState, useEffect, useCallback } from 'react';
import { useOS } from '../context/OSContext';
import {
    MemoryRoom, MemoryNode, ROOM_CONFIGS, ROOM_LABELS, getRoomLabel,
    MemoryNodeDB, TopicBoxDB, AnticipationDB, MemoryLinkDB,
    migrateOldMemories, runCognitiveDigestion, getAvailableMonths, getAvailableChunks,
    detectPersonalityStyle,
} from '../utils/memoryPalace';
import type { Anticipation, MigrationProgress, DigestResult, MemoryLink } from '../utils/memoryPalace';

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
    const { activeCharacterId, characters, updateCharacter, setActiveCharacterId, closeApp, apiPresets, userProfile, memoryPalaceConfig, updateMemoryPalaceConfig } = useOS();
    const char = characters.find(c => c.id === activeCharacterId);

    const [view, setView] = useState<'palace' | 'room' | 'memory' | 'settings' | 'all'>('palace');
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

    // 月份选择（导入旧记忆）
    const [availableMonths, setAvailableMonths] = useState<string[]>([]);
    const [availableChunks, setAvailableChunks] = useState<{ key: string; count: number }[]>([]);
    const [selectedMonths, setSelectedMonths] = useState<Set<string>>(new Set());

    // 全部记忆视图
    const [allNodes, setAllNodes] = useState<MemoryNode[]>([]);
    const [allSortBy, setAllSortBy] = useState<'time' | 'importance'>('time');
    const [allSortDir, setAllSortDir] = useState<'desc' | 'asc'>('desc');
    const [prevView, setPrevView] = useState<'room' | 'all'>('room');

    // 认知消化状态
    const [digesting, setDigesting] = useState(false);
    const [digestResult, setDigestResult] = useState<string | null>(null);

    // 关联记忆状态（记忆详情页展示 causal links）
    const [linkedMemories, setLinkedMemories] = useState<{ link: MemoryLink; node: MemoryNode }[]>([]);
    const [loadingLinks, setLoadingLinks] = useState(false);
    const [showLinkSearch, setShowLinkSearch] = useState(false);
    const [linkSearchQuery, setLinkSearchQuery] = useState('');
    const [linkSearchResults, setLinkSearchResults] = useState<MemoryNode[]>([]);

    // 全局搜索状态
    const [globalSearchQuery, setGlobalSearchQuery] = useState('');
    const [globalSearchResults, setGlobalSearchResults] = useState<MemoryNode[]>([]);
    const globalSearchTimerRef = React.useRef<ReturnType<typeof setTimeout> | null>(null);

    // 记忆编辑状态
    const [editing, setEditing] = useState(false);
    const [editContent, setEditContent] = useState('');
    const [editImportance, setEditImportance] = useState(5);
    const [editMood, setEditMood] = useState('');
    const [editRoom, setEditRoom] = useState<MemoryRoom>('living_room');
    const [editTags, setEditTags] = useState('');
    const [saving, setSaving] = useState(false);

    // Embedding 配置本地状态（从全局配置初始化）
    const [embUrl, setEmbUrl] = useState(memoryPalaceConfig.embedding.baseUrl || 'https://api.siliconflow.cn/v1');
    const [embKey, setEmbKey] = useState(memoryPalaceConfig.embedding.apiKey || '');
    const [embModel, setEmbModel] = useState(memoryPalaceConfig.embedding.model || 'BAAI/bge-m3');
    const [embDimensions, setEmbDimensions] = useState(memoryPalaceConfig.embedding.dimensions || 1024);
    const [configSaved, setConfigSaved] = useState(false);
    const [testingEmb, setTestingEmb] = useState(false);
    const [testResult, setTestResult] = useState<string | null>(null);

    // 副 API 配置（全局配置）
    const [lightUrl, setLightUrl] = useState(memoryPalaceConfig.lightLLM.baseUrl || '');
    const [lightKey, setLightKey] = useState(memoryPalaceConfig.lightLLM.apiKey || '');
    const [lightModel, setLightModel] = useState(memoryPalaceConfig.lightLLM.model || '');
    const [lightSaved, setLightSaved] = useState(false);

    // 全局配置变更时同步到本地状态
    useEffect(() => {
        setEmbUrl(memoryPalaceConfig.embedding.baseUrl || 'https://api.siliconflow.cn/v1');
        setEmbKey(memoryPalaceConfig.embedding.apiKey || '');
        setEmbModel(memoryPalaceConfig.embedding.model || 'BAAI/bge-m3');
        setEmbDimensions(memoryPalaceConfig.embedding.dimensions || 1024);
        setLightUrl(memoryPalaceConfig.lightLLM.baseUrl || '');
        setLightKey(memoryPalaceConfig.lightLLM.apiKey || '');
        setLightModel(memoryPalaceConfig.lightLLM.model || '');
    }, [memoryPalaceConfig]);

    // 人格风格 + 反刍倾向 检测
    const [detectingPersonality, setDetectingPersonality] = useState(false);
    const [pendingPersonality, setPendingPersonality] = useState<{ style: string; ruminationTendency: number; reasoning: string } | null>(null);

    useEffect(() => {
        if (!char || (char as any).personalityStyle) return;
        const lightApi = memoryPalaceConfig.lightLLM;
        if (!lightApi?.baseUrl || !lightApi?.apiKey) return;

        // 自动触发检测
        setDetectingPersonality(true);
        const persona = [char.systemPrompt || '', char.worldview || ''].filter(Boolean).join('\n');
        detectPersonalityStyle(char.id, char.name, persona, lightApi)
            .then(result => {
                setPendingPersonality(result);
            })
            .catch(e => console.warn('🎭 性格检测失败:', e.message))
            .finally(() => setDetectingPersonality(false));
    }, [char?.id, memoryPalaceConfig.lightLLM]);

    // 判断是否已配置（使用全局配置）
    const hasEmbeddingConfig = !!(memoryPalaceConfig.embedding.baseUrl && memoryPalaceConfig.embedding.apiKey);
    const hasLightApi = !!(memoryPalaceConfig.lightLLM.baseUrl && memoryPalaceConfig.lightLLM.apiKey);

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

    // 加载可用月份和分块（旧记忆迁移用）
    useEffect(() => {
        if (char?.memories && char.memories.length > 0) {
            const months = getAvailableMonths(char.memories as any);
            setAvailableMonths(months);
            const chunks = getAvailableChunks(char.memories as any);
            setAvailableChunks(chunks);
        } else {
            setAvailableMonths([]);
            setAvailableChunks([]);
        }
    }, [char?.id, char?.memories?.length]);

    const openAllMemories = async () => {
        if (!char) return;
        const nodes = await MemoryNodeDB.getByCharId(char.id);
        setAllNodes(nodes);
        setView('all');
    };

    const openRoom = async (room: MemoryRoom) => {
        if (!char) return;
        const nodes = await MemoryNodeDB.getByRoom(char.id, room);
        nodes.sort((a: MemoryNode, b: MemoryNode) => b.createdAt - a.createdAt);
        setRoomNodes(nodes);
        setSelectedRoom(room);
        setView('room');
    };

    const loadLinkedMemories = async (nodeId: string) => {
        setLoadingLinks(true);
        try {
            const links = await MemoryLinkDB.getByNodeId(nodeId);
            // 只展示 causal 类型（跨时间事件关联），其他类型太多且意义不大
            const causalLinks = links.filter(l => l.type === 'causal');
            const results: { link: MemoryLink; node: MemoryNode }[] = [];
            for (const link of causalLinks) {
                const otherId = link.sourceId === nodeId ? link.targetId : link.sourceId;
                const otherNode = await MemoryNodeDB.getById(otherId);
                if (otherNode) results.push({ link, node: otherNode });
            }
            setLinkedMemories(results);
        } catch {
            setLinkedMemories([]);
        } finally {
            setLoadingLinks(false);
        }
    };

    const openMemory = (node: MemoryNode, from?: 'room' | 'all') => {
        setSelectedNode(node);
        setEditing(false);
        setEditContent(node.content);
        setEditImportance(node.importance);
        setEditMood(node.mood);
        setEditRoom(node.room);
        setEditTags(node.tags.join(', '));
        setLinkedMemories([]);
        setPrevView(from || 'room');
        setView('memory');
        loadLinkedMemories(node.id);
    };

    const handleSaveEdit = async () => {
        if (!selectedNode || !char) return;
        setSaving(true);
        try {
            const updated: MemoryNode = {
                ...selectedNode,
                content: editContent.trim(),
                importance: editImportance,
                mood: editMood.trim(),
                room: editRoom,
                tags: editTags.split(/[,，]/).map(t => t.trim()).filter(Boolean),
            };
            await MemoryNodeDB.save(updated);
            setSelectedNode(updated);
            setEditing(false);
            // 如果房间变了，刷新房间列表
            if (selectedRoom) {
                const nodes = await MemoryNodeDB.getByRoom(char.id, selectedRoom);
                nodes.sort((a: MemoryNode, b: MemoryNode) => b.createdAt - a.createdAt);
                setRoomNodes(nodes);
            }
            loadStats();
        } finally {
            setSaving(false);
        }
    };

    const handleSaveEmbeddingConfig = () => {
        updateMemoryPalaceConfig({
            embedding: {
                baseUrl: embUrl.trim(),
                apiKey: embKey.trim(),
                model: embModel.trim() || 'BAAI/bge-m3',
                dimensions: embDimensions || 1024,
            },
        });
        // 同步到当前角色的 embeddingConfig（兼容已有的 injectMemoryPalace 调用）
        if (char) {
            updateCharacter(char.id, {
                embeddingConfig: {
                    baseUrl: embUrl.trim(),
                    apiKey: embKey.trim(),
                    model: embModel.trim() || 'BAAI/bge-m3',
                    dimensions: embDimensions || 1024,
                },
            } as any);
        }
        setConfigSaved(true);
        setTimeout(() => setConfigSaved(false), 2000);
    };

    const handleSaveLightApi = () => {
        updateMemoryPalaceConfig({
            lightLLM: {
                baseUrl: lightUrl.trim(),
                apiKey: lightKey.trim(),
                model: lightModel.trim(),
            },
        });
        // 同步到当前角色的 emotionConfig.api（兼容情绪感知等已有功能）
        if (char) {
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
        }
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
        const emb = memoryPalaceConfig.embedding;
        if (!emb?.baseUrl || !emb?.apiKey) {
            setMigrationResult('❌ 请先配置 Embedding API');
            return;
        }

        const oldMemories = char.memories || [];
        if (oldMemories.length === 0) {
            setMigrationResult('没有旧记忆可以迁移');
            return;
        }

        const lightApi = memoryPalaceConfig.lightLLM;
        if (!lightApi?.baseUrl) {
            setMigrationResult('❌ 需要配置副 API（轻量副模型），用于 LLM 记忆提取');
            return;
        }

        setMigrating(true);
        setMigrationResult(null);

        try {
            const { ContextBuilder } = await import('../utils/context');
            const charContext = ContextBuilder.buildCoreContext(char, userProfile, false);
            // selectedMonths 现在存的是分块 key（如 "2026-03 上旬"）
            const monthsToProcess = selectedMonths.size > 0 ? Array.from(selectedMonths) : undefined;
            const result = await migrateOldMemories(
                char.id,
                char.name,
                oldMemories,
                char.refinedMemories,
                lightApi,
                emb,
                (p) => setMigrationProgress(p),
                charContext,
                monthsToProcess,
                userProfile?.name,
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
        const lightApi = memoryPalaceConfig.lightLLM;
        if (!lightApi?.baseUrl) {
            setDigestResult('❌ 请先在设置中配置副 API');
            return;
        }

        setDigesting(true);
        setDigestResult(null);

        try {
            const persona = [char.systemPrompt || '', char.worldview || ''].filter(Boolean).join('\n');
            const result = await runCognitiveDigestion(char.id, char.name, persona, lightApi, true, userProfile?.name);
            if (!result) {
                setDigestResult('没有需要消化的内容');
            } else {
                // 如果产生了新的自我领悟，持久化到角色档案
                if (result.selfInsights.length > 0) {
                    const existing = (char as any).selfInsights || [];
                    const updated = [...existing, ...result.selfInsights];
                    updateCharacter(char.id, { selfInsights: updated } as any);
                }

                const parts: string[] = [];
                if (result.resolved.length) parts.push(`${result.resolved.length} 条困惑化解`);
                if (result.deepened.length) parts.push(`${result.deepened.length} 条创伤加深`);
                if (result.faded.length) parts.push(`${result.faded.length} 条淡忘`);
                if (result.fulfilled.length) parts.push(`${result.fulfilled.length} 个期盼实现`);
                if (result.disappointed.length) parts.push(`${result.disappointed.length} 个期盼落空`);
                if (result.internalized.length) parts.push(`${result.internalized.length} 条知识内化`);
                if (result.synthesizedUser.length) parts.push(`${result.synthesizedUser.length} 条用户认知整合`);
                if (result.selfInsights.length) parts.push(`${result.selfInsights.length} 条自我领悟`);
                if (result.selfConfused.length) parts.push(`${result.selfConfused.length} 条新困惑`);
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

    /** 删除单条记忆并返回上一视图 */
    const handleDeleteSingle = async (nodeId: string) => {
        setDeleting(true);
        try {
            await deleteMemory(nodeId);
            setSelectedNode(null);
            setView(prevView);
            if (prevView === 'room' && selectedRoom && char) {
                const nodes = await MemoryNodeDB.getByRoom(char.id, selectedRoom);
                nodes.sort((a: MemoryNode, b: MemoryNode) => b.createdAt - a.createdAt);
                setRoomNodes(nodes);
            } else if (prevView === 'all' && char) {
                const nodes = await MemoryNodeDB.getByCharId(char.id);
                setAllNodes(nodes);
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

    // ─── 性格检测弹窗（检测中 / 等待确认） ──────────────

    const STYLE_LABELS: Record<string, string> = {
        emotional: '情感型', narrative: '叙事型', imagery: '意象型', analytical: '分析型',
    };
    const STYLE_DESCS: Record<string, string> = {
        emotional: '思维以情绪为主导，联想时优先走情感链路',
        narrative: '思维以时间线为主导，喜欢回顾经历和讲故事',
        imagery: '思维以隐喻和画面为主导，喜欢用比喻理解世界',
        analytical: '思维以逻辑因果为主导，喜欢分析和推理',
    };
    const RUM_LABELS = (v: number) =>
        v <= 0.2 ? '洒脱，很少纠结过去' :
        v <= 0.5 ? '偶尔会想起旧事' :
        v <= 0.8 ? '敏感，容易纠结旧事' : '执念很深，难以释怀';

    if (detectingPersonality) {
        return (
            <div style={{ padding: 32, display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', minHeight: 300 }}>
                <div style={{ fontSize: 40, marginBottom: 16, animation: 'pulse 2s ease-in-out infinite' }}>🔮</div>
                <div style={{ fontSize: 15, fontWeight: 700, color: '#4b5563', marginBottom: 8 }}>
                    正在分析 {char.name} 的性格特征…
                </div>
                <div style={{ fontSize: 12, color: '#9ca3af', textAlign: 'center', lineHeight: 1.6 }}>
                    根据角色人设和已有记忆<br />判断认知风格与反刍倾向
                </div>
            </div>
        );
    }

    if (pendingPersonality) {
        return (
            <div style={{ padding: 24, display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', minHeight: 300 }}>
                <div style={{ fontSize: 40, marginBottom: 12 }}>🎭</div>
                <div style={{ fontSize: 16, fontWeight: 700, color: '#1f2937', marginBottom: 16 }}>
                    {char.name} 的性格分析结果
                </div>

                <div style={{
                    width: '100%', maxWidth: 320, borderRadius: 16, overflow: 'hidden',
                    border: '1px solid #e5e7eb', background: 'white',
                }}>
                    {/* 认知风格 */}
                    <div style={{ padding: '16px 20px', borderBottom: '1px solid #f3f4f6' }}>
                        <div style={{ fontSize: 11, color: '#9ca3af', marginBottom: 4 }}>认知风格</div>
                        <div style={{ fontSize: 18, fontWeight: 700, color: '#7c3aed' }}>
                            {STYLE_LABELS[pendingPersonality.style] || pendingPersonality.style}
                        </div>
                        <div style={{ fontSize: 12, color: '#6b7280', marginTop: 4 }}>
                            {STYLE_DESCS[pendingPersonality.style] || ''}
                        </div>
                    </div>
                    {/* 反刍倾向 */}
                    <div style={{ padding: '16px 20px', borderBottom: '1px solid #f3f4f6' }}>
                        <div style={{ fontSize: 11, color: '#9ca3af', marginBottom: 4 }}>反刍倾向</div>
                        <div style={{ display: 'flex', alignItems: 'baseline', gap: 8 }}>
                            <span style={{ fontSize: 18, fontWeight: 700, color: '#7c3aed' }}>
                                {pendingPersonality.ruminationTendency.toFixed(1)}
                            </span>
                            <span style={{ fontSize: 12, color: '#6b7280' }}>
                                {RUM_LABELS(pendingPersonality.ruminationTendency)}
                            </span>
                        </div>
                    </div>
                    {/* 理由 */}
                    {pendingPersonality.reasoning && (
                        <div style={{ padding: '12px 20px', background: '#faf5ff' }}>
                            <div style={{ fontSize: 12, color: '#7c3aed', fontStyle: 'italic', lineHeight: 1.5 }}>
                                "{pendingPersonality.reasoning}"
                            </div>
                        </div>
                    )}
                </div>

                <div style={{ display: 'flex', gap: 10, marginTop: 20, width: '100%', maxWidth: 320 }}>
                    <button
                        onClick={() => {
                            updateCharacter(char.id, {
                                personalityStyle: pendingPersonality.style,
                                ruminationTendency: pendingPersonality.ruminationTendency,
                            } as any);
                            setPendingPersonality(null);
                        }}
                        style={{
                            flex: 1, padding: '12px 0', borderRadius: 12, border: 'none',
                            fontSize: 14, fontWeight: 700, color: 'white', background: '#7c3aed',
                            cursor: 'pointer',
                        }}
                    >
                        确认
                    </button>
                    <button
                        onClick={() => {
                            // 用默认值，让用户后续在认知参数里改
                            updateCharacter(char.id, {
                                personalityStyle: 'emotional',
                                ruminationTendency: 0.3,
                            } as any);
                            setPendingPersonality(null);
                        }}
                        style={{
                            padding: '12px 16px', borderRadius: 12, border: '1px solid #e5e7eb',
                            fontSize: 13, fontWeight: 600, color: '#6b7280', background: 'white',
                            cursor: 'pointer',
                        }}
                    >
                        跳过
                    </button>
                </div>

                <div style={{ fontSize: 10, color: '#c4c4c4', marginTop: 12, textAlign: 'center' }}>
                    可在设置页「认知参数」中随时调整
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
                        全局配置，所有角色共用同一套 API
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
                        用于记忆提取、关联分析、认知消化等后台任务。此配置全局生效，所有角色共用。
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
                            ❌ 未配置 — 记忆宫殿的后台处理（提取、消化等）无法运行
                        </div>
                    )}
                </div>

                {/* Embedding API */}
                <div style={{ background: '#f8f7ff', borderRadius: 16, padding: 16, border: '1px solid #e9e5ff' }}>
                    <div style={{ fontSize: 12, fontWeight: 700, color: '#7c3aed', marginBottom: 12 }}>
                        🔗 Embedding API（OpenAI 兼容格式）
                    </div>
                    <div style={{ fontSize: 11, color: '#6b7280', marginBottom: 16, lineHeight: 1.6 }}>
                        推荐使用硅基流动（SiliconFlow），注册即送免费额度。
                        下方选择模型后只需填入 API Key 即可。
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
                            <div style={{ display: 'flex', gap: 6, alignItems: 'center' }}>
                                <input
                                    type="password"
                                    value={embKey}
                                    onChange={e => setEmbKey(e.target.value)}
                                    placeholder="sk-..."
                                    className={inputClass}
                                    style={{ flex: 1 }}
                                />
                                <button onClick={() => window.open('https://cloud.siliconflow.cn/account/ak', '_blank')} style={{
                                    padding: '8px 12px', borderRadius: 10, fontSize: 11, fontWeight: 600,
                                    border: '1px solid #e9e5ff', background: 'white', color: '#7c3aed',
                                    cursor: 'pointer', whiteSpace: 'nowrap', flexShrink: 0,
                                }}>
                                    获取 Key →
                                </button>
                            </div>
                        </div>

                        <div>
                            <label className={labelClass}>EMBEDDING 模型</label>

                            {/* 红框警告：已有记忆时提醒不要随意换模型 */}
                            {memoryPalaceConfig.embedding.model && totalCount > 0 && (
                                <div style={{
                                    margin: '0 0 10px 0', padding: '10px 14px', borderRadius: 12,
                                    border: '1.5px solid #fca5a5', background: '#fef2f2',
                                    fontSize: 11, color: '#991b1b', lineHeight: 1.7,
                                }}>
                                    <span style={{ fontWeight: 700 }}>⚠️ 重要：</span>
                                    当前已有 <b>{totalCount}</b> 条记忆使用 <b>{memoryPalaceConfig.embedding.model.split('/').pop()}</b> 模型生成。
                                    更换模型后系统会自动重新生成所有向量（需要一点时间和 API 额度），
                                    <b>建议选定后就不要再换了</b>。如果不确定，选「推荐」就好。
                                </div>
                            )}

                            <div style={{ display: 'flex', flexDirection: 'column', gap: 6, marginBottom: 8 }}>
                                {[
                                    { model: 'BAAI/bge-m3', dim: 1024, tag: '✨ 推荐', desc: '多语言顶级模型，免费', color: '#7c3aed' },
                                    { model: 'Pro/BAAI/bge-m3', dim: 1024, tag: '👑 最强', desc: '加速推理版，¥0.7/百万token', color: '#f59e0b' },
                                    { model: 'BAAI/bge-large-zh-v1.5', dim: 1024, tag: '🆓 免费', desc: '中文专精，轻量快速', color: '#10b981' },
                                    { model: 'netease-youdao/bce-embedding-base_v1', dim: 768, tag: '🆓 免费', desc: '网易有道，768维', color: '#10b981' },
                                ].map(opt => {
                                    const isActive = embModel === opt.model && embDimensions === opt.dim;
                                    return (
                                        <button key={opt.model} onClick={() => {
                                            setEmbModel(opt.model);
                                            setEmbDimensions(opt.dim);
                                            if (!embUrl.trim()) setEmbUrl('https://api.siliconflow.cn/v1');
                                        }} style={{
                                            display: 'flex', alignItems: 'center', gap: 8,
                                            padding: '10px 14px', borderRadius: 12, fontSize: 12,
                                            border: isActive ? `2px solid ${opt.color}` : '1px solid #e5e7eb',
                                            background: isActive ? `${opt.color}11` : 'white',
                                            cursor: 'pointer', textAlign: 'left', width: '100%',
                                            transition: 'all 0.15s',
                                        }}>
                                            <span style={{ fontWeight: 700, fontSize: 11, color: opt.color, whiteSpace: 'nowrap' }}>{opt.tag}</span>
                                            <span style={{ flex: 1 }}>
                                                <span style={{ fontWeight: 600, fontSize: 12, color: '#1f2937' }}>{opt.model.split('/').pop()}</span>
                                                <span style={{ fontSize: 10, color: '#9ca3af', marginLeft: 6 }}>{opt.desc}</span>
                                            </span>
                                            <span style={{ fontSize: 10, color: '#9ca3af' }}>{opt.dim}维</span>
                                        </button>
                                    );
                                })}
                            </div>
                            <div style={{ fontSize: 10, color: '#9ca3af', paddingLeft: 4, marginBottom: 4 }}>
                                或手动输入模型名（支持任何 OpenAI 兼容的 Embedding 端点）
                            </div>
                            <input
                                type="text"
                                value={embModel}
                                onChange={e => setEmbModel(e.target.value)}
                                placeholder="BAAI/bge-m3"
                                className={inputClass}
                            />
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
                                选择预设模型会自动填入。手动输入时推荐 1024，部分模型支持 512 / 768
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

                {/* 人格风格 & 反刍倾向：由 LLM 自动推断，默认折叠 */}
                <details style={{ marginTop: 16 }}>
                    <summary style={{ fontSize: 10, color: '#c4c4c4', cursor: 'pointer', userSelect: 'none' }}>
                        认知参数
                    </summary>
                    <div style={{ marginTop: 8, background: '#f9fafb', borderRadius: 12, padding: 14, border: '1px solid #e5e7eb', display: 'flex', flexDirection: 'column', gap: 10 }}>
                        <div>
                            <label className={labelClass}>认知风格</label>
                            <select
                                value={(char as any).personalityStyle || 'emotional'}
                                onChange={e => updateCharacter(char.id, { personalityStyle: e.target.value } as any)}
                                className={inputClass}
                                style={{ fontFamily: 'inherit', fontSize: 12 }}
                            >
                                <option value="emotional">情感型</option>
                                <option value="narrative">叙事型</option>
                                <option value="imagery">意象型</option>
                                <option value="analytical">分析型</option>
                            </select>
                        </div>
                        <div>
                            <label className={labelClass}>反刍倾向 {((char as any).ruminationTendency ?? 0.3).toFixed(1)}</label>
                            <input
                                type="range" min="0" max="1" step="0.1"
                                value={(char as any).ruminationTendency ?? 0.3}
                                onChange={e => updateCharacter(char.id, { ruminationTendency: parseFloat(e.target.value) } as any)}
                                style={{ width: '100%' }}
                            />
                        </div>
                        <div style={{ fontSize: 10, color: '#b0b0b0', lineHeight: 1.5 }}>
                            由 AI 根据角色人设自动判断，通常无需手动修改。
                        </div>
                    </div>
                </details>

                {/* 聊天记录向量化 */}
                {/* 迁移旧记忆 */}
                <div style={{ marginTop: 16, background: '#fefce8', borderRadius: 16, padding: 16, border: '1px solid #fde68a' }}>
                    <div style={{ fontSize: 12, fontWeight: 700, color: '#92400e', marginBottom: 8 }}>
                        📦 导入旧记忆
                    </div>
                    <div style={{ fontSize: 11, color: '#78716c', marginBottom: 12, lineHeight: 1.6 }}>
                        按月将旧的日度记忆 ({char.memories?.length || 0} 条) 送给 LLM，
                        以 {char.name} 的第一人称视角重新提取为记忆节点。可选择具体月份，不选则全部导入。旧数据不会被删除。
                    </div>

                    {/* 分块选择器（每月拆上旬/中旬/下旬） */}
                    {availableChunks.length > 0 && (
                        <div style={{ marginBottom: 12 }}>
                            <div style={{ fontSize: 11, fontWeight: 600, color: '#92400e', marginBottom: 6 }}>
                                选择分块（不选 = 全部）· 每月拆为上旬/中旬/下旬，可单独选择避免重跑
                            </div>
                            {availableMonths.map(month => {
                                const monthChunks = availableChunks.filter(c => c.key.startsWith(month));
                                if (monthChunks.length === 0) return null;
                                return (
                                    <div key={month} style={{ marginBottom: 6 }}>
                                        <div style={{ fontSize: 10, color: '#78716c', marginBottom: 3, fontWeight: 600 }}>{month}</div>
                                        <div style={{ display: 'flex', flexWrap: 'wrap', gap: 4 }}>
                                            {monthChunks.map(chunk => (
                                                <button
                                                    key={chunk.key}
                                                    onClick={() => {
                                                        setSelectedMonths(prev => {
                                                            const next = new Set(prev);
                                                            if (next.has(chunk.key)) next.delete(chunk.key);
                                                            else next.add(chunk.key);
                                                            return next;
                                                        });
                                                    }}
                                                    style={{
                                                        padding: '3px 8px', borderRadius: 6, fontSize: 10, fontWeight: 600,
                                                        border: selectedMonths.has(chunk.key) ? '2px solid #f59e0b' : '1px solid #d4d4d4',
                                                        background: selectedMonths.has(chunk.key) ? '#fef3c7' : 'white',
                                                        color: selectedMonths.has(chunk.key) ? '#92400e' : '#6b7280',
                                                        cursor: 'pointer',
                                                    }}
                                                >
                                                    {chunk.key.replace(month + ' ', '')} ({chunk.count}条)
                                                </button>
                                            ))}
                                        </div>
                                    </div>
                                );
                            })}
                            {selectedMonths.size > 0 && (
                                <div style={{ fontSize: 10, color: '#92400e', marginTop: 4 }}>
                                    已选 {selectedMonths.size} 个分块
                                    <span
                                        onClick={() => setSelectedMonths(new Set())}
                                        style={{ marginLeft: 8, color: '#dc2626', cursor: 'pointer', textDecoration: 'underline' }}
                                    >
                                        清除选择
                                    </span>
                                </div>
                            )}
                        </div>
                    )}

                    {migrationProgress && (
                        <div style={{ fontSize: 11, color: '#92400e', marginBottom: 8 }}>
                            {migrationProgress.phase === 'grouping' && `按月分组中...`}
                            {migrationProgress.phase === 'extracting' && `LLM 提取中... ${migrationProgress.currentMonth || ''} (${migrationProgress.current}/${migrationProgress.total} 块)`}
                            {migrationProgress.phase === 'vectorizing' && `Embedding 向量化中... ${migrationProgress.current}/${migrationProgress.total} 条`}
                            {migrationProgress.phase === 'linking' && `建立记忆关联中...`}
                            {migrationProgress.phase === 'done' && `完成`}
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
                        {migrating ? '迁移中...' : !hasEmbeddingConfig ? '请先配置 Embedding API' : selectedMonths.size > 0 ? `开始迁移（${selectedMonths.size} 个分块）` : '开始迁移（全部）'}
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
                        反复学到的东西是否已经内化成性格的一部分？聊天每 50 轮自动触发一次，也可以随时手动触发。
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
                        {digesting ? `${char.name}正在静静地回想…` : '手动触发消化'}
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
                    <div
                        onClick={openAllMemories}
                        style={{
                            display: 'inline-block', marginTop: 8,
                            fontSize: 11, fontWeight: 600, color: '#7c3aed',
                            cursor: 'pointer', padding: '4px 12px',
                            borderRadius: 8, border: '1px solid #e9e5ff',
                            background: '#f8f6ff',
                        }}
                    >
                        📋 查看全部记忆
                    </div>

                    {/* 全局搜索 */}
                    <div style={{ marginTop: 12, textAlign: 'left' }}>
                        <input
                            type="text"
                            value={globalSearchQuery}
                            onChange={(e) => {
                                const q = e.target.value;
                                setGlobalSearchQuery(q);
                                if (globalSearchTimerRef.current) clearTimeout(globalSearchTimerRef.current);
                                if (q.trim().length < 2) { setGlobalSearchResults([]); return; }
                                globalSearchTimerRef.current = setTimeout(async () => {
                                    const allNodes = await MemoryNodeDB.getByCharId(char!.id);
                                    const keywords = q.trim().toLowerCase().split(/\s+/);
                                    const filtered = allNodes
                                        .filter(n => {
                                            const text = (n.content + ' ' + n.tags.join(' ') + ' ' + n.boxTopic + ' ' + n.mood).toLowerCase();
                                            return keywords.every(kw => text.includes(kw));
                                        })
                                        .sort((a, b) => b.importance - a.importance)
                                        .slice(0, 20);
                                    setGlobalSearchResults(filtered);
                                }, 300);
                            }}
                            placeholder="🔍 搜索记忆（关键词、标签、情绪...）"
                            style={{
                                width: '100%', padding: '10px 14px', borderRadius: 12,
                                border: '1px solid #e5e7eb', background: '#f9fafb',
                                fontSize: 13, outline: 'none', boxSizing: 'border-box',
                            }}
                        />
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

                {/* 搜索结果 or 七个房间 */}
                {globalSearchQuery.trim().length >= 2 ? (
                    <div style={{ marginBottom: 20 }}>
                        <div style={{ fontSize: 12, color: '#9ca3af', marginBottom: 8 }}>
                            {globalSearchResults.length > 0
                                ? `找到 ${globalSearchResults.length} 条记忆`
                                : '没有找到匹配的记忆'}
                        </div>
                        {globalSearchResults.map(node => {
                            const color = ROOM_COLORS[node.room];
                            return (
                                <div
                                    key={node.id}
                                    onClick={() => openMemory(node, 'all')}
                                    style={{
                                        padding: '10px 12px', borderRadius: 10, marginBottom: 6,
                                        border: `1px solid ${color}33`, background: `${color}08`,
                                        cursor: 'pointer',
                                    }}
                                >
                                    <div style={{ fontSize: 13, lineHeight: 1.5, color: '#1f2937' }}>
                                        {node.content.length > 100 ? node.content.slice(0, 100) + '...' : node.content}
                                    </div>
                                    <div style={{ fontSize: 10, color: '#9ca3af', marginTop: 4, display: 'flex', gap: 8, flexWrap: 'wrap' }}>
                                        <span>{ROOM_ICONS[node.room]} {getRoomLabel(node.room, userProfile?.name)}</span>
                                        <span>{new Date(node.createdAt).toLocaleDateString('zh-CN')}</span>
                                        <span style={{ color }}>{'★'.repeat(Math.min(node.importance, 5))}</span>
                                        <span>{node.mood}</span>
                                    </div>
                                    {node.tags.length > 0 && (
                                        <div style={{ marginTop: 4, display: 'flex', gap: 3, flexWrap: 'wrap' }}>
                                            {node.tags.map((t: string) => (
                                                <span key={t} style={{
                                                    fontSize: 9, padding: '1px 6px', borderRadius: 4,
                                                    backgroundColor: `${color}18`, color,
                                                }}>{t}</span>
                                            ))}
                                        </div>
                                    )}
                                </div>
                            );
                        })}
                    </div>
                ) : (
                    <>
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
                                        <div style={{ fontSize: 14, fontWeight: 600, color }}>{getRoomLabel(room, userProfile?.name)}</div>
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
                    </>
                )}

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

    // ─── 全部记忆视图 ────────────────────────────────

    if (view === 'all') {
        const sorted = [...allNodes].sort((a, b) => {
            const dir = allSortDir === 'desc' ? -1 : 1;
            if (allSortBy === 'time') return dir * (a.createdAt - b.createdAt);
            return dir * (a.importance - b.importance);
        });

        return (
            <div style={{ padding: 16, maxHeight: '100%', overflowY: 'auto' }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 12 }}>
                    <div
                        onClick={() => { setView('palace'); }}
                        style={{ fontSize: 13, color: '#6b7280', cursor: 'pointer' }}
                    >
                        ← 返回宫殿
                    </div>
                    <div style={{ fontSize: 12, color: '#9ca3af' }}>{allNodes.length} 条记忆</div>
                </div>

                <div style={{ fontSize: 18, fontWeight: 700, marginBottom: 12 }}>📋 全部记忆</div>

                {/* 排序控制 */}
                <div style={{ display: 'flex', gap: 6, marginBottom: 14, flexWrap: 'wrap', alignItems: 'center' }}>
                    <span style={{ fontSize: 11, color: '#6b7280' }}>排序：</span>
                    {(['time', 'importance'] as const).map(s => (
                        <button
                            key={s}
                            onClick={() => setAllSortBy(s)}
                            style={{
                                padding: '3px 10px', borderRadius: 6, fontSize: 11, fontWeight: 600,
                                border: allSortBy === s ? '2px solid #7c3aed' : '1px solid #d4d4d4',
                                background: allSortBy === s ? '#f3f0ff' : 'white',
                                color: allSortBy === s ? '#7c3aed' : '#6b7280',
                                cursor: 'pointer',
                            }}
                        >
                            {s === 'time' ? '时间' : '重要性'}
                        </button>
                    ))}
                    <button
                        onClick={() => setAllSortDir(d => d === 'desc' ? 'asc' : 'desc')}
                        style={{
                            padding: '3px 10px', borderRadius: 6, fontSize: 11, fontWeight: 600,
                            border: '1px solid #d4d4d4', background: 'white', color: '#6b7280',
                            cursor: 'pointer',
                        }}
                    >
                        {allSortDir === 'desc' ? '↓ 降序' : '↑ 升序'}
                    </button>
                </div>

                {sorted.length === 0 ? (
                    <div style={{ textAlign: 'center', color: '#9ca3af', padding: 40, fontSize: 13 }}>
                        还没有任何记忆
                    </div>
                ) : (
                    sorted.map((node: MemoryNode) => (
                        <div
                            key={node.id}
                            onClick={() => openMemory(node, 'all')}
                            style={{
                                padding: 12, borderRadius: 10, marginBottom: 8,
                                border: '1px solid #e5e7eb', cursor: 'pointer',
                                backgroundColor: '#fafafa',
                            }}
                        >
                            <div style={{ fontSize: 13, lineHeight: 1.5 }}>{node.content}</div>
                            <div style={{ fontSize: 11, color: '#9ca3af', marginTop: 6, display: 'flex', gap: 8, flexWrap: 'wrap' }}>
                                <span>{ROOM_ICONS[node.room]} {getRoomLabel(node.room, userProfile?.name)}</span>
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
                                            backgroundColor: '#f3f0ff', color: '#7c3aed',
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

    // ─── 房间详情视图 ────────────────────────────────

    if (view === 'room' && selectedRoom) {
        const roomLabel = getRoomLabel(selectedRoom, userProfile?.name);
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
        const roomColor = ROOM_COLORS[editing ? editRoom : selectedNode.room];
        const MOODS = ['happy', 'sad', 'angry', 'anxious', 'tender', 'peaceful', 'excited', 'nostalgic', 'frustrated', 'hopeful', 'lonely', 'grateful'];

        return (
            <div style={{ padding: 16, maxHeight: '100%', overflowY: 'auto' }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 12 }}>
                    <div
                        onClick={() => { setView(prevView); setSelectedNode(null); setEditing(false); }}
                        style={{ fontSize: 13, color: '#6b7280', cursor: 'pointer' }}
                    >
                        ← 返回 {prevView === 'all' ? '全部记忆' : getRoomLabel(selectedRoom || selectedNode.room, userProfile?.name)}
                    </div>
                    {!editing && (
                        <div
                            onClick={() => setEditing(true)}
                            style={{ fontSize: 12, color: '#3b82f6', cursor: 'pointer', fontWeight: 600 }}
                        >
                            编辑
                        </div>
                    )}
                </div>

                <div style={{
                    padding: 16, borderRadius: 12,
                    border: `1px solid ${roomColor}44`,
                    backgroundColor: `${roomColor}08`,
                }}>
                    {editing ? (
                        /* ─── 编辑模式 ─── */
                        <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
                            <div>
                                <label className={labelClass}>内容</label>
                                <textarea
                                    value={editContent}
                                    onChange={e => setEditContent(e.target.value)}
                                    className={inputClass}
                                    style={{ minHeight: 100, resize: 'vertical', fontFamily: 'inherit' }}
                                />
                            </div>
                            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10 }}>
                                <div>
                                    <label className={labelClass}>房间</label>
                                    <select
                                        value={editRoom}
                                        onChange={e => setEditRoom(e.target.value as MemoryRoom)}
                                        className={inputClass}
                                        style={{ fontFamily: 'inherit' }}
                                    >
                                        {(Object.keys(ROOM_CONFIGS) as MemoryRoom[]).map(r => (
                                            <option key={r} value={r}>{ROOM_ICONS[r]} {getRoomLabel(r, userProfile?.name)}</option>
                                        ))}
                                    </select>
                                </div>
                                <div>
                                    <label className={labelClass}>情绪</label>
                                    <select
                                        value={editMood}
                                        onChange={e => setEditMood(e.target.value)}
                                        className={inputClass}
                                        style={{ fontFamily: 'inherit' }}
                                    >
                                        {MOODS.map(m => <option key={m} value={m}>{m}</option>)}
                                    </select>
                                </div>
                            </div>
                            <div>
                                <label className={labelClass}>重要性: {editImportance}</label>
                                <input
                                    type="range" min="1" max="10" step="1"
                                    value={editImportance}
                                    onChange={e => setEditImportance(parseInt(e.target.value))}
                                    style={{ width: '100%' }}
                                />
                                <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 10, color: '#9ca3af' }}>
                                    <span>1</span>
                                    <span style={{ color: roomColor, fontWeight: 600 }}>{'★'.repeat(editImportance)}{'☆'.repeat(10 - editImportance)}</span>
                                    <span>10</span>
                                </div>
                            </div>
                            <div>
                                <label className={labelClass}>标签（逗号分隔）</label>
                                <input
                                    value={editTags}
                                    onChange={e => setEditTags(e.target.value)}
                                    className={inputClass}
                                    placeholder="标签1, 标签2, ..."
                                />
                            </div>
                            <div style={{ display: 'flex', gap: 8 }}>
                                <button
                                    onClick={handleSaveEdit}
                                    disabled={saving || !editContent.trim()}
                                    style={{
                                        flex: 1, padding: '10px 0', borderRadius: 10, border: 'none',
                                        fontSize: 13, fontWeight: 700, color: 'white',
                                        background: saving ? '#d4d4d4' : '#3b82f6',
                                        cursor: saving ? 'not-allowed' : 'pointer',
                                    }}
                                >
                                    {saving ? '保存中...' : '保存修改'}
                                </button>
                                <button
                                    onClick={() => {
                                        setEditing(false);
                                        setEditContent(selectedNode.content);
                                        setEditImportance(selectedNode.importance);
                                        setEditMood(selectedNode.mood);
                                        setEditRoom(selectedNode.room);
                                        setEditTags(selectedNode.tags.join(', '));
                                    }}
                                    style={{
                                        padding: '10px 16px', borderRadius: 10, border: '1px solid #e5e7eb',
                                        fontSize: 13, fontWeight: 600, color: '#6b7280', background: 'white',
                                        cursor: 'pointer',
                                    }}
                                >
                                    取消
                                </button>
                            </div>
                        </div>
                    ) : (
                        /* ─── 查看模式 ─── */
                        <>
                            <div style={{ fontSize: 15, lineHeight: 1.6, marginBottom: 12 }}>{selectedNode.content}</div>

                            <div style={{ fontSize: 12, color: '#6b7280', lineHeight: 1.8 }}>
                                <div>{ROOM_ICONS[selectedNode.room]} {getRoomLabel(selectedNode.room, userProfile?.name)}</div>
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

                            {/* 关联事件 */}
                            <div style={{ marginTop: 14 }}>
                                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 8 }}>
                                    <div style={{ fontSize: 11, fontWeight: 700, color: '#6b7280' }}>
                                        🔗 关联事件{linkedMemories.length > 0 ? `（${linkedMemories.length}）` : ''}
                                    </div>
                                    <button
                                        onClick={() => { setShowLinkSearch(!showLinkSearch); setLinkSearchQuery(''); setLinkSearchResults([]); }}
                                        style={{
                                            fontSize: 10, fontWeight: 600, padding: '3px 10px', borderRadius: 6,
                                            border: '1px solid #e0e7ff', background: showLinkSearch ? '#e0e7ff' : 'white',
                                            color: '#6366f1', cursor: 'pointer',
                                        }}
                                    >
                                        {showLinkSearch ? '取消' : '+ 添加关联'}
                                    </button>
                                </div>

                                {/* 搜索添加关联 */}
                                {showLinkSearch && (
                                    <div style={{ marginBottom: 10, padding: 10, borderRadius: 10, border: '1px solid #e0e7ff', background: '#faf9ff' }}>
                                        <input
                                            type="text"
                                            value={linkSearchQuery}
                                            onChange={async (e) => {
                                                const q = e.target.value;
                                                setLinkSearchQuery(q);
                                                if (q.trim().length < 2) { setLinkSearchResults([]); return; }
                                                // 在当前角色的所有记忆中搜索关键词
                                                const allNodes = await MemoryNodeDB.getByCharId(char!.id);
                                                const filtered = allNodes
                                                    .filter(n => n.id !== selectedNode.id && (
                                                        n.content.includes(q.trim()) ||
                                                        n.tags.some(t => t.includes(q.trim())) ||
                                                        n.boxTopic.includes(q.trim())
                                                    ))
                                                    .sort((a, b) => b.importance - a.importance)
                                                    .slice(0, 8);
                                                setLinkSearchResults(filtered);
                                            }}
                                            placeholder="输入关键词搜索记忆..."
                                            className={inputClass}
                                            style={{ fontSize: 12, marginBottom: 6 }}
                                        />
                                        {linkSearchResults.map(node => {
                                            const alreadyLinked = linkedMemories.some(l => l.node.id === node.id);
                                            return (
                                                <div key={node.id} style={{
                                                    padding: '8px 10px', borderRadius: 8, marginBottom: 4,
                                                    border: '1px solid #e5e7eb', background: 'white',
                                                    display: 'flex', alignItems: 'flex-start', gap: 8,
                                                    opacity: alreadyLinked ? 0.5 : 1,
                                                }}>
                                                    <div style={{ flex: 1 }}>
                                                        <div style={{ fontSize: 11, lineHeight: 1.5, color: '#1f2937' }}>
                                                            {node.content.length > 60 ? node.content.slice(0, 60) + '...' : node.content}
                                                        </div>
                                                        <div style={{ fontSize: 10, color: '#9ca3af', marginTop: 2 }}>
                                                            {ROOM_ICONS[node.room]} {getRoomLabel(node.room, userProfile?.name)} · {new Date(node.createdAt).toLocaleDateString('zh-CN')}
                                                        </div>
                                                    </div>
                                                    <button
                                                        disabled={alreadyLinked}
                                                        onClick={async () => {
                                                            const newLink: MemoryLink = {
                                                                id: `ml_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`,
                                                                sourceId: selectedNode.id,
                                                                targetId: node.id,
                                                                type: 'causal',
                                                                strength: 0.7,
                                                            };
                                                            await MemoryLinkDB.save(newLink);
                                                            setLinkedMemories(prev => [...prev, { link: newLink, node }]);
                                                        }}
                                                        style={{
                                                            flexShrink: 0, padding: '4px 10px', borderRadius: 6,
                                                            border: 'none', fontSize: 10, fontWeight: 600,
                                                            color: 'white', background: alreadyLinked ? '#d4d4d4' : '#6366f1',
                                                            cursor: alreadyLinked ? 'not-allowed' : 'pointer',
                                                        }}
                                                    >
                                                        {alreadyLinked ? '已关联' : '关联'}
                                                    </button>
                                                </div>
                                            );
                                        })}
                                        {linkSearchQuery.trim().length >= 2 && linkSearchResults.length === 0 && (
                                            <div style={{ fontSize: 11, color: '#9ca3af', textAlign: 'center', padding: 8 }}>
                                                没有找到匹配的记忆
                                            </div>
                                        )}
                                    </div>
                                )}

                                {loadingLinks && (
                                    <div style={{ fontSize: 12, color: '#9ca3af' }}>加载中...</div>
                                )}

                                {linkedMemories.map(({ link, node: linkedNode }) => (
                                    <div key={link.id} style={{
                                        padding: '10px 12px', borderRadius: 10, marginBottom: 6,
                                        border: '1px solid #e0e7ff', background: '#f5f3ff',
                                        display: 'flex', alignItems: 'flex-start', gap: 8,
                                    }}>
                                        <div style={{ flex: 1, cursor: 'pointer' }} onClick={() => openMemory(linkedNode, prevView)}>
                                            <div style={{ fontSize: 12, lineHeight: 1.5, color: '#1f2937' }}>
                                                {linkedNode.content.length > 80 ? linkedNode.content.slice(0, 80) + '...' : linkedNode.content}
                                            </div>
                                            <div style={{ fontSize: 10, color: '#9ca3af', marginTop: 4 }}>
                                                {ROOM_ICONS[linkedNode.room]} {getRoomLabel(linkedNode.room, userProfile?.name)} · {new Date(linkedNode.createdAt).toLocaleDateString('zh-CN')} · 强度 {(link.strength * 100).toFixed(0)}%
                                            </div>
                                        </div>
                                        <button
                                            onClick={async () => {
                                                if (confirm('解除这条关联？（不会删除记忆本身）')) {
                                                    await MemoryLinkDB.delete(link.id);
                                                    setLinkedMemories(prev => prev.filter(l => l.link.id !== link.id));
                                                }
                                            }}
                                            style={{
                                                flexShrink: 0, padding: '4px 8px', borderRadius: 6,
                                                border: '1px solid #e5e7eb', background: 'white',
                                                fontSize: 10, color: '#9ca3af', cursor: 'pointer',
                                            }}
                                        >
                                            解除
                                        </button>
                                    </div>
                                ))}

                                {!loadingLinks && linkedMemories.length === 0 && !showLinkSearch && (
                                    <div style={{ fontSize: 11, color: '#c4c4c4', textAlign: 'center', padding: '8px 0' }}>
                                        暂无关联事件
                                    </div>
                                )}
                            </div>

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
                        </>
                    )}
                </div>
            </div>
        );
    }

    return null;
}
