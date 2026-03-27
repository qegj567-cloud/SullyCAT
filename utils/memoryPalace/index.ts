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
export { extractMemories, extractMemoriesFromBuffer } from './extraction';
export { vectorizeAndStore, checkModelConsistency, rebuildAllVectors } from './vectorStore';

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
export type { LightLLMConfig } from './pipeline';
export { retrieveMemories, injectMemoryPalace, processNewMessages, getMemoryPalaceHighWaterMark } from './pipeline';

// 期盼
export {
    processAnticipationLifecycle, fulfillAnticipation,
    disappointAnticipation, createAnticipation,
} from './anticipation';

// 认知消化
export { runCognitiveDigestion } from './digestion';
export type { DigestResult } from './digestion';

// 迁移
export { migrateOldMemories, getAvailableMonths } from './migration';
export type { MigrationProgress } from './migration';
