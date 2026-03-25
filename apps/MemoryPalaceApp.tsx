import React, { useState, useEffect, useCallback } from 'react';
import { useOS } from '../context/OSContext';
import {
    MemoryRoom, MemoryNode, ROOM_CONFIGS, ROOM_LABELS,
    MemoryNodeDB, TopicBoxDB, AnticipationDB, MemoryLinkDB,
} from '../utils/memoryPalace';
import type { Anticipation, TopicBox } from '../utils/memoryPalace';

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

// ─── 主组件 ───────────────────────────────────────────

export default function MemoryPalaceApp() {
    const { selectedCharId, characters } = useOS();
    const char = characters.find(c => c.id === selectedCharId);

    const [view, setView] = useState<'palace' | 'room' | 'memory' | 'stats'>('palace');
    const [selectedRoom, setSelectedRoom] = useState<MemoryRoom | null>(null);
    const [selectedNode, setSelectedNode] = useState<MemoryNode | null>(null);
    const [roomCounts, setRoomCounts] = useState<Record<MemoryRoom, number>>({} as any);
    const [roomNodes, setRoomNodes] = useState<MemoryNode[]>([]);
    const [totalCount, setTotalCount] = useState(0);
    const [linkCount, setLinkCount] = useState(0);
    const [boxCount, setBoxCount] = useState(0);
    const [anticipations, setAnticipations] = useState<Anticipation[]>([]);

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

        // 粗略估算链接数
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
        nodes.sort((a, b) => b.createdAt - a.createdAt);
        setRoomNodes(nodes);
        setSelectedRoom(room);
        setView('room');
    };

    const openMemory = (node: MemoryNode) => {
        setSelectedNode(node);
        setView('memory');
    };

    if (!char) {
        return (
            <div style={{ padding: 24, textAlign: 'center', color: '#9ca3af' }}>
                请先选择一个角色
            </div>
        );
    }

    if (!char.memoryPalaceEnabled) {
        return (
            <div style={{ padding: 24, textAlign: 'center', color: '#9ca3af' }}>
                <div style={{ fontSize: 48, marginBottom: 16 }}>🏰</div>
                <div style={{ fontSize: 16, fontWeight: 600, marginBottom: 8 }}>记忆宫殿</div>
                <div style={{ fontSize: 13, marginBottom: 20 }}>
                    {char.name} 尚未开启记忆宫殿功能
                </div>
                <div style={{ fontSize: 12, color: '#6b7280' }}>
                    请在「神经链接 → 角色设置」中开启
                </div>
            </div>
        );
    }

    // ─── 宫殿概览视图 ────────────────────────────────

    if (view === 'palace') {
        return (
            <div style={{ padding: 16, maxHeight: '100%', overflowY: 'auto' }}>
                {/* 标题 */}
                <div style={{ textAlign: 'center', marginBottom: 20 }}>
                    <div style={{ fontSize: 28, marginBottom: 4 }}>🏰</div>
                    <div style={{ fontSize: 18, fontWeight: 700 }}>{char.name} 的记忆宫殿</div>
                    <div style={{ fontSize: 12, color: '#9ca3af', marginTop: 4 }}>
                        {totalCount} 条记忆 · {boxCount} 个话题盒 · {anticipations.length} 个期盼
                    </div>
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
                        {anticipations.map(ant => (
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
                    roomNodes.map(node => (
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
                                    {node.tags.map(t => (
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
                            {selectedNode.tags.map(t => (
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
