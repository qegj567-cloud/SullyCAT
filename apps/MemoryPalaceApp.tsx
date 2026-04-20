import React, { useState, useEffect, useCallback } from 'react';
import { useOS } from '../context/OSContext';
import {
    MemoryRoom, MemoryNode, ROOM_CONFIGS, ROOM_LABELS, getRoomLabel,
    MemoryNodeDB, AnticipationDB, MemoryLinkDB, EventBoxDB,
    migrateOldMemories, runCognitiveDigestion, getAvailableMonths, getAvailableChunks,
    detectPersonalityStyle,
    manuallyBindMemories, removeMemoryFromBox, unbindAllLiveMemories,
    wipeAllMemoryPalace,
} from '../utils/memoryPalace';
import type { Anticipation, MigrationProgress, DigestResult, MemoryLink, EventBox } from '../utils/memoryPalace';

/** UI 内部类型：统一描述"关联"来源（EventBox 兄弟 or 旧 MemoryLink） */
type LinkedMemoryUI = {
    /** 伪 link ID，用于 React key */
    id: string;
    /** 关系类型：box 兄弟（live / summary / archived）或 legacy causal link */
    relation: 'box_live' | 'box_summary' | 'box_archived' | 'legacy_causal';
    /** 所属 EventBox（box 关系时非 null） */
    box?: EventBox | null;
    node: MemoryNode;
};

// ─── 房间图标映射 ─────────────────────────────────────

/** 顶部安全区 padding：优先用 iOS safe-area-inset-top，没有则退回 40px，避免手机状态栏遮挡按钮 */
const SAFE_PAD_TOP: React.CSSProperties['paddingTop'] = 'max(40px, calc(env(safe-area-inset-top) + 16px))';

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
    const { activeCharacterId, characters, updateCharacter, setActiveCharacterId, closeApp, apiPresets, userProfile, memoryPalaceConfig, updateMemoryPalaceConfig, remoteVectorConfig, updateRemoteVectorConfig, addToast } = useOS();
    const char = characters.find(c => c.id === activeCharacterId);

    const [view, setView] = useState<'picker' | 'palace' | 'room' | 'memory' | 'settings' | 'all' | 'boxes'>('picker');
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
    const [pinnedNodes, setPinnedNodes] = useState<MemoryNode[]>([]);

    // 事件盒视图
    const [allBoxes, setAllBoxes] = useState<EventBox[]>([]);
    const [expandedBoxId, setExpandedBoxId] = useState<string | null>(null);
    const [boxMembers, setBoxMembers] = useState<Record<string, { summary: MemoryNode | null; live: MemoryNode[]; archived: MemoryNode[] }>>({});

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
    const [prevView, setPrevView] = useState<'room' | 'all' | 'boxes'>('room');

    // 认知消化状态
    const [digesting, setDigesting] = useState(false);
    const [digestResult, setDigestResult] = useState<string | null>(null);

    // 一键清空
    const [wiping, setWiping] = useState(false);
    const [wipeResult, setWipeResult] = useState<string | null>(null);

    // 关联记忆状态（记忆详情页展示 EventBox 兄弟 + 兼容展示遗留 causal link）
    const [linkedMemories, setLinkedMemories] = useState<LinkedMemoryUI[]>([]);
    const [currentBox, setCurrentBox] = useState<EventBox | null>(null);
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

    // 远程向量存储配置
    const [rvUrl, setRvUrl] = useState(remoteVectorConfig.supabaseUrl);
    const [rvKey, setRvKey] = useState(remoteVectorConfig.supabaseAnonKey);
    const [rvTestResult, setRvTestResult] = useState('');
    const [rvTesting, setRvTesting] = useState(false);
    const [rvSyncing, setRvSyncing] = useState(false);
    const [showInitSQL, setShowInitSQL] = useState(false);

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

    // 远程向量配置变更时同步到本地状态
    useEffect(() => {
        setRvUrl(remoteVectorConfig.supabaseUrl);
        setRvKey(remoteVectorConfig.supabaseAnonKey);
    }, [remoteVectorConfig.supabaseUrl, remoteVectorConfig.supabaseAnonKey]);

    // 人格风格 + 反刍倾向 检测
    const [detectingPersonality, setDetectingPersonality] = useState(false);
    const [pendingPersonality, setPendingPersonality] = useState<{ style: string; ruminationTendency: number; reasoning: string } | null>(null);
    // pendingPersonality 绑定到产生它的角色 id，防止切角色后把旧结果应用到新角色
    const [pendingPersonalityCharId, setPendingPersonalityCharId] = useState<string | null>(null);
    // 抽出原始字段作为 useEffect 依赖，避免 memoryPalaceConfig 对象新引用触发重跑
    const lightLLMBaseUrl = memoryPalaceConfig.lightLLM?.baseUrl || '';
    const lightLLMApiKey = memoryPalaceConfig.lightLLM?.apiKey || '';

    // 切换角色时清掉上一个角色遗留的待确认结果
    useEffect(() => {
        if (pendingPersonalityCharId && pendingPersonalityCharId !== char?.id) {
            setPendingPersonality(null);
            setPendingPersonalityCharId(null);
        }
    }, [char?.id, pendingPersonalityCharId]);

    useEffect(() => {
        if (!char || (char as any).personalityStyle) return;
        // 只在 palace 视图里检测；picker 只是选人页，此时 char 还是上个上下文遗留的 activeCharacterId
        // （比如刚从 Sully 的聊天退出就打开记忆宫殿），在 picker 里跑会把旧角色当前角色拿去检测
        if (view !== 'palace') return;
        // 已经尝试过或已确认过，不再重复检测（避免 LLM 偶发重置人格）
        const skipKey = `mp_personality_tried_${char.id}`;
        if (localStorage.getItem(skipKey)) return;
        if (!lightLLMBaseUrl || !lightLLMApiKey) return;

        // 切换角色时，丢弃旧角色尚未返回的检测结果，避免把 A 的人格应用到 B
        let cancelled = false;
        const detectingCharId = char.id;

        setDetectingPersonality(true);
        const persona = [char.systemPrompt || '', char.worldview || ''].filter(Boolean).join('\n');
        detectPersonalityStyle(detectingCharId, char.name, persona, memoryPalaceConfig.lightLLM)
            .then(result => {
                if (cancelled) return;
                setPendingPersonality(result);
                setPendingPersonalityCharId(detectingCharId);
            })
            .catch(e => {
                if (cancelled) return;
                console.warn('🎭 性格检测失败:', e.message);
                // 标记已尝试，避免重复弹窗；用户可在设置里手动调整
                localStorage.setItem(skipKey, '1');
            })
            .finally(() => {
                if (!cancelled) setDetectingPersonality(false);
            });

        return () => { cancelled = true; };
        // 依赖用原始字符串字段，避免 memoryPalaceConfig 对象每次新引用都重跑
    }, [char?.id, (char as any)?.personalityStyle, view, lightLLMBaseUrl, lightLLMApiKey]);

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

        const boxes = await EventBoxDB.getByCharId(char.id);
        setBoxCount(boxes.length);

        const ants = await AnticipationDB.getByCharId(char.id);
        setAnticipations(ants);

        // 加载便利贴置顶记忆
        const now = Date.now();
        setPinnedNodes(allNodes.filter(n => n.pinnedUntil && n.pinnedUntil > now));

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

    const openAllBoxes = async () => {
        if (!char) return;
        const boxes = await EventBoxDB.getByCharId(char.id);
        boxes.sort((a, b) => b.updatedAt - a.updatedAt);
        setAllBoxes(boxes);
        setExpandedBoxId(null);
        setBoxMembers({});
        setView('boxes');
    };

    /** 一键移出某 box 的所有活节点（应急出口：压缩连续失败导致活池堆到几十条时用）。
     *  记忆不删，回到"地上"作为独立记忆。summary / archived 保持不动。 */
    const handleUnbindAllLive = async (box: EventBox) => {
        if (!char) return;
        const liveCount = box.liveMemoryIds.length;
        if (liveCount === 0) return;
        if (!confirm(
            `把「${box.name || '未命名'}」里的 ${liveCount} 条活节点全部移出？\n\n`
            + `这些记忆不会被删除，只是脱离当前事件盒、回到"地上"作为独立记忆。\n`
            + `整合回忆（summary）和已归档节点保持不动。`
        )) return;
        try {
            await unbindAllLiveMemories(box.id);
            // 刷新 allBoxes + 展开态（盒可能已被整个删掉）
            const boxes = await EventBoxDB.getByCharId(char.id);
            boxes.sort((a, b) => b.updatedAt - a.updatedAt);
            setAllBoxes(boxes);
            const stillExists = boxes.some(b => b.id === box.id);
            if (!stillExists) {
                setExpandedBoxId(null);
                setBoxMembers(prev => {
                    const next = { ...prev };
                    delete next[box.id];
                    return next;
                });
            } else {
                setBoxMembers(prev => ({
                    ...prev,
                    [box.id]: { ...(prev[box.id] || { summary: null, live: [], archived: [] }), live: [] },
                }));
            }
            loadStats();
        } catch (e: any) {
            alert(`移出失败：${e?.message || e}`);
        }
    };

    const toggleBoxExpand = async (box: EventBox) => {
        if (expandedBoxId === box.id) {
            setExpandedBoxId(null);
            return;
        }
        if (!boxMembers[box.id]) {
            const summary = box.summaryNodeId ? await MemoryNodeDB.getById(box.summaryNodeId) : null;
            const live: MemoryNode[] = [];
            for (const id of box.liveMemoryIds) {
                const n = await MemoryNodeDB.getById(id);
                if (n) live.push(n);
            }
            const archived: MemoryNode[] = [];
            for (const id of box.archivedMemoryIds) {
                const n = await MemoryNodeDB.getById(id);
                if (n) archived.push(n);
            }
            setBoxMembers(prev => ({ ...prev, [box.id]: { summary: summary || null, live, archived } }));
        }
        setExpandedBoxId(box.id);
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
            const node = await MemoryNodeDB.getById(nodeId);
            const results: LinkedMemoryUI[] = [];
            let box: EventBox | null = null;

            // 1) 若归属 EventBox → 列出 summary + 所有兄弟（live / archived）
            if (node?.eventBoxId) {
                box = (await EventBoxDB.getById(node.eventBoxId)) || null;
                if (box) {
                    // summary 节点
                    if (box.summaryNodeId && box.summaryNodeId !== nodeId) {
                        const s = await MemoryNodeDB.getById(box.summaryNodeId);
                        if (s) results.push({
                            id: `eb-summary-${box.id}`, relation: 'box_summary', box, node: s,
                        });
                    }
                    // live 兄弟
                    for (const id of box.liveMemoryIds) {
                        if (id === nodeId) continue;
                        const n = await MemoryNodeDB.getById(id);
                        if (n) results.push({
                            id: `eb-live-${box.id}-${id}`, relation: 'box_live', box, node: n,
                        });
                    }
                    // archived 兄弟（展示但视觉上弱化）
                    for (const id of box.archivedMemoryIds) {
                        if (id === nodeId) continue;
                        const n = await MemoryNodeDB.getById(id);
                        if (n) results.push({
                            id: `eb-arch-${box.id}-${id}`, relation: 'box_archived', box, node: n,
                        });
                    }
                }
            }

            // 2) 兼容展示遗留 causal MemoryLink（旧版本残留，新代码不再创建）
            const legacyLinks = await MemoryLinkDB.getByNodeId(nodeId);
            for (const link of legacyLinks.filter(l => l.type === 'causal')) {
                const otherId = link.sourceId === nodeId ? link.targetId : link.sourceId;
                if (results.some(r => r.node.id === otherId)) continue; // box 里已展示，不再重复
                const otherNode = await MemoryNodeDB.getById(otherId);
                if (otherNode) results.push({
                    id: link.id, relation: 'legacy_causal', node: otherNode,
                });
            }

            setCurrentBox(box);
            setLinkedMemories(results);
        } catch {
            setCurrentBox(null);
            setLinkedMemories([]);
        } finally {
            setLoadingLinks(false);
        }
    };

    const openMemory = (node: MemoryNode, from?: 'room' | 'all' | 'boxes') => {
        setSelectedNode(node);
        setEditing(false);
        setEditContent(node.content);
        setEditImportance(node.importance);
        setEditMood(node.mood);
        setEditRoom(node.room);
        setEditTags(node.tags.join(', '));
        setLinkedMemories([]);
        setCurrentBox(null);
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
            // 远程同步由 MemoryNodeDB.save 自动处理
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

    // 远程向量：测试连接
    const handleTestRemoteVector = async () => {
        setRvTesting(true);
        setRvTestResult('');
        try {
            const { testConnection } = await import('../utils/memoryPalace/supabaseVector');
            const result = await testConnection({ enabled: true, supabaseUrl: rvUrl, supabaseAnonKey: rvKey, initialized: false });
            if (result.ok && result.tableExists) setRvTestResult('✓ ' + result.message);
            else if (result.ok) setRvTestResult('⚠ ' + result.message);
            else setRvTestResult('✗ ' + result.message);
        } catch (e: any) { setRvTestResult('✗ ' + e.message); }
        setRvTesting(false);
    };

    // 远程向量：保存配置
    const handleSaveRemoteVector = () => {
        const initialized = rvTestResult.startsWith('✓');
        updateRemoteVectorConfig({ enabled: true, supabaseUrl: rvUrl, supabaseAnonKey: rvKey, initialized });
        addToast('远程向量存储配置已保存', 'success');
    };

    // 远程向量：关闭
    const handleDisableRemoteVector = () => {
        updateRemoteVectorConfig({ enabled: false, initialized: false });
        addToast('远程向量存储已关闭', 'info');
    };

    // 远程向量：同步本地到远程
    const handleSyncToRemote = async () => {
        setRvSyncing(true);
        try {
            const { syncLocalToRemote } = await import('../utils/memoryPalace/supabaseVector');
            const { MemoryNodeDB } = await import('../utils/memoryPalace/db');
            const result = await syncLocalToRemote(
                remoteVectorConfig,
                async () => {
                    const allVectors = await (await import('../utils/db')).openDB().then(db => new Promise<any[]>((resolve, reject) => {
                        const tx = db.transaction('memory_vectors', 'readonly');
                        const req = tx.objectStore('memory_vectors').getAll();
                        req.onsuccess = () => resolve(req.result || []);
                        req.onerror = () => reject(req.error);
                    }));
                    const items = [];
                    for (const v of allVectors) {
                        const node = await MemoryNodeDB.getById(v.memoryId);
                        if (node) items.push({ memoryId: v.memoryId, charId: node.charId, vector: v.vector, node, dimensions: v.dimensions, model: v.model });
                    }
                    return items;
                },
                () => {},
            );
            addToast(`同步完成: ${result.synced} 条成功, ${result.failed} 条失败`, result.failed > 0 ? 'error' : 'success');
        } catch (e: any) { addToast(`同步失败: ${e.message}`, 'error'); }
        setRvSyncing(false);
    };

    // 远程向量：复制初始化 SQL
    const handleCopyInitSQL = async () => {
        try {
            const { INIT_SQL } = await import('../utils/memoryPalace/supabaseVector');
            await navigator.clipboard.writeText(INIT_SQL).catch(() => {
                const ta = document.createElement('textarea');
                ta.value = INIT_SQL;
                document.body.appendChild(ta);
                ta.select();
                document.execCommand('copy');
                document.body.removeChild(ta);
            });
            addToast('SQL 已复制到剪贴板', 'success');
        } catch { addToast('复制失败', 'error'); }
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

    /** 彻底删除一条记忆（node + vector + links + EventBox 成员引用 + 远程同步） */
    const deleteMemory = async (nodeId: string) => {
        // 先从 EventBox 中移除（若属于某盒）
        try { await removeMemoryFromBox(nodeId); } catch { /* ignore */ }
        // 删关联
        const links = await MemoryLinkDB.getByNodeId(nodeId);
        for (const link of links) {
            await MemoryLinkDB.delete(link.id);
        }
        // 删向量（本地）
        const { MemoryVectorDB } = await import('../utils/memoryPalace');
        await MemoryVectorDB.delete(nodeId);
        // 删向量（远程同步）
        if (remoteVectorConfig?.enabled && remoteVectorConfig.initialized) {
            import('../utils/memoryPalace/supabaseVector').then(({ deleteVector }) =>
                deleteVector(remoteVectorConfig, nodeId).catch(() => {})
            );
        }
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
            } else if (prevView === 'boxes' && char) {
                const boxes = await EventBoxDB.getByCharId(char.id);
                boxes.sort((a, b) => b.updatedAt - a.updatedAt);
                setAllBoxes(boxes);
                setBoxMembers({});
                setExpandedBoxId(null);
            }
            loadStats();
        } finally {
            setDeleting(false);
        }
    };

    /** 清除所有已迁移数据 */
    /** 一键清空记忆宫殿（本地 + 可选云端）。双重确认后执行。 */
    const handleWipeAll = async (includeRemote: boolean) => {
        const firstPrompt = includeRemote
            ? '⚠️ 即将清空【本地 + 云端 Supabase】所有记忆宫殿数据，包括：\n\n' +
              '- 所有角色的记忆节点、向量、关联、事件盒\n- 高水位标记\n- 云端 memory_vectors 全表\n\n' +
              '此操作不可撤销。确定继续？'
            : '⚠️ 即将清空【本地】所有记忆宫殿数据（云端保留）。\n\n' +
              '包括所有角色的记忆节点、向量、关联、事件盒、高水位标记。\n\n' +
              '此操作不可撤销。确定继续？';
        if (!confirm(firstPrompt)) return;
        if (!confirm('再次确认：真的要清空？')) return;

        setWiping(true);
        setWipeResult(null);
        try {
            const result = await wipeAllMemoryPalace({
                remoteConfig: includeRemote ? remoteVectorConfig : undefined,
                skipRemote: !includeRemote,
            });
            // 友好分项：记忆节点才是"一条记忆"，其余是衍生数据
            const STORE_LABELS: Record<string, string> = {
                memory_nodes: '记忆',
                memory_vectors: '向量',
                memory_links: '关联',
                memory_batches: '批次',
                anticipations: '期盼',
                event_boxes: '事件盒',
            };
            const parts: string[] = [];
            for (const [store, count] of Object.entries(result.local)) {
                if (count > 0) parts.push(`${STORE_LABELS[store] || store} ${count}`);
            }
            const breakdown = parts.length > 0 ? `（${parts.join('、')}）` : '';
            const msg = `🗑️ 本地已清空${breakdown}；高水位 ${result.highWatermarks} 条`
                + (result.remoteAttempted ? `；云端向量 ${result.remote} 行` : '；云端未清');
            setWipeResult(msg);
            await loadStats();
        } catch (e: any) {
            setWipeResult(`❌ 清空失败：${e?.message || e}`);
        } finally {
            setWiping(false);
        }
    };

    const handleClearMigrated = async () => {
        if (!char) return;
        setDeleting(true);
        try {
            const allNodes = await MemoryNodeDB.getByCharId(char.id);
            const migrated = allNodes.filter(n => n.boxId?.startsWith('migrated_'));
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

    // ─── 入口页：选角色（picker）─ view='picker' 或未选择 activeCharacterId 时渲染 ─────
    //     退出按钮在这里才真正关闭 App；其它 view 的"← 返回"只回到这一层

    if (view === 'picker' || !char) {
        return (
            <div style={{ paddingLeft: 16, paddingRight: 16, paddingBottom: 16, paddingTop: SAFE_PAD_TOP, maxHeight: '100%', overflowY: 'auto' }}>
                <div
                    onClick={closeApp}
                    style={{ fontSize: 13, color: '#6b7280', cursor: 'pointer', marginBottom: 16, padding: '4px 0' }}
                >
                    ← 退出
                </div>
                <div style={{ textAlign: 'center', marginBottom: 20 }}>
                    <div style={{ fontSize: 28, marginBottom: 4 }}>🏰</div>
                    <div style={{ fontSize: 16, fontWeight: 700 }}>记忆宫殿</div>
                    <div style={{ fontSize: 12, color: '#9ca3af', marginTop: 4 }}>选择一个角色进入</div>
                </div>
                {characters.length === 0 ? (
                    <div style={{ textAlign: 'center', color: '#9ca3af', fontSize: 13, marginTop: 40 }}>
                        还没有角色——去神经链接创建一个吧
                    </div>
                ) : (
                    <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10 }}>
                        {characters.map(c => (
                            <div
                                key={c.id}
                                onClick={() => handleSwitchChar(c.id)}
                                style={{
                                    padding: 16, borderRadius: 16, textAlign: 'center',
                                    border: c.id === activeCharacterId ? '2px solid #7c3aed' : '1px solid #e5e7eb',
                                    cursor: 'pointer',
                                    backgroundColor: c.id === activeCharacterId ? '#f5f3ff' : '#fafafa',
                                }}
                            >
                                <img src={c.avatar} alt="" style={{ width: 48, height: 48, borderRadius: 16, objectFit: 'cover', margin: '0 auto 8px' }} />
                                <div style={{ fontSize: 14, fontWeight: 600 }}>{c.name}</div>
                                <div style={{ fontSize: 11, color: '#9ca3af', marginTop: 2 }}>
                                    {(c as any).memoryPalaceEnabled ? '🏰 已开启' : '未开启'}
                                </div>
                            </div>
                        ))}
                    </div>
                )}
            </div>
        );
    }

    // ─── 未启用记忆宫殿 ─────────────────────────────────

    if (!char.memoryPalaceEnabled) {
        return (
            <div style={{ paddingLeft: 16, paddingRight: 16, paddingBottom: 16, paddingTop: SAFE_PAD_TOP, maxHeight: '100%', overflowY: 'auto' }}>
                <div
                    onClick={() => setView('picker')}
                    style={{ fontSize: 13, color: '#6b7280', cursor: 'pointer', marginBottom: 16, padding: '4px 0' }}
                >
                    ← 返回
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
            <div style={{ paddingLeft: 32, paddingRight: 32, paddingBottom: 32, paddingTop: SAFE_PAD_TOP, display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', minHeight: 300 }}>
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
            <div style={{ paddingLeft: 24, paddingRight: 24, paddingBottom: 24, paddingTop: SAFE_PAD_TOP, display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', minHeight: 300 }}>
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
                            // 防御：只把结果应用到产生它的角色
                            if (pendingPersonalityCharId && pendingPersonalityCharId !== char.id) {
                                setPendingPersonality(null);
                                setPendingPersonalityCharId(null);
                                return;
                            }
                            updateCharacter(char.id, {
                                personalityStyle: pendingPersonality.style,
                                ruminationTendency: pendingPersonality.ruminationTendency,
                            } as any);
                            // 标记已定过人格，之后永不自动重测
                            try { localStorage.setItem(`mp_personality_tried_${char.id}`, '1'); } catch {}
                            setPendingPersonality(null);
                            setPendingPersonalityCharId(null);
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
                            // 防御：只把跳过写到产生结果的角色
                            if (pendingPersonalityCharId && pendingPersonalityCharId !== char.id) {
                                setPendingPersonality(null);
                                setPendingPersonalityCharId(null);
                                return;
                            }
                            // 用默认值，让用户后续在认知参数里改
                            updateCharacter(char.id, {
                                personalityStyle: 'emotional',
                                ruminationTendency: 0.3,
                            } as any);
                            try { localStorage.setItem(`mp_personality_tried_${char.id}`, '1'); } catch {}
                            setPendingPersonality(null);
                            setPendingPersonalityCharId(null);
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
            <div style={{ paddingLeft: 16, paddingRight: 16, paddingBottom: 16, paddingTop: SAFE_PAD_TOP, maxHeight: '100%', overflowY: 'auto' }}>
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

                {/* 远程向量存储（Supabase，可选）— 默认折叠 */}
                <details style={{ marginTop: 16, background: '#faf5ff', borderRadius: 16, padding: 16, border: '1px solid #e9d5ff' }}>
                    <summary style={{ cursor: 'pointer', userSelect: 'none', display: 'flex', alignItems: 'center', gap: 8 }}>
                        <span style={{ fontSize: 12, fontWeight: 700, color: '#7c3aed' }}>☁️ 远程向量存储（可选 / Supabase）</span>
                        {remoteVectorConfig.enabled && (
                            <span style={{
                                fontSize: 9, fontWeight: 700, padding: '2px 6px', borderRadius: 4,
                                color: remoteVectorConfig.initialized ? '#15803d' : '#92400e',
                                background: remoteVectorConfig.initialized ? '#dcfce7' : '#fef3c7',
                            }}>
                                {remoteVectorConfig.initialized ? '已连接' : '待初始化'}
                            </span>
                        )}
                    </summary>

                    {/* 什么时候考虑用 */}
                    <div style={{
                        marginTop: 12, padding: 12, borderRadius: 12,
                        background: '#fffbeb', border: '1px solid #fde68a',
                        fontSize: 11, color: '#78350f', lineHeight: 1.7,
                    }}>
                        <div style={{ fontWeight: 700, marginBottom: 4 }}>什么时候考虑搞这个？</div>
                        当你觉得<b>向量搜索变卡</b>的时候（一般要到 2–3 万条记忆以上才会有感觉）。
                        万条以内本地完全跑得动，<b>不用折腾</b>。
                        <div style={{ marginTop: 8, padding: 8, borderRadius: 8, background: '#fef2f2', border: '1px solid #fecaca', color: '#991b1b' }}>
                            ⚠️ <b>开了远程 ≠ 数据万事大吉。</b>
                            目前是双写模式（本地也会存一份，不是挪到云上），
                            Supabase 免费版也不保证永久可用。
                            <b>该导出备份还是要导出备份</b>，别指望一开了就高枕无忧。
                        </div>
                    </div>

                    {/* 图文教程 */}
                    <a href="https://www.kdocs.cn/l/ctifnJA5VGA3" target="_blank" rel="noopener noreferrer"
                        style={{
                            display: 'block', marginTop: 10, padding: '10px 12px', borderRadius: 12,
                            background: 'white', border: '1px dashed #c4b5fd', color: '#7c3aed',
                            fontSize: 11, fontWeight: 600, textDecoration: 'none', textAlign: 'center',
                        }}
                    >
                        📖 查看详细图文教程（金山文档）→
                    </a>

                    {/* 3 步操作提示 */}
                    <div style={{ marginTop: 12, padding: 12, borderRadius: 12, background: '#f5f3ff', fontSize: 11, color: '#5b21b6', lineHeight: 1.8 }}>
                        <b>3 步搞定：</b><br/>
                        1. 注册 Supabase（GitHub 一键登录，见上方教程）<br/>
                        2. 在 Supabase SQL Editor 里运行下方初始化 SQL<br/>
                        3. 填入 Project URL 和 anon key，点测试连接
                        <a href="https://supabase.com/dashboard" target="_blank" rel="noopener noreferrer"
                            style={{
                                marginTop: 8, display: 'inline-block', padding: '6px 12px', borderRadius: 8,
                                background: '#7c3aed', color: 'white', fontSize: 11, fontWeight: 700, textDecoration: 'none',
                            }}>
                            前往 Supabase →
                        </a>
                    </div>

                    {/* 初始化 SQL */}
                    <div style={{ marginTop: 12 }}>
                        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 6 }}>
                            <span style={{ fontSize: 11, color: '#6b7280', fontWeight: 600 }}>初始化 SQL</span>
                            <div style={{ display: 'flex', gap: 8 }}>
                                <button onClick={() => setShowInitSQL(!showInitSQL)} style={{
                                    fontSize: 10, color: '#7c3aed', fontWeight: 600, background: 'none', border: 'none', cursor: 'pointer',
                                }}>
                                    {showInitSQL ? '收起' : '查看'}
                                </button>
                                <button onClick={handleCopyInitSQL} style={{
                                    fontSize: 10, color: 'white', fontWeight: 700, background: '#7c3aed',
                                    border: 'none', borderRadius: 6, padding: '3px 10px', cursor: 'pointer',
                                }}>
                                    复制
                                </button>
                            </div>
                        </div>
                        {showInitSQL && (
                            <pre style={{
                                background: '#0f172a', color: '#86efac', fontSize: 9, padding: 12, borderRadius: 10,
                                overflow: 'auto', maxHeight: 200, lineHeight: 1.6, whiteSpace: 'pre-wrap',
                            }}>{`create extension if not exists vector;
create table if not exists memory_vectors (
  memory_id text primary key, char_id text not null,
  content text not null default '', vector vector(1024),
  dimensions int default 1024, model text, room text,
  importance int default 5, tags text[] default '{}',
  mood text default '',
  created_at bigint default (extract(epoch from now()) * 1000)::bigint,
  last_accessed_at bigint default 0,
  access_count int default 0
);
-- 完整 SQL 请点"复制"按钮获取`}</pre>
                        )}
                        <div style={{ fontSize: 10, color: '#9ca3af', marginTop: 4 }}>复制此 SQL → Supabase Dashboard → SQL Editor → 运行</div>
                    </div>

                    {/* Project URL & anon key */}
                    <div style={{ marginTop: 12 }}>
                        <label className={labelClass}>PROJECT URL</label>
                        <input type="url" value={rvUrl} onChange={e => setRvUrl(e.target.value)}
                            placeholder="https://xxxxx.supabase.co" className={inputClass} />
                        <div style={{ fontSize: 10, color: '#9ca3af', marginTop: 2, paddingLeft: 4 }}>Settings → API → Project URL</div>
                    </div>
                    <div style={{ marginTop: 10 }}>
                        <label className={labelClass}>ANON / PUBLIC KEY</label>
                        <input type="password" value={rvKey} onChange={e => setRvKey(e.target.value)}
                            placeholder="eyJhbGciOiJIUzI1NiIs..." className={inputClass} />
                        <div style={{ fontSize: 10, color: '#9ca3af', marginTop: 2, paddingLeft: 4 }}>Settings → API → anon public key</div>
                    </div>

                    {/* 测试 + 保存 */}
                    <button onClick={handleTestRemoteVector} disabled={rvTesting || !rvUrl || !rvKey}
                        style={{
                            width: '100%', marginTop: 12, padding: '10px 0', borderRadius: 12,
                            border: '1px solid #e5e7eb', fontWeight: 600, fontSize: 12,
                            color: '#475569', background: 'white',
                            cursor: (rvTesting || !rvUrl || !rvKey) ? 'not-allowed' : 'pointer',
                            opacity: (rvTesting || !rvUrl || !rvKey) ? 0.5 : 1,
                        }}
                    >
                        {rvTesting ? '测试中...' : '🧪 测试连接'}
                    </button>
                    {rvTestResult && (
                        <div style={{
                            marginTop: 8, fontSize: 11, textAlign: 'center', fontWeight: 600,
                            color: rvTestResult.startsWith('✓') ? '#16a34a' : rvTestResult.startsWith('⚠') ? '#d97706' : '#dc2626',
                        }}>{rvTestResult}</div>
                    )}
                    <button onClick={handleSaveRemoteVector} disabled={!rvUrl || !rvKey}
                        style={{
                            width: '100%', marginTop: 8, padding: '10px 0', borderRadius: 12,
                            border: 'none', fontWeight: 700, fontSize: 13, color: 'white',
                            background: (!rvUrl || !rvKey) ? '#cbd5e1' : '#7c3aed',
                            cursor: (!rvUrl || !rvKey) ? 'not-allowed' : 'pointer',
                        }}
                    >
                        保存配置
                    </button>

                    {/* 已启用后的操作 */}
                    {remoteVectorConfig.enabled && remoteVectorConfig.initialized && (
                        <button onClick={handleSyncToRemote} disabled={rvSyncing}
                            style={{
                                width: '100%', marginTop: 8, padding: '10px 0', borderRadius: 12,
                                border: '1px solid #e9d5ff', fontWeight: 600, fontSize: 12,
                                color: '#7c3aed', background: 'white',
                                cursor: rvSyncing ? 'not-allowed' : 'pointer',
                                opacity: rvSyncing ? 0.5 : 1,
                            }}
                        >
                            {rvSyncing ? '同步中...' : '🔄 同步本地向量到远程'}
                        </button>
                    )}
                    {remoteVectorConfig.enabled && (
                        <button onClick={handleDisableRemoteVector}
                            style={{
                                width: '100%', marginTop: 8, padding: '8px 0',
                                border: 'none', background: 'none',
                                fontSize: 11, color: '#ef4444', fontWeight: 600, cursor: 'pointer',
                            }}
                        >
                            关闭远程存储
                        </button>
                    )}
                </details>

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

                {/* 危险区：一键清空 */}
                <div style={{ marginTop: 16, background: '#fef2f2', borderRadius: 16, padding: 16, border: '2px solid #fca5a5' }}>
                    <div style={{ fontSize: 12, fontWeight: 800, color: '#991b1b', marginBottom: 6 }}>
                        ⚠️ 危险区：一键清空向量记忆
                    </div>
                    <div style={{ fontSize: 11, color: '#7f1d1d', marginBottom: 12, lineHeight: 1.7 }}>
                        清空【所有角色】的记忆节点、向量、关联、事件盒、便利贴、期盼、高水位标记。
                        可选择同时清空云端 Supabase <code>memory_vectors</code> 全表。
                        <b> 此操作不可撤销。</b>
                    </div>

                    {wipeResult && (
                        <div style={{
                            fontSize: 12, marginBottom: 10,
                            color: wipeResult.startsWith('❌') ? '#dc2626' : '#166534',
                        }}>
                            {wipeResult}
                        </div>
                    )}

                    <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
                        <button
                            onClick={() => handleWipeAll(false)}
                            disabled={wiping}
                            style={{
                                width: '100%', padding: '10px 0', borderRadius: 12,
                                border: '1px solid #fecaca', fontWeight: 700, fontSize: 13,
                                color: '#b91c1c', background: 'white',
                                cursor: wiping ? 'not-allowed' : 'pointer',
                            }}
                        >
                            {wiping ? '清空中…' : '🗑️ 仅清空本地'}
                        </button>
                        <button
                            onClick={() => handleWipeAll(true)}
                            disabled={wiping || !remoteVectorConfig?.enabled || !remoteVectorConfig?.initialized}
                            title={
                                !remoteVectorConfig?.enabled ? '未启用云端向量存储'
                                : !remoteVectorConfig?.initialized ? '云端向量存储未初始化'
                                : undefined
                            }
                            style={{
                                width: '100%', padding: '10px 0', borderRadius: 12,
                                border: 'none', fontWeight: 700, fontSize: 13,
                                color: 'white',
                                background: (wiping || !remoteVectorConfig?.enabled || !remoteVectorConfig?.initialized)
                                    ? '#d4d4d4' : '#dc2626',
                                cursor: (wiping || !remoteVectorConfig?.enabled || !remoteVectorConfig?.initialized)
                                    ? 'not-allowed' : 'pointer',
                            }}
                        >
                            {wiping ? '清空中…' : '💣 清空本地 + 云端 Supabase'}
                        </button>
                    </div>
                </div>
            </div>
        );
    }

    // ─── 宫殿概览视图 ────────────────────────────────

    if (view === 'palace') {
        return (
            <div style={{ paddingLeft: 16, paddingRight: 16, paddingBottom: 16, paddingTop: SAFE_PAD_TOP, maxHeight: '100%', overflowY: 'auto' }}>
                {/* 标题 + 返回 + 设置 */}
                <div style={{ textAlign: 'center', marginBottom: 20, position: 'relative' }}>
                    {/* 返回（到选角界面）按钮 */}
                    <div
                        onClick={() => setView('picker')}
                        style={{
                            position: 'absolute', left: 0, top: 0,
                            fontSize: 13, color: '#6b7280', cursor: 'pointer',
                            padding: '4px 0',
                        }}
                    >
                        ← 返回
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
                        {totalCount} 条记忆 · {boxCount} 个事件盒 · {anticipations.length} 个期盼
                    </div>
                    <div style={{ display: 'flex', justifyContent: 'center', gap: 8, marginTop: 8, flexWrap: 'wrap' }}>
                        <div
                            onClick={openAllMemories}
                            style={{
                                display: 'inline-block',
                                fontSize: 11, fontWeight: 600, color: '#7c3aed',
                                cursor: 'pointer', padding: '4px 12px',
                                borderRadius: 8, border: '1px solid #e9e5ff',
                                background: '#f8f6ff',
                            }}
                        >
                            📋 查看全部记忆
                        </div>
                        <div
                            onClick={openAllBoxes}
                            style={{
                                display: 'inline-block',
                                fontSize: 11, fontWeight: 600, color: '#6366f1',
                                cursor: 'pointer', padding: '4px 12px',
                                borderRadius: 8, border: '1px solid #c7d2fe',
                                background: '#eef2ff',
                            }}
                        >
                            📦 查看事件盒
                        </div>
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
                                            const text = (n.content + ' ' + n.tags.join(' ') + ' ' + n.mood).toLowerCase();
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

                {/* 便利贴置顶 */}
                {pinnedNodes.length > 0 && !globalSearchQuery.trim() && (
                    <div style={{ marginBottom: 16 }}>
                        <div style={{ fontSize: 14, fontWeight: 600, marginBottom: 8 }}>📌 便利贴</div>
                        {pinnedNodes.map(node => {
                            const daysLeft = Math.ceil((node.pinnedUntil! - Date.now()) / (24 * 60 * 60 * 1000));
                            const color = ROOM_COLORS[node.room];
                            return (
                                <div key={node.id} style={{
                                    padding: '10px 12px', borderRadius: 10, marginBottom: 6,
                                    border: '1px solid #fde68a', background: '#fffbeb',
                                    display: 'flex', alignItems: 'flex-start', gap: 8,
                                }}>
                                    <div style={{ flex: 1, cursor: 'pointer' }} onClick={() => openMemory(node, 'all')}>
                                        <div style={{ fontSize: 13, lineHeight: 1.5, color: '#1f2937' }}>
                                            {node.content.length > 80 ? node.content.slice(0, 80) + '...' : node.content}
                                        </div>
                                        <div style={{ fontSize: 10, color: '#92400e', marginTop: 4 }}>
                                            {ROOM_ICONS[node.room]} {getRoomLabel(node.room, userProfile?.name)} · 剩余 {daysLeft} 天
                                        </div>
                                    </div>
                                    <button
                                        onClick={async () => {
                                            const updated = { ...node, pinnedUntil: null };
                                            await MemoryNodeDB.save(updated);
                                            setPinnedNodes(prev => prev.filter(n => n.id !== node.id));
                                        }}
                                        style={{
                                            flexShrink: 0, padding: '4px 8px', borderRadius: 6,
                                            border: '1px solid #fde68a', background: 'white',
                                            fontSize: 10, color: '#92400e', cursor: 'pointer',
                                        }}
                                    >
                                        取消置顶
                                    </button>
                                </div>
                            );
                        })}
                    </div>
                )}

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
            <div style={{ paddingLeft: 16, paddingRight: 16, paddingBottom: 16, paddingTop: SAFE_PAD_TOP, maxHeight: '100%', overflowY: 'auto' }}>
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

    // ─── 事件盒列表视图 ────────────────────────────────

    if (view === 'boxes') {
        return (
            <div style={{ paddingLeft: 16, paddingRight: 16, paddingBottom: 16, paddingTop: SAFE_PAD_TOP, maxHeight: '100%', overflowY: 'auto' }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 12 }}>
                    <div
                        onClick={() => { setView('palace'); }}
                        style={{ fontSize: 13, color: '#6b7280', cursor: 'pointer' }}
                    >
                        ← 返回宫殿
                    </div>
                    <div style={{ fontSize: 12, color: '#9ca3af' }}>{allBoxes.length} 个事件盒</div>
                </div>

                <div style={{ fontSize: 18, fontWeight: 700, marginBottom: 6 }}>📦 事件盒</div>
                <div style={{ fontSize: 11, color: '#9ca3af', marginBottom: 14 }}>
                    按同一事件自动聚合的记忆，点击展开可查看整合回忆、活节点与已归档节点
                </div>

                {allBoxes.length === 0 ? (
                    <div style={{ textAlign: 'center', color: '#9ca3af', padding: 40, fontSize: 13 }}>
                        还没有事件盒 —— 对话中出现关联事件或手动绑定关联时会自动创建
                    </div>
                ) : (
                    allBoxes.map(box => {
                        const expanded = expandedBoxId === box.id;
                        const members = boxMembers[box.id];
                        return (
                            <div
                                key={box.id}
                                style={{
                                    borderRadius: 12, marginBottom: 10,
                                    border: '1px solid #c7d2fe',
                                    background: expanded ? '#f5f7ff' : '#fafbff',
                                    overflow: 'hidden',
                                }}
                            >
                                <div
                                    onClick={() => toggleBoxExpand(box)}
                                    style={{ padding: 12, cursor: 'pointer' }}
                                >
                                    <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                                        <div style={{ fontSize: 14, fontWeight: 700, color: '#3730a3', flex: 1 }}>
                                            📦 {box.name || '未命名'}
                                            {box.sealed && <span style={{ fontSize: 10, marginLeft: 6, padding: '1px 6px', borderRadius: 4, background: '#fef3c7', color: '#92400e' }}>已封盒</span>}
                                        </div>
                                        <div style={{ fontSize: 11, color: '#6366f1' }}>{expanded ? '▲' : '▼'}</div>
                                    </div>
                                    {box.tags.length > 0 && (
                                        <div style={{ marginTop: 6, display: 'flex', gap: 4, flexWrap: 'wrap' }}>
                                            {box.tags.slice(0, 6).map(t => (
                                                <span key={t} style={{
                                                    fontSize: 10, padding: '1px 6px', borderRadius: 4,
                                                    backgroundColor: '#e0e7ff', color: '#4338ca',
                                                }}>{t}</span>
                                            ))}
                                        </div>
                                    )}
                                    <div style={{ fontSize: 10, color: '#6b7280', marginTop: 6, display: 'flex', gap: 10, flexWrap: 'wrap' }}>
                                        <span>活 {box.liveMemoryIds.length}</span>
                                        <span>归档 {box.archivedMemoryIds.length}</span>
                                        {box.compressionCount > 0 && <span>压缩 {box.compressionCount} 次</span>}
                                        <span>更新 {new Date(box.updatedAt).toLocaleDateString('zh-CN')}</span>
                                    </div>
                                </div>

                                {expanded && members && (
                                    <div style={{ padding: '0 12px 12px', borderTop: '1px solid #e0e7ff' }}>
                                        {members.summary && (
                                            <div
                                                onClick={() => openMemory(members.summary!, 'boxes')}
                                                style={{
                                                    marginTop: 10, padding: 10, borderRadius: 8,
                                                    border: '1px solid #fcd34d', background: '#fef3c7',
                                                    cursor: 'pointer',
                                                }}
                                            >
                                                <div style={{ fontSize: 10, color: '#92400e', marginBottom: 4 }}>✨ 整合回忆</div>
                                                <div style={{ fontSize: 12, lineHeight: 1.5, color: '#1f2937' }}>
                                                    {members.summary.content.length > 120 ? members.summary.content.slice(0, 120) + '...' : members.summary.content}
                                                </div>
                                            </div>
                                        )}

                                        {members.live.length > 0 && (
                                            <>
                                                <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginTop: 10, marginBottom: 4 }}>
                                                    <div style={{ fontSize: 10, fontWeight: 600, color: '#6366f1' }}>
                                                        📦 活节点（{members.live.length}）
                                                        {members.live.length >= 15 && (
                                                            <span style={{ marginLeft: 6, fontSize: 9, color: '#b91c1c', fontWeight: 600 }}>
                                                                ⚠️ 压缩可能连续失败
                                                            </span>
                                                        )}
                                                    </div>
                                                    <button
                                                        onClick={(e) => { e.stopPropagation(); handleUnbindAllLive(box); }}
                                                        style={{
                                                            fontSize: 10, padding: '3px 8px', borderRadius: 6,
                                                            border: '1px solid #fecaca', background: '#fef2f2', color: '#b91c1c',
                                                            cursor: 'pointer',
                                                        }}
                                                        title="把所有活节点移出盒子，变回独立记忆（记忆不删）"
                                                    >
                                                        一键移出活节点
                                                    </button>
                                                </div>
                                                {members.live.map(n => (
                                                    <div
                                                        key={n.id}
                                                        onClick={() => openMemory(n, 'boxes')}
                                                        style={{
                                                            padding: 8, borderRadius: 8, marginBottom: 4,
                                                            border: '1px solid #e0e7ff', background: 'white',
                                                            cursor: 'pointer',
                                                        }}
                                                    >
                                                        <div style={{ fontSize: 12, lineHeight: 1.5, color: '#1f2937' }}>
                                                            {n.content.length > 80 ? n.content.slice(0, 80) + '...' : n.content}
                                                        </div>
                                                        <div style={{ fontSize: 10, color: '#9ca3af', marginTop: 3 }}>
                                                            {ROOM_ICONS[n.room]} {getRoomLabel(n.room, userProfile?.name)} · {new Date(n.createdAt).toLocaleDateString('zh-CN')}
                                                        </div>
                                                    </div>
                                                ))}
                                            </>
                                        )}

                                        {members.archived.length > 0 && (
                                            <>
                                                <div style={{ fontSize: 10, fontWeight: 600, color: '#9ca3af', marginTop: 10, marginBottom: 4 }}>
                                                    💤 已归档（{members.archived.length}）
                                                </div>
                                                {members.archived.map(n => (
                                                    <div
                                                        key={n.id}
                                                        onClick={() => openMemory(n, 'boxes')}
                                                        style={{
                                                            padding: 8, borderRadius: 8, marginBottom: 4,
                                                            border: '1px solid #e5e7eb', background: '#f9fafb',
                                                            cursor: 'pointer', opacity: 0.75,
                                                        }}
                                                    >
                                                        <div style={{ fontSize: 12, lineHeight: 1.5, color: '#4b5563' }}>
                                                            {n.content.length > 80 ? n.content.slice(0, 80) + '...' : n.content}
                                                        </div>
                                                        <div style={{ fontSize: 10, color: '#9ca3af', marginTop: 3 }}>
                                                            {ROOM_ICONS[n.room]} {getRoomLabel(n.room, userProfile?.name)} · {new Date(n.createdAt).toLocaleDateString('zh-CN')}
                                                        </div>
                                                    </div>
                                                ))}
                                            </>
                                        )}

                                        {!members.summary && members.live.length === 0 && members.archived.length === 0 && (
                                            <div style={{ fontSize: 11, color: '#c4c4c4', textAlign: 'center', padding: '12px 0' }}>
                                                盒内暂无成员
                                            </div>
                                        )}
                                    </div>
                                )}
                            </div>
                        );
                    })
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
            <div style={{ paddingLeft: 16, paddingRight: 16, paddingBottom: 16, paddingTop: SAFE_PAD_TOP, maxHeight: '100%', overflowY: 'auto' }}>
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
            <div style={{ paddingLeft: 16, paddingRight: 16, paddingBottom: 16, paddingTop: SAFE_PAD_TOP, maxHeight: '100%', overflowY: 'auto' }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 12 }}>
                    <div
                        onClick={() => { setView(prevView); setSelectedNode(null); setEditing(false); }}
                        style={{ fontSize: 13, color: '#6b7280', cursor: 'pointer' }}
                    >
                        ← 返回 {prevView === 'all' ? '全部记忆' : prevView === 'boxes' ? '事件盒' : getRoomLabel(selectedRoom || selectedNode.room, userProfile?.name)}
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
                                {currentBox && <div>事件盒: {currentBox.name || '未命名'}</div>}
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
                                                    .filter(n => n.id !== selectedNode.id && !n.archived && (
                                                        n.content.includes(q.trim()) ||
                                                        n.tags.some(t => t.includes(q.trim()))
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
                                                            // 新版：绑入 EventBox（取代旧的 causal MemoryLink 单边关联）
                                                            const box = await manuallyBindMemories(char!.id, selectedNode.id, node.id);
                                                            if (box) {
                                                                // 重新加载兄弟列表，展示最新 box 状态
                                                                await loadLinkedMemories(selectedNode.id);
                                                            }
                                                        }}
                                                        style={{
                                                            flexShrink: 0, padding: '4px 10px', borderRadius: 6,
                                                            border: 'none', fontSize: 10, fontWeight: 600,
                                                            color: 'white', background: alreadyLinked ? '#d4d4d4' : '#6366f1',
                                                            cursor: alreadyLinked ? 'not-allowed' : 'pointer',
                                                        }}
                                                    >
                                                        {alreadyLinked ? '已关联' : '绑入事件盒'}
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

                                {currentBox && (
                                    <div style={{
                                        padding: '8px 10px', borderRadius: 8, marginBottom: 8,
                                        border: '1px solid #c7d2fe', background: '#eef2ff',
                                        fontSize: 11, lineHeight: 1.5, color: '#3730a3',
                                    }}>
                                        📦 事件盒：<b>{currentBox.name || '未命名'}</b>
                                        {currentBox.tags.length > 0 && (
                                            <span style={{ color: '#6366f1', fontSize: 10 }}> 〈{currentBox.tags.slice(0, 4).join(' · ')}〉</span>
                                        )}
                                        <span style={{ color: '#6b7280', fontSize: 10 }}>
                                            {' '}· 活 {currentBox.liveMemoryIds.length} 归档 {currentBox.archivedMemoryIds.length}
                                            {currentBox.compressionCount > 0 && ` · 压缩过 ${currentBox.compressionCount} 次`}
                                        </span>
                                    </div>
                                )}

                                {linkedMemories.map(({ id, relation, node: linkedNode }) => {
                                    const isSummary = relation === 'box_summary';
                                    const isArchived = relation === 'box_archived';
                                    const isLegacy = relation === 'legacy_causal';
                                    const bg = isSummary ? '#fef3c7' : isArchived ? '#f5f5f5' : '#f5f3ff';
                                    const border = isSummary ? '#fcd34d' : isArchived ? '#e5e7eb' : '#e0e7ff';
                                    const relationLabel = isSummary ? '✨ 整合回忆'
                                        : isArchived ? '💤 已归档'
                                        : isLegacy ? '🔗 旧关联'
                                        : '📦 同盒活节点';
                                    return (
                                        <div key={id} style={{
                                            padding: '10px 12px', borderRadius: 10, marginBottom: 6,
                                            border: `1px solid ${border}`, background: bg,
                                            display: 'flex', alignItems: 'flex-start', gap: 8,
                                            opacity: isArchived ? 0.75 : 1,
                                        }}>
                                            <div style={{ flex: 1, cursor: 'pointer' }} onClick={() => openMemory(linkedNode, prevView)}>
                                                <div style={{ fontSize: 10, color: '#6b7280', marginBottom: 4 }}>
                                                    {relationLabel}
                                                </div>
                                                <div style={{ fontSize: 12, lineHeight: 1.5, color: '#1f2937' }}>
                                                    {linkedNode.content.length > 80 ? linkedNode.content.slice(0, 80) + '...' : linkedNode.content}
                                                </div>
                                                <div style={{ fontSize: 10, color: '#9ca3af', marginTop: 4 }}>
                                                    {ROOM_ICONS[linkedNode.room]} {getRoomLabel(linkedNode.room, userProfile?.name)} · {new Date(linkedNode.createdAt).toLocaleDateString('zh-CN')}
                                                </div>
                                            </div>
                                            <button
                                                onClick={async () => {
                                                    if (isLegacy) {
                                                        // 遗留 causal link 删除
                                                        if (confirm('解除这条旧关联？（不会删除记忆本身）')) {
                                                            await MemoryLinkDB.delete(id);
                                                            setLinkedMemories(prev => prev.filter(l => l.id !== id));
                                                        }
                                                    } else if (isSummary) {
                                                        alert('整合回忆是事件盒的压缩产物，不能单独解除；若要重建请删除事件盒所有成员。');
                                                    } else {
                                                        if (confirm('把这条记忆移出事件盒？（记忆本身不删，会回到"地上"作为独立记忆）')) {
                                                            await removeMemoryFromBox(linkedNode.id);
                                                            await loadLinkedMemories(selectedNode!.id);
                                                        }
                                                    }
                                                }}
                                                style={{
                                                    flexShrink: 0, padding: '4px 8px', borderRadius: 6,
                                                    border: '1px solid #e5e7eb', background: 'white',
                                                    fontSize: 10, color: '#9ca3af', cursor: 'pointer',
                                                }}
                                            >
                                                {isSummary ? '查看' : '移出'}
                                            </button>
                                        </div>
                                    );
                                })}

                                {!loadingLinks && linkedMemories.length === 0 && !showLinkSearch && (
                                    <div style={{ fontSize: 11, color: '#c4c4c4', textAlign: 'center', padding: '8px 0' }}>
                                        暂无事件盒关联
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
