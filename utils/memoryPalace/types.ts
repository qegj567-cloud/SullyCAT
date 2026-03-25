/**
 * Memory Palace (记忆宫殿) — 类型定义
 *
 * 模拟人脑七个脑区的记忆系统。
 * 所有类型定义集中在此文件，供其他模块导入。
 */

// ─── 七个房间 ─────────────────────────────────────────

export type MemoryRoom =
    | 'living_room'   // 客厅 — 日常闲聊、近期互动（海马体）
    | 'bedroom'       // 卧室 — 亲密情感、深层羁绊（新皮层）
    | 'study'         // 书房 — 工作学习、技能成长（前额叶）
    | 'user_room'     // 用户房间 — 用户个人信息、习惯（颞顶联合区）
    | 'self_room'     // 自我房间 — 角色自我认同、演变（默认模式网络）
    | 'attic'         // 阁楼 — 未消化的困惑、潜意识（杏仁核–海马体）
    | 'windowsill';   // 窗台 — 期盼、目标、憧憬（多巴胺奖赏系统）

export interface RoomConfig {
    capacity: number | null;    // null = 无限
    decayRate: number | null;   // null = 永不遗忘，数值为每小时衰减基数
    description: string;
}

export const ROOM_CONFIGS: Record<MemoryRoom, RoomConfig> = {
    living_room: { capacity: 200,  decayRate: 0.9972, description: '日常闲聊、近期互动' },
    bedroom:     { capacity: null, decayRate: 0.9995, description: '亲密情感、深层羁绊' },
    study:       { capacity: null, decayRate: 0.9995, description: '工作学习、技能成长' },
    user_room:   { capacity: null, decayRate: 0.9995, description: '用户个人信息、习惯' },
    self_room:   { capacity: null, decayRate: null,   description: '角色自我认同、演变' },
    attic:       { capacity: null, decayRate: null,   description: '未消化的困惑、潜意识' },
    windowsill:  { capacity: null, decayRate: null,   description: '期盼、目标、憧憬' },
};

export const ROOM_LABELS: Record<MemoryRoom, string> = {
    living_room: '客厅',
    bedroom:     '卧室',
    study:       '书房',
    user_room:   '用户房间',
    self_room:   '自我房间',
    attic:       '阁楼',
    windowsill:  '窗台',
};

// ─── 记忆节点 ─────────────────────────────────────────

export interface MemoryNode {
    id: string;
    charId: string;
    content: string;            // 第三人称叙事
    room: MemoryRoom;
    tags: string[];
    importance: number;         // 1–10
    mood: string;               // 情绪标签，如 'happy', 'sad', 'angry'
    embedded: boolean;          // 是否已向量化
    boxId: string;              // 来源话题盒 ID
    boxTopic: string;           // 话题摘要
    createdAt: number;          // timestamp ms
    lastAccessedAt: number;     // timestamp ms
    accessCount: number;
}

// ─── 向量存储 ─────────────────────────────────────────

export interface MemoryVector {
    memoryId: string;           // 关联 MemoryNode.id
    vector: number[];           // float32 数组，默认 1024 维
    dimensions: number;
}

// ─── 关联网络 ─────────────────────────────────────────

export type LinkType =
    | 'temporal'    // 时间关联 — 24h 内创建的记忆
    | 'emotional'   // 情感关联 — 相同情绪标签
    | 'causal'      // 因果关联
    | 'person'      // 人物关联 — 提到同一人
    | 'metaphor';   // 隐喻关联

export interface MemoryLink {
    id: string;
    sourceId: string;           // MemoryNode.id
    targetId: string;           // MemoryNode.id
    type: LinkType;
    strength: number;           // 0–1，共同激活时 +0.05
}

// ─── 话题盒 ─────────────────────────────────────────

export type BoxStatus = 'open' | 'sealed';

export interface TopicBox {
    id: string;
    charId: string;
    messageIds: number[];       // Message.id 数组
    status: BoxStatus;
    topic: string;              // 话题摘要（封盒时 LLM 提取）
    events: string[];           // 关键事件列表
    keywords: string[];         // 关键词
    createdAt: number;
    sealedAt: number | null;
}

/** Topic Loom 判断结果 */
export type TopicContinuity = 'continuous' | 'partial_shift' | 'discontinuous';

// ─── 期盼（窗台） ─────────────────────────────────────

export type AnticipationStatus = 'active' | 'anchor' | 'fulfilled' | 'disappointed';

export interface Anticipation {
    id: string;
    charId: string;
    content: string;
    status: AnticipationStatus;
    createdAt: number;
    anchoredAt: number | null;  // active → anchor 的时间
    resolvedAt: number | null;  // fulfilled / disappointed 的时间
}

// ─── 处理批次日志 ─────────────────────────────────────

export interface MemoryBatch {
    id: string;
    charId: string;
    boxId: string;
    status: 'pending' | 'processing' | 'done' | 'error';
    nodesCreated: number;
    error: string | null;
    createdAt: number;
    completedAt: number | null;
}

// ─── 人格风格（影响扩散激活权重） ─────────────────────

export type PersonalityStyle = 'emotional' | 'narrative' | 'imagery' | 'analytical';

/** 每种人格风格对五种关联类型的权重 */
export const PERSONALITY_WEIGHTS: Record<PersonalityStyle, Record<LinkType, number>> = {
    emotional:  { emotional: 1.0, person: 0.6, metaphor: 0.5, temporal: 0.3, causal: 0.2 },
    narrative:  { temporal: 1.0, person: 0.8, causal: 0.4, emotional: 0.3, metaphor: 0.2 },
    imagery:    { metaphor: 1.0, emotional: 0.5, temporal: 0.3, person: 0.3, causal: 0.2 },
    analytical: { causal: 1.0, temporal: 0.4, person: 0.3, emotional: 0.2, metaphor: 0.2 },
};

// ─── Embedding 配置（独立于聊天 API） ─────────────────

export interface EmbeddingConfig {
    baseUrl: string;            // OpenAI 兼容端点，如 https://api.siliconflow.cn/v1
    apiKey: string;
    model: string;              // 默认 text-embedding-3-small
    dimensions: number;         // 默认 1024
}

// ─── 检索结果 ─────────────────────────────────────────

export interface ScoredMemory {
    node: MemoryNode;
    finalScore: number;
    similarity: number;         // 向量余弦相似度
    bm25Score: number;          // BM25 分数
    roomScore: number;          // 房间评分后的最终分
}
