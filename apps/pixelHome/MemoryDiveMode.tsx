/**
 * Memory Dive (记忆潜行) — 像素 RPG 探索
 *
 * 布局：3DS 风格上下双屏
 *   上屏：像素房间 + 角色 + 用户跟随小人
 *   下屏：复古对话框 + 打字机文本 + 选项
 *
 * 流程：角色自主带路，用户小人跟随
 *   1. 进入客厅，播放开场旁白
 *   2. 用户选择开场回应 → 角色走到第一件家具旁
 *   3. 到达 → 调用 LLM 生成对话 → 打字机展示 → 选项
 *   4. 选择后 → 走向下一个家具；全部走完后转场下一个房间
 *   5. 所有房间走完 → 出场结算
 */

import React, { useState, useCallback, useEffect, useRef, useMemo } from 'react';
import type { MemoryRoom, RemoteVectorConfig } from '../../utils/memoryPalace/types';
import type { APIConfig, CharacterProfile, UserProfile } from '../../types';
import type { PixelHomeState, PixelAsset } from './types';
import type {
  DiveSession, DiveDialogue, DiveChoice, DiveBuffValues,
  DiveResult, RoomExploreState,
} from './memoryDiveTypes';
import { BUFF_META } from './memoryDiveTypes';
import { ROOM_SLOTS, ROOM_META } from './roomTemplates';
import { ContextBuilder } from '../../utils/context';
import {
  fetchRoomMemories, fetchSlotMemories, callDiveLLM,
  generateIntroDialogues, generateOutroDialogues,
  createInitialBuffs, applyChoiceBuff, computeDiveResult,
} from './memoryDiveEngine';
import MemoryDiveRoom from './MemoryDiveRoom';
import MemoryDiveDialogue from './MemoryDiveDialogue';
import {
  pickNextTarget, roomEntryPos, followerOffset,
  type DiveTarget,
} from './memoryDiveNav';

interface Props {
  charId: string;
  charName: string;
  charProfile: CharacterProfile;
  userProfile: UserProfile;
  charSprite?: string;
  playerSprite?: string;
  userName: string;
  homeState: PixelHomeState;
  assets: PixelAsset[];
  apiConfig: APIConfig;
  remoteVectorConfig?: RemoteVectorConfig;
  onExit: (result: DiveResult | null) => void;
}

const WALK_DURATION_MS = 900;
const WALK_STEP_MS = 180;
const TRANSITION_HALF_MS = 400;

const MemoryDiveMode: React.FC<Props> = ({
  charId, charName, charProfile, userProfile, charSprite, playerSprite,
  userName, homeState, assets, apiConfig, remoteVectorConfig, onExit,
}) => {
  const fullCharContext = useMemo(() =>
    ContextBuilder.buildCoreContext(charProfile, userProfile, true),
    [charProfile, userProfile],
  );

  // ─── Session ─────────────────────────────────────────
  const [session, setSession] = useState<DiveSession | null>(null);
  const [showResult, setShowResult] = useState<DiveResult | null>(null);

  // ─── 对话显示 ─────────────────────────────────────────
  const [dialogueQueue, setDialogueQueue] = useState<DiveDialogue[]>([]);
  const [currentDialogue, setCurrentDialogue] = useState<DiveDialogue | null>(null);
  const [pendingChoices, setPendingChoices] = useState<DiveChoice[] | null>(null);

  // ─── 移动 / 目标 ──────────────────────────────────────
  const [target, setTarget] = useState<DiveTarget | null>(null);
  const [highlightedSlotId, setHighlightedSlotId] = useState<string | null>(null);
  const [charWalking, setCharWalking] = useState(false);
  const [charFlip, setCharFlip] = useState(false);
  const [walkStep, setWalkStep] = useState<0 | 1>(0);
  const [transitionState, setTransitionState] = useState<'idle' | 'out' | 'in'>('idle');

  const isLoadingRef = useRef(false);
  const walkTimerRef = useRef<number | null>(null);
  const stepTimerRef = useRef<number | null>(null);
  // session 的 ref，让深层 callback 总能读到最新值（避免依赖循环）
  const sessionRef = useRef<DiveSession | null>(null);

  // ─── 初始化 ───────────────────────────────────────────
  const initializedRef = useRef(false);
  useEffect(() => {
    if (initializedRef.current) return;
    initializedRef.current = true;
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
    const entry = roomEntryPos(initialRoom);
    const off = followerOffset();

    setSession({
      charId, charName, mode: 'guided',
      phase: 'intro',
      currentRoom: initialRoom,
      playerPos: { x: entry.x + off.dx, y: entry.y + off.dy },
      charPos: entry,
      dialogues: [],
      roomStates,
      buffValues: createInitialBuffs(),
      visitedRooms: [initialRoom],
      isLoading: false,
      startedAt: Date.now(),
    });

    const intro = generateIntroDialogues(charName, 'guided');
    enqueueDialogues(intro);
  }, [charId, charName]);

  // ─── 清理动画帧 ───────────────────────────────────────
  useEffect(() => () => {
    if (walkTimerRef.current) window.clearTimeout(walkTimerRef.current);
    if (stepTimerRef.current) window.clearInterval(stepTimerRef.current);
  }, []);

  // ─── 走路脚步循环 ─────────────────────────────────────
  useEffect(() => {
    if (!charWalking) {
      if (stepTimerRef.current) window.clearInterval(stepTimerRef.current);
      stepTimerRef.current = null;
      return;
    }
    stepTimerRef.current = window.setInterval(() => {
      setWalkStep(s => (s === 0 ? 1 : 0));
    }, WALK_STEP_MS);
    return () => {
      if (stepTimerRef.current) window.clearInterval(stepTimerRef.current);
      stepTimerRef.current = null;
    };
  }, [charWalking]);

  // ─── 对话队列 ─────────────────────────────────────────
  //   enqueueDialogues：把一批对话拆成"叙事 + 选项"两部分
  //   叙事进入队列（后续 effect 会自动弹出第一条作为 current）
  //   选项等队列清空后再显示
  const enqueueDialogues = useCallback((items: DiveDialogue[]) => {
    const narratives: DiveDialogue[] = [];
    let choicesMsg: DiveDialogue | null = null;
    for (const d of items) {
      if (d.speaker === 'user_choice' && d.choices && d.choices.length > 0) {
        choicesMsg = d;
      } else if (d.speaker !== 'user_choice') {
        narratives.push(d);
      }
    }
    setSession(prev => prev ? { ...prev, dialogues: [...prev.dialogues, ...items] } : prev);
    if (narratives.length > 0) {
      setDialogueQueue(prev => [...prev, ...narratives]);
    }
    if (choicesMsg?.choices) {
      setPendingChoices(choicesMsg.choices);
    }
  }, []);

  // current 为空 + 队列非空 → 自动弹出下一条（纯幂等，不依赖 setter 副作用）
  useEffect(() => {
    if (currentDialogue) return;
    if (dialogueQueue.length === 0) return;
    const [next, ...rest] = dialogueQueue;
    setCurrentDialogue(next);
    setDialogueQueue(rest);
  }, [currentDialogue, dialogueQueue]);

  const advanceDialogue = useCallback(() => {
    // 清空当前，交给上面的 effect 弹下一条；队列为空时 current 保持 null
    setCurrentDialogue(null);
  }, []);

  // ─── 当前房间布局 ─────────────────────────────────────
  const currentRoomLayout = useMemo(() =>
    session ? homeState.rooms.find(r => r.roomId === session.currentRoom) : undefined,
    [homeState, session?.currentRoom],
  );

  const visitedSlots = useMemo(() => {
    if (!session) return new Set<string>();
    return session.roomStates.get(session.currentRoom)?.visitedSlots ?? new Set<string>();
  }, [session?.roomStates, session?.currentRoom]);

  // ─── 角色走到目标位置 ─────────────────────────────────
  const walkTo = useCallback((x: number, y: number, afterMs: number, onArrive: () => void) => {
    setSession(prev => {
      if (!prev) return prev;
      const dx = x - prev.charPos.x;
      setCharFlip(dx < 0);
      const off = followerOffset();
      return {
        ...prev,
        charPos: { x, y },
        // 用户小人瞄向"角色原先所在点"，造成跟随落后的视觉
        playerPos: { x: prev.charPos.x + off.dx * 0.3, y: prev.charPos.y + off.dy * 0.3 },
      };
    });
    setCharWalking(true);
    if (walkTimerRef.current) window.clearTimeout(walkTimerRef.current);
    walkTimerRef.current = window.setTimeout(() => {
      setCharWalking(false);
      // 走到后，用户继续追到角色身边
      setSession(prev => {
        if (!prev) return prev;
        const off = followerOffset();
        return {
          ...prev,
          playerPos: {
            x: Math.max(6, Math.min(94, prev.charPos.x + off.dx)),
            y: Math.max(40, Math.min(95, prev.charPos.y + off.dy)),
          },
        };
      });
      walkTimerRef.current = null;
      onArrive();
    }, afterMs);
  }, []);

  // ─── 到达家具 → 触发 LLM 对话 ─────────────────────────
  const arriveAtSlot = useCallback(async (slotId: string) => {
    if (!session || isLoadingRef.current) return;
    setSession(prev => prev ? { ...prev, phase: 'dialogue', isLoading: true } : prev);
    isLoadingRef.current = true;

    // 标记已访问
    setSession(prev => {
      if (!prev) return prev;
      const st = prev.roomStates.get(prev.currentRoom);
      if (!st) return prev;
      const nextVisited = new Set(st.visitedSlots);
      nextVisited.add(slotId);
      const nextStates = new Map(prev.roomStates);
      nextStates.set(prev.currentRoom, { ...st, visitedSlots: nextVisited });
      return { ...prev, roomStates: nextStates };
    });

    const slot = ROOM_SLOTS[session.currentRoom]?.find(s => s.id === slotId);
    try {
      const memories = await fetchSlotMemories(charId, session.currentRoom, slotId, 5, remoteVectorConfig);
      const response = await callDiveLLM({
        charId, charName,
        room: session.currentRoom,
        slotId, slotName: slot?.name, slotCategory: slot?.category,
        memories: memories.map(m => m.content),
        mode: 'guided',
        recentDialogues: session.dialogues.slice(-5),
        currentBuffs: session.buffValues,
      }, apiConfig, fullCharContext);

      const now = Date.now();
      const ds: DiveDialogue[] = response.dialogues.map((d, i) => ({
        id: `slot_${slotId}_${now}_${i}`,
        speaker: d.speaker, text: d.text,
        triggeredBy: slotId, timestamp: now + i,
      }));
      if (response.choices && response.choices.length > 0) {
        ds.push({
          id: `slot_choices_${slotId}_${now}`,
          speaker: 'user_choice',
          text: '',
          choices: response.choices.map((c, i) => ({
            id: `sc_${slotId}_${now}_${i}`,
            text: c.text, action: c.action, buffEffect: c.buffEffect,
          })),
          triggeredBy: slotId,
          timestamp: now + response.dialogues.length,
        });
      }
      enqueueDialogues(ds);
    } catch (err) {
      console.error('[MemoryDive] slot dialogue error:', err);
      const now = Date.now();
      enqueueDialogues([{
        id: `err_${now}`, speaker: 'narrator',
        text: `${charName}看了看${slot?.name || '那个物品'}，似乎想说什么又咽了回去。`,
        triggeredBy: slotId, timestamp: now,
      }, {
        id: `err_c_${now}`, speaker: 'user_choice', text: '',
        choices: [
          { id: `ec1_${now}`, text: '等一下', action: 'observe' },
          { id: `ec2_${now}`, text: '那我们继续走', action: 'leave' },
        ],
        timestamp: now + 1,
      }]);
    } finally {
      setSession(prev => prev ? { ...prev, isLoading: false } : prev);
      isLoadingRef.current = false;
    }
  }, [session, charId, charName, apiConfig, fullCharContext, remoteVectorConfig, enqueueDialogues]);

  // ─── 进入新房间（带转场） → LLM 进场对话 ──────────────
  const enterRoom = useCallback(async (roomId: MemoryRoom) => {
    if (isLoadingRef.current) return;
    setTransitionState('out');
    await new Promise(res => window.setTimeout(res, TRANSITION_HALF_MS));

    setSession(prev => {
      if (!prev) return prev;
      const entry = roomEntryPos(roomId);
      const off = followerOffset();
      const visited = prev.visitedRooms.includes(roomId)
        ? prev.visitedRooms
        : [...prev.visitedRooms, roomId];
      return {
        ...prev,
        currentRoom: roomId,
        visitedRooms: visited,
        charPos: entry,
        playerPos: { x: entry.x + off.dx, y: entry.y + off.dy },
        phase: 'exploring',
      };
    });

    setTransitionState('in');
    await new Promise(res => window.setTimeout(res, TRANSITION_HALF_MS));
    setTransitionState('idle');

    // 进场旁白
    const meta = ROOM_META[roomId];
    const isAttic = roomId === 'attic';
    const now = Date.now();
    const enterNarrator: DiveDialogue = {
      id: `enter_${now}`, speaker: 'narrator',
      text: isAttic
        ? `你们推开了通往阁楼的小门。空气中弥漫着灰尘和旧记忆的气味。${charName}明显紧张起来。`
        : `你们走进了${meta.name}。${meta.description}的气息扑面而来。`,
      timestamp: now,
    };
    enqueueDialogues([enterNarrator]);

    // LLM 房间开场（简化：只拉一次，让角色自己说一句）
    setSession(prev => prev ? { ...prev, isLoading: true } : prev);
    isLoadingRef.current = true;
    try {
      const memories = await fetchRoomMemories(charId, roomId, 6, remoteVectorConfig);
      const response = await callDiveLLM({
        charId, charName,
        room: roomId,
        memories: memories.map(m => m.content),
        mode: 'guided',
        recentDialogues: (sessionRef.current?.dialogues ?? []).slice(-3),
        currentBuffs: sessionRef.current?.buffValues ?? createInitialBuffs(),
      }, apiConfig, fullCharContext);
      const t = Date.now();
      const ds: DiveDialogue[] = response.dialogues.map((d, i) => ({
        id: `room_${roomId}_${t}_${i}`,
        speaker: d.speaker, text: d.text,
        timestamp: t + i,
      }));
      enqueueDialogues(ds);
    } catch (err) {
      console.error('[MemoryDive] enter room error:', err);
    } finally {
      setSession(prev => prev ? { ...prev, isLoading: false } : prev);
      isLoadingRef.current = false;
    }
  }, [charId, charName, apiConfig, fullCharContext, remoteVectorConfig, enqueueDialogues]);

  // session 的 ref 同步（让 callback 总能读到最新值）
  useEffect(() => { sessionRef.current = session; }, [session]);

  // ─── 退出（结算） ─────────────────────────────────────
  const handleExit = useCallback(() => {
    const s = sessionRef.current;
    if (!s) { onExit(null); return; }
    // 先把 phase 置为 outro，避免自动前进 effect 再次触发退出
    setSession(prev => prev ? { ...prev, phase: 'outro' } : prev);
    const outro = generateOutroDialogues(charName, s.buffValues);
    enqueueDialogues(outro);
    const result = computeDiveResult({ ...s, phase: 'outro' });
    // 给出屏对话读完一点时间再弹结算
    window.setTimeout(() => setShowResult(result), 1200);
  }, [charName, enqueueDialogues, onExit]);

  const handleFinalExit = useCallback(() => onExit(showResult), [showResult, onExit]);

  // ─── 目标变化 → 触发走路/转场 ─────────────────────────
  useEffect(() => {
    if (!target || !session) return;
    if (target.kind === 'done') {
      setTarget(null);
      handleExit();
      return;
    }
    if (target.kind === 'slot') {
      setHighlightedSlotId(target.slotId);
      const slotId = target.slotId;
      const tx = target.x, ty = target.y;
      walkTo(tx, ty, WALK_DURATION_MS, () => {
        setTarget(null);
        arriveAtSlot(slotId);
      });
      return;
    }
    if (target.kind === 'room') {
      setHighlightedSlotId(null);
      const roomId = target.roomId;
      setTarget(null);
      enterRoom(roomId);
    }
  }, [target]);

  // ─── 用户选择 → 应用 buff + 继续前进 ──────────────────
  const handleChoice = useCallback((choice: DiveChoice) => {
    if (!session) return;
    const now = Date.now();
    const choiceDialogue: DiveDialogue = {
      id: `choice_${now}`,
      speaker: 'user_choice',
      text: choice.text,
      timestamp: now,
    };
    setSession(prev => {
      if (!prev) return prev;
      return {
        ...prev,
        dialogues: [...prev.dialogues, choiceDialogue],
        buffValues: applyChoiceBuff(prev.buffValues, choice),
      };
    });
    setPendingChoices(null);

    // 用户主动离开当前家具：直接跳到下一个目标
    // 其它 action 也沿用同一个流程（一个家具一轮对话）
    window.setTimeout(() => {
      const s = sessionRef.current;
      if (!s) return;
      const layout = homeState.rooms.find(r => r.roomId === s.currentRoom);
      const next = pickNextTarget(s, layout);
      setTarget(next);
    }, 260);
  }, [session, homeState.rooms]);

  // ─── 立即结束潜行 ─────────────────────────────────────
  const handleUserExit = useCallback(() => {
    // 清空队列和选项，走结算流程
    setDialogueQueue([]);
    setCurrentDialogue(null);
    setPendingChoices(null);
    setTarget(null);
    handleExit();
  }, [handleExit]);

  // ─── 自动前进：队列清空 + 无选项 + 不在读取/行走/转场 → 选下一个目标 ───
  useEffect(() => {
    if (!session || showResult) return;
    if (currentDialogue || dialogueQueue.length > 0) return;
    if (pendingChoices && pendingChoices.length > 0) return;
    if (isLoadingRef.current) return;
    if (charWalking) return;
    if (transitionState !== 'idle') return;
    if (target) return;
    if (session.phase === 'outro') return;

    // 需要一点延迟，让"▼/◆"提示有时间展示
    const t = window.setTimeout(() => {
      const s = sessionRef.current;
      if (!s) return;
      const layout = homeState.rooms.find(r => r.roomId === s.currentRoom);
      const next = pickNextTarget(s, layout);
      setTarget(next);
    }, 400);
    return () => window.clearTimeout(t);
  }, [currentDialogue, dialogueQueue.length, pendingChoices, charWalking, transitionState, target, showResult, homeState.rooms, session?.phase, session?.currentRoom, session]);

  // ═══════════════════════════════════════════════════════
  // RENDER
  // ═══════════════════════════════════════════════════════

  // ─── 结算界面 ─────────────────────────────────────────
  if (showResult) {
    return (
      <div className="h-full w-full flex flex-col items-center justify-center bg-slate-950 p-6">
        <div className="max-w-sm w-full space-y-6 text-center">
          <div className="text-3xl">✨</div>
          <h2 className="text-lg font-bold text-slate-100">记忆潜行结束</h2>
          <div className="text-xs text-slate-400">
            探索了 {showResult.visitedRooms.length} 个房间 · {showResult.totalDialogues} 段对话
          </div>
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

  if (!session) {
    return (
      <div className="h-full w-full flex items-center justify-center bg-slate-950">
        <span className="text-xs text-slate-500">正在下沉……</span>
      </div>
    );
  }

  // ─── 主界面（3DS 风格双屏） ───────────────────────────
  const meta = ROOM_META[session.currentRoom];

  return (
    <div className="h-full w-full flex flex-col bg-slate-950 overflow-hidden select-none">
      {/* 顶栏（薄） */}
      <div className="shrink-0 flex items-center justify-between px-3 pt-11 pb-1.5 bg-black/70 backdrop-blur-sm border-b border-slate-800 z-20">
        <div className="flex items-center gap-1">
          <button onClick={handleUserExit}
            className="p-1.5 -ml-1 rounded-sm hover:bg-slate-700/60 active:scale-90 transition-all"
            aria-label="结束潜行"
          >
            <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" strokeWidth={2} stroke="currentColor" className="w-4 h-4 text-slate-300">
              <path strokeLinecap="round" strokeLinejoin="round" d="M15.75 19.5 8.25 12l7.5-7.5" />
            </svg>
          </button>
          <span className="text-[10px] font-bold text-violet-300 ml-0.5">
            🌀 {meta.emoji} {meta.name}
          </span>
        </div>
        <div className="flex items-center gap-1.5">
          {(Object.entries(session.buffValues) as [keyof DiveBuffValues, number][]).map(([key, val]) =>
            val > 0 ? (
              <span key={key} className="text-[9px] text-slate-400" title={BUFF_META[key].label}>
                {BUFF_META[key].icon}{Math.round(val * 10) / 10}
              </span>
            ) : null
          )}
        </div>
      </div>

      {/* 上屏：像素房间（flex-1） */}
      <div className="flex-1 min-h-0 relative border-b-2 border-slate-800">
        <MemoryDiveRoom
          roomId={session.currentRoom}
          layout={currentRoomLayout}
          assets={assets}
          charSprite={charSprite}
          playerSprite={playerSprite}
          charName={charName}
          userName={userName}
          charPos={session.charPos}
          playerPos={session.playerPos}
          visitedSlots={visitedSlots}
          charWalking={charWalking}
          charFlip={charFlip}
          walkStep={walkStep}
          highlightedSlotId={highlightedSlotId}
          transitionState={transitionState}
        />
      </div>

      {/* 下屏：3DS 风格对话框 */}
      <MemoryDiveDialogue
        current={currentDialogue}
        queueRemaining={dialogueQueue.length}
        pendingChoices={pendingChoices}
        charName={charName}
        charSprite={charSprite}
        isLoading={session.isLoading}
        disabled={charWalking || transitionState !== 'idle'}
        onAdvance={advanceDialogue}
        onChoice={handleChoice}
      />
    </div>
  );
};

export default MemoryDiveMode;

