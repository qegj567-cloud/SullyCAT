import React, { useState, useEffect, useCallback } from 'react';
import { useOS } from '../context/OSContext';
import {
    MemoryRoom, MemoryNode, ROOM_CONFIGS, ROOM_LABELS,
    MemoryNodeDB, TopicBoxDB, AnticipationDB, MemoryLinkDB,
    migrateOldMemories, runCognitiveDigestion,
} from '../utils/memoryPalace';
import type { Anticipation, MigrationProgress, DigestResult } from '../utils/memoryPalace';

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
    const { activeCharacterId, characters, updateCharacter, setActiveCharacterId } = useOS();
    const char = characters.find(c => c.id === activeCharacterId);

    const [view, setView] = useState<'palace' | 'room' | 'memory' | 'settings'>('palace');
    const [selectedRoom, setSelectedRoom] = useState<MemoryRoom | null>(null);
    const [selectedNode, setSelectedNode] = useState<MemoryNode | null>(null);
    const [roomCounts, setRoomCounts] = useState<Record<MemoryRoom, number>>({} as any);
    const [showCharPicker, setShowCharPicker] = useState(false);
    const [roomNodes, setRoomNodes] = useState<MemoryNode[]>([]);
    const [totalCount, setTotalCount] = useState(0);
    const [linkCount, setLinkCount] = useState(0);
    const [boxCount, setBoxCount] = useState(0);
    const [anticipations, setAnticipations] = useState<Anticipation[]>([]);

    // 迁移状态
    const [migrating, setMigrating] = useState(false);
    const [migrationProgress, setMigrationProgress] = useState<MigrationProgress | null>(null);
    const [migrationResult, setMigrationResult] = useState<string | null>(null);

    // 认知消化状态
    const [digesting, setDigesting] = useState(false);
    const [digestResult, setDigestResult] = useState<string | null>(null);

    // Embedding 配置本地状态
    const [embUrl, setEmbUrl] = useState('');
    const [embKey, setEmbKey] = useState('');
    const [embModel, setEmbModel] = useState('text-embedding-3-small');
    const [embDimensions, setEmbDimensions] = useState(1024);
    const [configSaved, setConfigSaved] = useState(false);

    // 初始化 embedding 配置
    useEffect(() => {
        if (char?.embeddingConfig) {
            setEmbUrl(char.embeddingConfig.baseUrl || '');
            setEmbKey(char.embeddingConfig.apiKey || '');
            setEmbModel(char.embeddingConfig.model || 'text-embedding-3-small');
            setEmbDimensions(char.embeddingConfig.dimensions || 1024);
        }
    }, [char?.id, char?.embeddingConfig]);

    // 判断是否已配置 embedding
    const hasEmbeddingConfig = !!(char?.embeddingConfig?.baseUrl && char?.embeddingConfig?.apiKey);

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
        const oldRefined = char.refinedMemories;
        if (oldMemories.length === 0 && (!oldRefined || Object.keys(oldRefined).length === 0)) {
            setMigrationResult('没有旧记忆可以迁移');
            return;
        }

        setMigrating(true);
        setMigrationResult(null);

        try {
            // 尝试用 emotionConfig.api 作为轻量 LLM
            const lightApi = (char as any).emotionConfig?.api || null;

            const result = await migrateOldMemories(
                char.id,
                oldMemories,
                oldRefined,
                lightApi,
                emb,
                (p) => setMigrationProgress(p),
            );
            setMigrationResult(`✅ 迁移完成：${result.migrated} 条导入，${result.skipped} 条去重跳过`);
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
            <div style={{ padding: 24, textAlign: 'center', color: '#9ca3af' }}>
                <div style={{ fontSize: 48, marginBottom: 16 }}>🏰</div>
                <div style={{ fontSize: 16, fontWeight: 600, marginBottom: 8 }}>记忆宫殿</div>
                <div style={{ fontSize: 13, marginBottom: 20 }}>
                    {char.name} 尚未开启记忆宫殿功能
                </div>
                <div style={{ fontSize: 12, color: '#6b7280' }}>
                    请在「神经链接 → 角色设置 → 设定」中开启
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

                <div style={{ background: '#f8f7ff', borderRadius: 16, padding: 16, border: '1px solid #e9e5ff' }}>
                    <div style={{ fontSize: 12, fontWeight: 700, color: '#7c3aed', marginBottom: 12 }}>
                        🔗 Embedding API（OpenAI 兼容格式）
                    </div>
                    <div style={{ fontSize: 11, color: '#6b7280', marginBottom: 16, lineHeight: 1.6 }}>
                        支持 OpenAI / 硅基流动 / 阿里云 / 字节跳动等提供的 Embedding 端点。
                        需要一个独立于聊天 API 的 Embedding 接口地址和密钥。
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

                {/* 迁移旧记忆 */}
                <div style={{ marginTop: 16, background: '#fefce8', borderRadius: 16, padding: 16, border: '1px solid #fde68a' }}>
                    <div style={{ fontSize: 12, fontWeight: 700, color: '#92400e', marginBottom: 8 }}>
                        📦 导入旧记忆
                    </div>
                    <div style={{ fontSize: 11, color: '#78716c', marginBottom: 12, lineHeight: 1.6 }}>
                        将旧的日度记忆 ({char.memories?.length || 0} 条) 和月度总结 ({Object.keys(char.refinedMemories || {}).length} 条)
                        迁移到记忆宫殿。旧数据不会被删除。
                    </div>

                    {migrationProgress && (
                        <div style={{ fontSize: 11, color: '#92400e', marginBottom: 8 }}>
                            {migrationProgress.phase === 'classifying' && `🏷️ 分类中... ${migrationProgress.current}/${migrationProgress.total}`}
                            {migrationProgress.phase === 'creating' && `📝 创建节点... ${migrationProgress.current}/${migrationProgress.total}`}
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
                {/* 标题 + 设置按钮 */}
                <div style={{ textAlign: 'center', marginBottom: 20, position: 'relative' }}>
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
                <div
                    onClick={() => { setView('palace'); setSelectedRoom(null); }}
                    style={{ fontSize: 13, color: '#6b7280', cursor: 'pointer', marginBottom: 12 }}
                >
                    ← 返回宫殿
                </div>

                <div style={{ marginBottom: 16 }}>
                    <span style={{ fontSize: 28 }}>{roomIcon}</span>
                    <span style={{ fontSize: 18, fontWeight: 700, color: roomColor, marginLeft: 8 }}>{roomLabel}</span>
                    <span style={{ fontSize: 12, color: '#9ca3af', marginLeft: 8 }}>{roomNodes.length} 条记忆</span>
                </div>

                {roomNodes.length === 0 ? (
                    <div style={{ textAlign: 'center', color: '#9ca3af', padding: 40, fontSize: 13 }}>
                        这个房间还是空的
                    </div>
                ) : (
                    roomNodes.map((node: MemoryNode) => (
                        <div
                            key={node.id}
                            onClick={() => openMemory(node)}
                            style={{
                                padding: 12, borderRadius: 10, marginBottom: 8,
                                border: '1px solid #e5e7eb', cursor: 'pointer',
                                backgroundColor: '#fafafa',
                            }}
                        >
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
                </div>
            </div>
        );
    }

    return null;
}
