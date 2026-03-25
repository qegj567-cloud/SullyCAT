/**
 * Memory Palace (记忆宫殿) — 统一导出
 */

// 类型
export type {
    MemoryRoom, RoomConfig, MemoryNode, MemoryVector,
    LinkType, MemoryLink, BoxStatus, TopicBox, TopicContinuity,
    AnticipationStatus, Anticipation, MemoryBatch,
    PersonalityStyle, EmbeddingConfig, ScoredMemory,
} from './types';

export { ROOM_CONFIGS, ROOM_LABELS, PERSONALITY_WEIGHTS } from './types';

// 数据库
export { MemoryNodeDB, MemoryVectorDB, MemoryLinkDB, MemoryBatchDB, TopicBoxDB, AnticipationDB } from './db';

// Embedding
export { getEmbedding, getEmbeddings, cosineSimilarity } from './embedding';

// 输入管线
export { TopicLoomManager, judgeTopicContinuity, extractBoxMetadata } from './topicLoom';
export { extractMemories } from './extraction';
export { vectorizeAndStore } from './vectorStore';

// 认知过程
export { runConsolidation, calculateEffectiveImportance, shouldPromote } from './consolidation';
export { buildLinks, strengthenCoActivated } from './links';

// 输出管线
export { vectorSearch } from './vectorSearch';
export { bm25Search, tokenize } from './bm25';
export { hybridSearch } from './hybridSearch';
export { spreadActivation } from './activation';
export { applyPriming, checkRumination } from './priming';
export { expandAndFormat } from './formatter';

// 集成
export { retrieveMemories, processNewMessages } from './pipeline';

// 期盼
export {
    processAnticipationLifecycle, fulfillAnticipation,
    disappointAnticipation, createAnticipation,
} from './anticipation';
