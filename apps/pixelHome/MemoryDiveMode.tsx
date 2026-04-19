/**
 * Memory Dive (记忆潜行) — 交互式 RPG 探索组件
 *
 * 用户在像素小屋中以 RPG 形式探索角色的记忆宫殿。
 * 两种模式：角色引领 / 自由探索
 * 退出后角色不记得，用户获得临时 buff。
 */

import React, { useState, useCallback, useEffect, useRef, useMemo } from 'react';
import type { MemoryRoom, RemoteVectorConfig } from '../../utils/memoryPalace/types';
import type { APIConfig, CharacterProfile, UserProfile } from '../../types';
import type { PixelHomeState, PixelAsset } from './types';
import { decodeColorField } from './types';
import type {
  DiveMode, DivePhase, DiveSession, DiveDialogue,
  DiveChoice, DiveBuffValues, DiveResult, RoomExploreState,
} from './memoryDiveTypes';
import { BUFF_META } from './memoryDiveTypes';
import { ROOM_SLOTS, ROOM_META, ROOM_SIZES } from './roomTemplates';
import { ContextBuilder } from '../../utils/context';
import {
  fetchRoomMemories, fetchSlotMemories, callDiveLLM,
  generateIntroDialogues, generateOutroDialogues,
  createInitialBuffs, applyChoiceBuff, computeDiveResult,
} from './memoryDiveEngine';

interface Props {
  charId: string;
  charName: string;
  /** 完整角色档案，用于构建丰富的 LLM 上下文 */
  charProfile: CharacterProfile;
  /** 用户档案 */
  userProfile: UserProfile;
  charSprite?: string;
  /** 玩家自己的像素小人（可选，没有则用默认） */
  playerSprite?: string;
  userName: string;
  homeState: PixelHomeState;
  assets: PixelAsset[];
  apiConfig: APIConfig;
  /** 远程向量记忆配置（Supabase），本地没有向量时可回退从这里拉 */
  remoteVectorConfig?: RemoteVectorConfig;
  onExit: (result: DiveResult | null) => void;
}

const TILE = 28;
const ROOM_SCALE = 2.2;

// 房间地面样式复用
const FLOOR_STYLES: Record<string, { wallFace: string; floor: string; floorAlt: string }> = {
  living_room: { wallFace: '#e8d5b8', floor: '#c4a882', floorAlt: '#b89b75' },
  bedroom:     { wallFace: '#e8ddd0', floor: '#d4b896', floorAlt: '#c9ab87' },
  study:       { wallFace: '#c9b99a', floor: '#8b6f47', floorAlt: '#7d6340' },
  attic:       { wallFace: '#6b5d50', floor: '#706050', floorAlt: '#655545' },
  self_room:   { wallFace: '#f0d0e0', floor: '#d4a8c0', floorAlt: '#c99db5' },
  user_room:   { wallFace: '#c8e0d0', floor: '#a8c4b0', floorAlt: '#9db9a5' },
  windowsill:  { wallFace: '#a8bfb0', floor: '#92a89c', floorAlt: '#879d91' },
};

// 房间遍历顺序（引导模式）
const GUIDED_ROOM_ORDER: MemoryRoom[] = [
  'living_room', 'bedroom', 'study', 'self_room', 'user_room', 'windowsill', 'attic',
];

const MemoryDiveMode: React.FC<Props> = ({
  charId, charName, charProfile, userProfile, charSprite, playerSprite,
  userName, homeState, assets, apiConfig, remoteVectorConfig, onExit,
}) => {
  // ─── 构建完整角色上下文（包含身份、用户信息、印象、世界观、记忆等） ───
  const fullCharContext = useMemo(() =>
    ContextBuilder.buildCoreContext(charProfile, userProfile, true),
    [charProfile, userProfile],
  );

  // ─── Session State ─────────────────────────────────────
  const [session, setSession] = useState<DiveSession | null>(null);
  const [showModeSelect, setShowModeSelect] = useState(true);
  const [showResult, setShowResult] = useState<DiveResult | null>(null);

  // ─── 玩家移动 ──────────────────────────────────────────
  const [playerMoving, setPlayerMoving] = useState(false);
  const [playerFlip, setPlayerFlip] = useState(false);
  const [playerStep, setPlayerStep] = useState(0);
  const playerTargetRef = useRef<{ x: number; y: number } | null>(null);
  const playerAnimRef = useRef<number | null>(null);

  // ─── UI Refs ───────────────────────────────────────────
  const dialogueEndRef = useRef<HTMLDivElement>(null);
  const roomRef = useRef<HTMLDivElement>(null);
  const isLoadingRef = useRef(false);

  // 自动滚动到最新对话
  useEffect(() => {
    dialogueEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [session?.dialogues.length]);

  // ─── 玩家点击地面移动 ──────────────────────────────────
  const handleRoomClick = useCallback((e: React.MouseEvent<HTMLDivElement>) => {
    if (!session || !roomRef.current) return;
    // 不拦截家具按钮的点击
    if ((e.target as HTMLElement).closest('button')) return;

    const rect = roomRef.current.getBoundingClientRect();
    const xPct = ((e.clientX - rect.left) / rect.width) * 100;
    const yPct = ((e.clientY - rect.top) / rect.height) * 100;

    // 限制在地板区域（y > 28% 墙面高度）
    const clampedY = Math.max(32, Math.min(92, yPct));
    const clampedX = Math.max(8, Math.min(92, xPct));

    playerTargetRef.current = { x: clampedX, y: clampedY };

    // 动画循环：逐步移向目标
    if (playerAnimRef.current) cancelAnimationFrame(playerAnimRef.current);

    const animate = () => {
      const target = playerTargetRef.current;
      if (!target) return;

      setSession(prev => {
        if (!prev) return prev;
        const dx = target.x - prev.playerPos.x;
        const dy = target.y - prev.playerPos.y;
        const dist = Math.sqrt(dx * dx + dy * dy);

        if (dist < 2) {
          setPlayerMoving(false);
          playerTargetRef.current = null;
          // 到达后检查附近家具（自由模式下自动触发提示）
          return prev;
        }

        const speed = 3;
        const nx = prev.playerPos.x + (dx / dist) * speed;
        const ny = prev.playerPos.y + (dy / dist) * speed;
        setPlayerMoving(true);
        setPlayerFlip(dx < 0);
        setPlayerStep(s => 1 - s);

        return { ...prev, playerPos: { x: nx, y: ny } };
      });

      playerAnimRef.current = requestAnimationFrame(animate);
    };

    playerAnimRef.current = requestAnimationFrame(animate);
  }, [session]);

  // 清理动画帧
  useEffect(() => {
    return () => { if (playerAnimRef.current) cancelAnimationFrame(playerAnimRef.current); };
  }, []);

  // ─── 检测玩家接近家具（自由探索模式） ──────────────────
  useEffect(() => {
    if (!session || session.mode !== 'free' || session.isLoading) return;

    const layout = homeState.rooms.find(r => r.roomId === session.currentRoom);
    if (!layout) return;

    const PROXIMITY = 12; // 12% 距离内触发
    for (const f of layout.furniture) {
      const dx = session.playerPos.x - f.x;
      const dy = session.playerPos.y - f.y;
      const dist = Math.sqrt(dx * dx + dy * dy);

      const roomState = session.roomStates.get(session.currentRoom);
      if (dist < PROXIMITY && roomState && !roomState.visitedSlots.has(f.slotId)) {
        const slot = ROOM_SLOTS[session.currentRoom]?.find(s => s.id === f.slotId);
        if (slot) {
          // 自动触发一个接近提示旁白
          const approachNarrator: DiveDialogue = {
            id: `approach_${f.slotId}_${Date.now()}`,
            speaker: 'narrator',
            text: `你走近了${slot.name}。这里存放着关于「${slot.category}」的记忆...`,
            triggeredBy: f.slotId,
            timestamp: Date.now(),
          };
          setSession(prev => prev ? {
            ...prev,
            dialogues: [...prev.dialogues, approachNarrator],
          } : prev);
          // 然后触发完整的家具对话
          handleFurnitureClick(f.slotId);
          break; // 一次只触发一个
        }
      }
    }
  }, [Math.round(session?.playerPos.x ?? 0), Math.round(session?.playerPos.y ?? 0)]);

  // ─── 模式选择 ──────────────────────────────────────────

  const startDive = useCallback((mode: DiveMode) => {
    const initialRoom: MemoryRoom = 'living_room';
    const roomStates = new Map<MemoryRoom, RoomExploreState>();
    for (const room of Object.keys(ROOM_META) as MemoryRoom[]) {
      roomStates.set(room, {
        roomId: room,
        visitedSlots: new Set(),
        hasLockedContent: room === 'attic',
        unlocked: false,
      });
    }

    const introDialogues = generateIntroDialogues(charName, mode);

    setSession({
      charId, charName, mode,
      phase: 'intro',
      currentRoom: initialRoom,
      playerPos: { x: 50, y: 75 },
      charPos: { x: 45, y: 60 },
      dialogues: introDialogues,
      roomStates,
      buffValues: createInitialBuffs(),
      visitedRooms: [initialRoom],
      isLoading: false,
      startedAt: Date.now(),
    });
    setShowModeSelect(false);
  }, [charId, charName]);

  // ─── 用户选择处理 ──────────────────────────────────────

  const handleChoice = useCallback(async (choice: DiveChoice) => {
    if (!session || isLoadingRef.current) return;

    // 记录用户选择
    const choiceDialogue: DiveDialogue = {
      id: `choice_${Date.now()}`,
      speaker: 'user_choice',
      text: choice.text,
      timestamp: Date.now(),
    };

    const newBuffs = applyChoiceBuff(session.buffValues, choice);

    setSession(prev => prev ? {
      ...prev,
      dialogues: [...prev.dialogues, choiceDialogue],
      buffValues: newBuffs,
      phase: 'exploring',
      isLoading: true,
    } : prev);
    isLoadingRef.current = true;

    try {
      // 检索当前房间/槽位的记忆
      const lastSlotDialogue = [...session.dialogues].reverse().find(d => d.triggeredBy);
      const slotId = lastSlotDialogue?.triggeredBy;
      const memories = slotId
        ? await fetchSlotMemories(charId, session.currentRoom, slotId, 5, remoteVectorConfig)
        : await fetchRoomMemories(charId, session.currentRoom, 8, remoteVectorConfig);

      const slot = slotId
        ? ROOM_SLOTS[session.currentRoom]?.find(s => s.id === slotId)
        : null;

      const response = await callDiveLLM({
        charId, charName,
        room: session.currentRoom,
        slotId: slotId || undefined,
        slotName: slot?.name,
        slotCategory: slot?.category,
        memories: memories.map(m => m.content),
        mode: session.mode,
        userChoice: choice,
        recentDialogues: session.dialogues.slice(-5),
        currentBuffs: newBuffs,
      }, apiConfig, fullCharContext);

      const newDialogues: DiveDialogue[] = response.dialogues.map((d, i) => ({
        id: `dive_${Date.now()}_${i}`,
        speaker: d.speaker,
        text: d.text,
        triggeredBy: slotId,
        timestamp: Date.now() + i,
      }));

      // 添加选项
      if (response.choices && response.choices.length > 0) {
        newDialogues.push({
          id: `choices_${Date.now()}`,
          speaker: 'user_choice',
          text: '',
          choices: response.choices.map((c, i) => ({
            id: `c_${Date.now()}_${i}`,
            text: c.text,
            action: c.action,
            buffEffect: c.buffEffect,
          })),
          triggeredBy: slotId,
          timestamp: Date.now() + response.dialogues.length,
        });
      }

      setSession(prev => prev ? {
        ...prev,
        dialogues: [...prev.dialogues, ...newDialogues],
        isLoading: false,
      } : prev);
    } catch (err) {
      console.error('[MemoryDive] LLM error:', err);
      const now = Date.now();
      setSession(prev => prev ? {
        ...prev,
        dialogues: [
          ...prev.dialogues,
          {
            id: `err_${now}`,
            speaker: 'narrator',
            text: `记忆的薄雾变得浓厚，画面一阵模糊...（${err instanceof Error ? err.message : '连接中断'}）`,
            timestamp: now,
          },
          // 兜底选项：即使 LLM 挂了，用户也能继续前进，不会卡死
          {
            id: `err_choices_${now}`,
            speaker: 'user_choice',
            text: '',
            choices: [
              { id: `err_c1_${now}`, text: '换个地方看看', action: 'observe' },
              { id: `err_c2_${now}`, text: '再试一次', action: 'question' },
              { id: `err_c3_${now}`, text: '离开这个角落', action: 'leave' },
            ],
            timestamp: now + 1,
          },
        ],
        isLoading: false,
      } : prev);
    } finally {
      isLoadingRef.current = false;
    }
  }, [session, charId, charName, apiConfig, fullCharContext]);

  // ─── 家具点击（自由探索模式） ──────────────────────────

  const handleFurnitureClick = useCallback(async (slotId: string) => {
    if (!session || isLoadingRef.current) return;

    const roomState = session.roomStates.get(session.currentRoom);
    if (!roomState) return;

    // 标记已访问
    const newVisited = new Set(roomState.visitedSlots);
    newVisited.add(slotId);
    const newRoomStates = new Map(session.roomStates);
    newRoomStates.set(session.currentRoom, { ...roomState, visitedSlots: newVisited });

    setSession(prev => prev ? {
      ...prev,
      roomStates: newRoomStates,
      isLoading: true,
    } : prev);
    isLoadingRef.current = true;

    const slot = ROOM_SLOTS[session.currentRoom]?.find(s => s.id === slotId);

    try {
      const memories = await fetchSlotMemories(charId, session.currentRoom, slotId, 5, remoteVectorConfig);

      const response = await callDiveLLM({
        charId, charName,
        room: session.currentRoom,
        slotId, slotName: slot?.name, slotCategory: slot?.category,
        memories: memories.map(m => m.content),
        mode: session.mode,
        recentDialogues: session.dialogues.slice(-5),
        currentBuffs: session.buffValues,
      }, apiConfig, fullCharContext);

      const newDialogues: DiveDialogue[] = response.dialogues.map((d, i) => ({
        id: `fur_${Date.now()}_${i}`,
        speaker: d.speaker,
        text: d.text,
        triggeredBy: slotId,
        timestamp: Date.now() + i,
      }));

      if (response.choices && response.choices.length > 0) {
        newDialogues.push({
          id: `fur_choices_${Date.now()}`,
          speaker: 'user_choice',
          text: '',
          choices: response.choices.map((c, i) => ({
            id: `fc_${Date.now()}_${i}`,
            text: c.text,
            action: c.action,
            buffEffect: c.buffEffect,
          })),
          triggeredBy: slotId,
          timestamp: Date.now() + response.dialogues.length,
        });
      }

      setSession(prev => prev ? {
        ...prev,
        dialogues: [...prev.dialogues, ...newDialogues],
        isLoading: false,
        phase: 'dialogue',
      } : prev);
    } catch (err) {
      console.error('[MemoryDive] furniture click error:', err);
      setSession(prev => prev ? {
        ...prev,
        dialogues: [...prev.dialogues, {
          id: `ferr_${Date.now()}`,
          speaker: 'narrator',
          text: `${charName}看了看${slot?.name || '那个物品'}，微微皱眉，似乎想说什么却又忘了...`,
          triggeredBy: slotId,
          timestamp: Date.now(),
        }],
        isLoading: false,
      } : prev);
    } finally {
      isLoadingRef.current = false;
    }
  }, [session, charId, charName, apiConfig, fullCharContext]);

  // ─── 房间切换 ──────────────────────────────────────────

  const handleRoomChange = useCallback(async (roomId: MemoryRoom) => {
    if (!session || isLoadingRef.current) return;

    const newVisited = session.visitedRooms.includes(roomId)
      ? session.visitedRooms
      : [...session.visitedRooms, roomId];

    setSession(prev => prev ? {
      ...prev,
      currentRoom: roomId,
      visitedRooms: newVisited,
      playerPos: { x: 50, y: 75 },
      charPos: { x: 45, y: 60 },
      isLoading: true,
    } : prev);
    isLoadingRef.current = true;

    try {
      const memories = await fetchRoomMemories(charId, roomId, 8, remoteVectorConfig);
      const roomMeta = ROOM_META[roomId];
      const isAttic = roomId === 'attic';

      const response = await callDiveLLM({
        charId, charName,
        room: roomId,
        memories: memories.map(m => m.content),
        mode: session.mode,
        recentDialogues: session.dialogues.slice(-3),
        currentBuffs: session.buffValues,
      }, apiConfig, fullCharContext);

      const enterNarrator: DiveDialogue = {
        id: `enter_${Date.now()}`,
        speaker: 'narrator',
        text: isAttic
          ? `你推开了通往阁楼的小门。空气中弥漫着灰尘和旧记忆的气味。${charName}明显变得紧张起来。`
          : `你走进了${roomMeta.name}。${roomMeta.description}的气息扑面而来。`,
        timestamp: Date.now(),
      };

      const llmDialogues: DiveDialogue[] = response.dialogues.map((d, i) => ({
        id: `room_${Date.now()}_${i}`,
        speaker: d.speaker,
        text: d.text,
        timestamp: Date.now() + i + 1,
      }));

      const allNew: DiveDialogue[] = [enterNarrator, ...llmDialogues];

      if (response.choices && response.choices.length > 0) {
        allNew.push({
          id: `room_choices_${Date.now()}`,
          speaker: 'user_choice',
          text: '',
          choices: response.choices.map((c, i) => ({
            id: `rc_${Date.now()}_${i}`,
            text: c.text,
            action: c.action,
            buffEffect: c.buffEffect,
          })),
          timestamp: Date.now() + llmDialogues.length + 1,
        });
      }

      setSession(prev => prev ? {
        ...prev,
        dialogues: [...prev.dialogues, ...allNew],
        isLoading: false,
        phase: 'exploring',
      } : prev);
    } catch (err) {
      console.error('[MemoryDive] room change error:', err);
      setSession(prev => prev ? { ...prev, isLoading: false } : prev);
    } finally {
      isLoadingRef.current = false;
    }
  }, [session, charId, charName, apiConfig, fullCharContext]);

  // ─── 结束潜行 ──────────────────────────────────────────

  const handleExit = useCallback(() => {
    if (!session) { onExit(null); return; }

    const outroDialogues = generateOutroDialogues(charName, session.buffValues);
    setSession(prev => prev ? {
      ...prev,
      phase: 'outro',
      dialogues: [...prev.dialogues, ...outroDialogues],
    } : prev);

    const result = computeDiveResult(session);
    setShowResult(result);
  }, [session, charName, onExit]);

  const handleFinalExit = useCallback(() => {
    onExit(showResult);
  }, [showResult, onExit]);

  // ─── 当前房间数据 ──────────────────────────────────────

  const currentRoomLayout = useMemo(() =>
    homeState.rooms.find(r => r.roomId === session?.currentRoom),
    [homeState, session?.currentRoom],
  );

  const currentRoomSlots = useMemo(() =>
    session ? ROOM_SLOTS[session.currentRoom] || [] : [],
    [session?.currentRoom],
  );

  const roomSize = useMemo(() =>
    session ? ROOM_SIZES[session.currentRoom] : { w: 10, h: 6 },
    [session?.currentRoom],
  );

  // ─── 最新的选项（还没被回答的） ────────────────────────

  const pendingChoices = useMemo(() => {
    if (!session) return null;
    const last = session.dialogues[session.dialogues.length - 1];
    if (last?.speaker === 'user_choice' && last.choices) return last;
    return null;
  }, [session?.dialogues.length]);

  // ═══════════════════════════════════════════════════════
  // RENDER
  // ═══════════════════════════════════════════════════════

  // ─── 模式选择界面 ──────────────────────────────────────

  if (showModeSelect) {
    return (
      <div className="h-full w-full flex flex-col bg-slate-900">
        {/* 顶栏 —— 返回按钮 */}
        <div className="shrink-0 flex items-center px-4 pt-12 pb-3 bg-slate-800/80 backdrop-blur-sm border-b border-slate-700/50">
          <button
            onClick={() => onExit(null)}
            className="p-2 -ml-2 rounded-full hover:bg-slate-700 active:scale-90 transition-all"
            aria-label="返回像素家园"
          >
            <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" strokeWidth={2} stroke="currentColor" className="w-5 h-5 text-slate-300">
              <path strokeLinecap="round" strokeLinejoin="round" d="M15.75 19.5 8.25 12l7.5-7.5" />
            </svg>
          </button>
          <span className="font-bold text-slate-200 text-sm tracking-wide ml-2">🌀 记忆潜行</span>
        </div>

        <div className="flex-1 flex flex-col items-center justify-center p-6">
        <div className="max-w-sm w-full space-y-6 text-center">
          {/* 标题 */}
          <div className="space-y-2">
            <div className="text-3xl">🌀</div>
            <h2 className="text-xl font-bold text-slate-100">记忆潜行</h2>
            <p className="text-xs text-slate-400 leading-relaxed">
              进入{charName}的内心世界，以 RPG 的方式探索ta的记忆。<br/>
              <span className="text-amber-400/70">退出后，{charName}不会记得这次经历。</span>
            </p>
          </div>

          {/* 模式选择 */}
          <div className="space-y-3">
            <button
              onClick={() => startDive('guided')}
              className="w-full p-4 rounded-2xl bg-gradient-to-r from-violet-600/30 to-indigo-600/30 border border-violet-500/30 hover:border-violet-400/50 transition-all active:scale-[0.98] text-left"
            >
              <div className="flex items-center gap-3">
                <span className="text-2xl">🗺️</span>
                <div>
                  <div className="font-bold text-violet-200 text-sm">角色引领</div>
                  <div className="text-[10px] text-slate-400 mt-0.5">
                    {charName}带你走，主动讲述回忆，引导你探索各个房间
                  </div>
                </div>
              </div>
            </button>

            <button
              onClick={() => startDive('free')}
              className="w-full p-4 rounded-2xl bg-gradient-to-r from-emerald-600/30 to-teal-600/30 border border-emerald-500/30 hover:border-emerald-400/50 transition-all active:scale-[0.98] text-left"
            >
              <div className="flex items-center gap-3">
                <span className="text-2xl">🚶</span>
                <div>
                  <div className="font-bold text-emerald-200 text-sm">自由探索</div>
                  <div className="text-[10px] text-slate-400 mt-0.5">
                    你自主行动，点击物品触发对话，发现隐藏的记忆
                  </div>
                </div>
              </div>
            </button>
          </div>

          {/* 返回 */}
          <button onClick={() => onExit(null)}
            className="text-xs text-slate-500 hover:text-slate-300 transition-colors">
            还是算了
          </button>
        </div>
        </div>
      </div>
    );
  }

  // ─── 结算界面 ──────────────────────────────────────────

  if (showResult) {
    return (
      <div className="h-full w-full flex flex-col items-center justify-center bg-slate-900 p-6">
        <div className="max-w-sm w-full space-y-6 text-center">
          <div className="text-3xl">✨</div>
          <h2 className="text-lg font-bold text-slate-100">记忆潜行结束</h2>

          <div className="text-xs text-slate-400">
            探索了 {showResult.visitedRooms.length} 个房间 · {showResult.totalDialogues} 段对话
          </div>

          {/* Buff 展示 */}
          {showResult.buffs.length > 0 && (
            <div className="space-y-2">
              <div className="text-[10px] text-slate-500 uppercase tracking-widest">获得的印记</div>
              {showResult.buffs.map(buff => (
                <div key={buff.type}
                  className="flex items-center gap-3 px-4 py-2.5 rounded-xl bg-slate-800/60 border border-slate-700/50">
                  <span className="text-xl">{buff.icon}</span>
                  <div className="text-left flex-1">
                    <div className="text-sm font-bold text-slate-200">{buff.label} +{buff.value}</div>
                    <div className="text-[10px] text-slate-400">{buff.description}</div>
                  </div>
                </div>
              ))}
            </div>
          )}

          <p className="text-[10px] text-slate-500 italic">
            {charName}眨了眨眼，看起来什么都不记得了。<br/>
            但你知道，你们之间多了一些微妙的东西。
          </p>

          <button onClick={handleFinalExit}
            className="px-6 py-2.5 rounded-xl bg-violet-600 hover:bg-violet-500 text-white text-sm font-bold transition-all active:scale-95">
            回到像素家园
          </button>
        </div>
      </div>
    );
  }

  if (!session) return null;

  // ─── 主探索界面 ────────────────────────────────────────

  const roomStyle = FLOOR_STYLES[session.currentRoom] || FLOOR_STYLES.living_room;
  const pw = roomSize.w * TILE * ROOM_SCALE;
  const ph = roomSize.h * TILE * ROOM_SCALE;
  const wallH = Math.round(ph * 0.28);

  return (
    <div className="h-full w-full flex flex-col bg-slate-900 overflow-hidden">
      {/* 顶栏 */}
      <div className="shrink-0 flex items-center justify-between px-3 pt-12 pb-2 bg-black/40 backdrop-blur-sm border-b border-slate-700/30 z-20">
        <div className="flex items-center gap-1">
          {/* 返回按钮：直接离开潜行，不结算 buff */}
          <button
            onClick={() => onExit(null)}
            className="p-2 -ml-1 rounded-full hover:bg-slate-700/60 active:scale-90 transition-all"
            aria-label="返回像素家园"
          >
            <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" strokeWidth={2} stroke="currentColor" className="w-4 h-4 text-slate-300">
              <path strokeLinecap="round" strokeLinejoin="round" d="M15.75 19.5 8.25 12l7.5-7.5" />
            </svg>
          </button>
          <span className="text-xs ml-1">🌀</span>
          <span className="text-[10px] font-bold text-violet-300">
            {ROOM_META[session.currentRoom].emoji} {ROOM_META[session.currentRoom].name}
          </span>
        </div>
        <div className="flex items-center gap-2">
          {/* Mini buff display */}
          {(Object.entries(session.buffValues) as [keyof DiveBuffValues, number][]).map(([key, val]) =>
            val > 0 ? (
              <span key={key} className="text-[9px] text-slate-400">
                {BUFF_META[key].icon}{Math.round(val * 10) / 10}
              </span>
            ) : null
          )}
          <button onClick={handleExit}
            title="结算潜行：生成告别对话并获取印记"
            className="ml-2 px-2.5 py-1 rounded-lg bg-violet-600/30 hover:bg-violet-500/50 text-[10px] text-violet-200 hover:text-white transition-all">
            结束潜行
          </button>
        </div>
      </div>

      {/* 房间可视化 + 可点击家具 */}
      <div className="shrink-0 relative flex justify-center py-3 overflow-hidden cursor-pointer" style={{ height: ph + 24 }}>
        <div ref={roomRef} className="relative" style={{ width: pw, height: ph }} onClick={handleRoomClick}>
          {/* 墙面 —— 优先用用户在编辑器里设的墙纸/颜色 */}
          <div className="absolute inset-x-0 top-0 rounded-t-lg overflow-hidden" style={{ height: wallH }}>
            {(() => {
              const d = decodeColorField(currentRoomLayout?.wallColor);
              if (d.kind === 'image') {
                return <div className="absolute inset-0" style={
                  currentRoomLayout?.wallFillMode === 'stretch'
                    ? {
                        backgroundImage: `url(${d.value})`,
                        backgroundSize: 'cover',
                        backgroundRepeat: 'no-repeat',
                        backgroundPosition: `${currentRoomLayout?.wallOffsetX ?? 50}% ${currentRoomLayout?.wallOffsetY ?? 50}%`,
                        imageRendering: 'pixelated' as any,
                      }
                    : {
                        backgroundImage: `url(${d.value})`,
                        backgroundSize: `${TILE * 2}px ${TILE * 2}px`,
                        backgroundRepeat: 'repeat',
                        imageRendering: 'pixelated' as any,
                      }
                } />;
              }
              const color = d.kind === 'color' ? d.value : roomStyle.wallFace;
              return <div className="absolute inset-0" style={{ backgroundColor: color }} />;
            })()}
          </div>
          {/* 地板 —— 同样按布局读 */}
          <div className="absolute inset-x-0 bottom-0 rounded-b-lg overflow-hidden" style={{ top: wallH }}>
            {(() => {
              const d = decodeColorField(currentRoomLayout?.floorColor);
              if (d.kind === 'image') {
                return <div className="absolute inset-0" style={
                  currentRoomLayout?.floorFillMode === 'stretch'
                    ? {
                        backgroundImage: `url(${d.value})`,
                        backgroundSize: 'cover',
                        backgroundRepeat: 'no-repeat',
                        backgroundPosition: `${currentRoomLayout?.floorOffsetX ?? 50}% ${currentRoomLayout?.floorOffsetY ?? 50}%`,
                        imageRendering: 'pixelated' as any,
                      }
                    : {
                        backgroundImage: `url(${d.value})`,
                        backgroundSize: `${TILE}px ${TILE}px`,
                        backgroundRepeat: 'repeat',
                        imageRendering: 'pixelated' as any,
                      }
                } />;
              }
              const color = d.kind === 'color' ? d.value : roomStyle.floor;
              return <div className="absolute inset-0" style={{ backgroundColor: color }} />;
            })()}
          </div>

          {/* 家具（可点击）—— 尺寸系数 0.22 与编辑器对齐，z-index 公式也对齐 */}
          {currentRoomLayout?.furniture.map(f => {
            const asset = f.assetId ? assets.find(a => a.id === f.assetId) : null;
            // 潜行模式只显示用户真正放进去的素材，不再回退到 emoji 默认家具
            const imgSrc = asset ? asset.pixelImage : null;
            if (!imgSrc) return null;

            const slot = currentRoomSlots.find(s => s.id === f.slotId);
            const isVisited = session.roomStates.get(session.currentRoom)?.visitedSlots.has(f.slotId);
            const furSize = Math.round(Math.min(pw, ph) * 0.22 * f.scale);
            const isRug = !!asset?.tags?.includes('rug');

            // z-index 和 PixelRoomEditor 保持同一公式，否则角色总在家具顶部
            const autoZ = Math.round(f.y * 4) + 20;
            let zIdx: number;
            if (isRug) zIdx = 1;
            else if (f.zOrder === 'back') zIdx = 2 + Math.round(autoZ / 200);
            else if (f.zOrder === 'front') zIdx = 1000 + autoZ;
            else zIdx = autoZ;

            return (
              <button
                key={f.slotId}
                onClick={() => handleFurnitureClick(f.slotId)}
                disabled={session.isLoading}
                className="absolute group transition-all duration-200"
                style={{
                  left: `${f.x}%`, top: `${f.y}%`,
                  // 宽度用 furSize 整数；translate 锚中心；高度随图纵横比自适应
                  width: furSize,
                  transform: 'translate(-50%, -50%)',
                  zIndex: zIdx,
                }}
              >
                <img src={imgSrc} alt={slot?.name || f.slotId}
                  className="pointer-events-none transition-transform duration-200 group-hover:scale-110"
                  style={{
                    display: 'block',
                    width: '100%',
                    height: 'auto',
                    imageRendering: 'pixelated' as any,
                    transform: `rotate(${f.rotation || 0}deg)`,
                    filter: isVisited ? 'brightness(0.7) saturate(0.5)' : 'none',
                  }}
                  draggable={false}
                />
                {/* 互动提示 */}
                {!isVisited && !session.isLoading && (
                  <div className="absolute -top-3 left-1/2 -translate-x-1/2 opacity-0 group-hover:opacity-100 transition-opacity">
                    <div className="px-1.5 py-0.5 rounded bg-black/70 text-[8px] text-amber-300 whitespace-nowrap">
                      {slot?.name} · {slot?.category}
                    </div>
                  </div>
                )}
                {/* 未访问闪烁标记 */}
                {!isVisited && (
                  <div className="absolute -top-1 -right-1 w-2 h-2 rounded-full bg-amber-400 animate-pulse" />
                )}
              </button>
            );
          })}

          {/* 角色小人 (NPC) —— z-index 用和家具同一套公式（锚点在脚底，charPos.y = 视觉底边） */}
          {charSprite && (
            <div className="absolute pointer-events-none transition-all duration-700"
              style={{
                left: `${session.charPos.x}%`, top: `${session.charPos.y}%`,
                width: 32, height: 32,
                transform: 'translate(-50%, -100%)',
                zIndex: Math.round(session.charPos.y * 4) + 20,
              }}>
              <img src={charSprite} className="drop-shadow-md"
                style={{
                  display: 'block',
                  width: '100%', height: '100%',
                  objectFit: 'contain',
                  imageRendering: 'pixelated',
                }} draggable={false} />
              {/* 角色名字标签 */}
              <div className="text-center -mt-0.5">
                <span className="text-[6px] px-1 rounded bg-violet-600/60 text-white/90">{charName}</span>
              </div>
            </div>
          )}

          {/* 玩家小人 (可控制) */}
          <div className="absolute pointer-events-none transition-all"
            style={{
              left: `${session.playerPos.x}%`,
              top: `${session.playerPos.y}%`,
              width: 28, height: 28,
              transform: `translate(-50%, -100%) scaleX(${playerFlip ? -1 : 1})`,
              transitionDuration: playerMoving ? '0ms' : '200ms',
              // 比 NPC 角色稍高一点，两个角色重叠时玩家在前
              zIndex: Math.round(session.playerPos.y * 4) + 21,
            }}>
            {playerSprite ? (
              <img src={playerSprite} className="drop-shadow-md"
                style={{
                  display: 'block',
                  width: '100%', height: '100%',
                  objectFit: 'contain',
                  imageRendering: 'pixelated',
                  transform: playerMoving
                    ? `rotate(${playerStep === 0 ? -5 : 5}deg) translateY(${playerStep === 0 ? -1 : 0}px)`
                    : 'none',
                }} draggable={false} />
            ) : (
              /* 默认玩家小人：简单的像素风头像 */
              <div className="relative" style={{
                transform: playerMoving
                  ? `rotate(${playerStep === 0 ? -4 : 4}deg) translateY(${playerStep === 0 ? -1 : 0}px)`
                  : 'none',
              }}>
                <div className="w-5 h-5 rounded-sm border border-emerald-400/60"
                  style={{
                    background: 'linear-gradient(135deg, #6ee7b7 0%, #34d399 50%, #10b981 100%)',
                    imageRendering: 'pixelated',
                    boxShadow: '0 1px 3px rgba(0,0,0,0.3)',
                  }}>
                  {/* 眼睛 */}
                  <div className="absolute top-1.5 left-0.5 w-1 h-1 rounded-full bg-white" />
                  <div className="absolute top-1.5 right-0.5 w-1 h-1 rounded-full bg-white" />
                  <div className="absolute top-[7px] left-[3px] w-0.5 h-0.5 rounded-full bg-slate-800" />
                  <div className="absolute top-[7px] right-[3px] w-0.5 h-0.5 rounded-full bg-slate-800" />
                </div>
                {/* 脚下阴影 */}
                <div className="mx-auto rounded-full bg-black/20 mt-px"
                  style={{ width: playerMoving ? 10 : 14, height: 2 }} />
              </div>
            )}
            {/* 玩家名字标签 */}
            <div className="text-center -mt-0.5" style={{ transform: `scaleX(${playerFlip ? -1 : 1})` }}>
              <span className="text-[6px] px-1 rounded bg-emerald-600/60 text-white/90">{userName}</span>
            </div>
          </div>
        </div>
      </div>

      {/* 房间导航 */}
      <div className="shrink-0 flex items-center gap-1 px-3 py-1.5 overflow-x-auto bg-black/30 border-y border-slate-700/30">
        {(Object.keys(ROOM_META) as MemoryRoom[]).map(roomId => {
          const meta = ROOM_META[roomId];
          const isCurrent = roomId === session.currentRoom;
          const visited = session.visitedRooms.includes(roomId);
          return (
            <button key={roomId}
              onClick={() => !isCurrent && handleRoomChange(roomId)}
              disabled={isCurrent || session.isLoading}
              className={`shrink-0 px-2 py-1 rounded-lg text-[9px] font-bold transition-all active:scale-95 ${
                isCurrent
                  ? 'bg-violet-600/30 text-violet-300 border border-violet-500/40'
                  : visited
                    ? 'bg-slate-700/30 text-slate-400 hover:text-slate-200'
                    : 'bg-slate-800/30 text-slate-500 hover:text-slate-300'
              }`}
            >
              {meta.emoji} {roomId === 'user_room' ? `${userName}的房` : meta.name}
            </button>
          );
        })}
      </div>

      {/* 对话区域 */}
      <div className="flex-1 overflow-y-auto px-4 py-3 space-y-3">
        {session.dialogues.map(d => (
          <DialogueBubble key={d.id} dialogue={d} charName={charName}
            onChoice={handleChoice} isActive={d === pendingChoices} disabled={session.isLoading} />
        ))}

        {/* Loading 指示器 */}
        {session.isLoading && (
          <div className="flex items-center gap-2 px-3 py-2">
            <div className="flex gap-1">
              <div className="w-1.5 h-1.5 rounded-full bg-violet-400 animate-bounce" style={{ animationDelay: '0ms' }} />
              <div className="w-1.5 h-1.5 rounded-full bg-violet-400 animate-bounce" style={{ animationDelay: '150ms' }} />
              <div className="w-1.5 h-1.5 rounded-full bg-violet-400 animate-bounce" style={{ animationDelay: '300ms' }} />
            </div>
            <span className="text-[10px] text-slate-500 italic">记忆正在浮现...</span>
          </div>
        )}

        <div ref={dialogueEndRef} />
      </div>
    </div>
  );
};

// ─── 对话气泡子组件 ──────────────────────────────────────

const DialogueBubble: React.FC<{
  dialogue: DiveDialogue;
  charName: string;
  onChoice: (choice: DiveChoice) => void;
  isActive: boolean;
  disabled: boolean;
}> = ({ dialogue, charName, onChoice, isActive, disabled }) => {
  if (dialogue.speaker === 'narrator') {
    return (
      <div className="px-3 py-2 text-[11px] text-slate-400 italic leading-relaxed bg-slate-800/30 rounded-xl border-l-2 border-slate-600/50">
        {dialogue.text}
      </div>
    );
  }

  if (dialogue.speaker === 'character') {
    return (
      <div className="flex gap-2 items-start">
        <div className="shrink-0 w-6 h-6 rounded-full bg-violet-600/30 flex items-center justify-center text-[10px]">
          💬
        </div>
        <div className="flex-1">
          <div className="text-[9px] text-violet-400 font-bold mb-0.5">{charName}</div>
          <div className="px-3 py-2 bg-violet-600/15 rounded-2xl rounded-tl-md text-[11px] text-slate-200 leading-relaxed border border-violet-500/20">
            {dialogue.text}
          </div>
        </div>
      </div>
    );
  }

  if (dialogue.speaker === 'user_choice') {
    // 已选择的（没有 choices）
    if (!dialogue.choices) {
      return (
        <div className="flex justify-end">
          <div className="px-3 py-2 bg-emerald-600/20 rounded-2xl rounded-tr-md text-[11px] text-emerald-200 border border-emerald-500/20">
            {dialogue.text}
          </div>
        </div>
      );
    }

    // 未选择的选项
    if (!isActive) return null;

    return (
      <div className="space-y-1.5 pl-8">
        {dialogue.choices.map(choice => (
          <button key={choice.id}
            onClick={() => onChoice(choice)}
            disabled={disabled}
            className="block w-full text-left px-3 py-2 rounded-xl bg-slate-800/50 hover:bg-emerald-600/20 border border-slate-700/40 hover:border-emerald-500/30 text-[11px] text-slate-300 hover:text-emerald-200 transition-all active:scale-[0.98] disabled:opacity-50"
          >
            <span className="text-slate-500 mr-1.5">›</span>
            {choice.text}
            {choice.action && (
              <span className="ml-1.5 text-[8px] text-slate-500">
                ({choice.action === 'comfort' ? '安慰' : choice.action === 'question' ? '追问' : choice.action === 'observe' ? '观察' : choice.action === 'leave' ? '离开' : '解锁'})
              </span>
            )}
          </button>
        ))}
      </div>
    );
  }

  return null;
};

export default MemoryDiveMode;
