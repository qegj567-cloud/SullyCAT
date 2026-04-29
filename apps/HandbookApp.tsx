/**
 * 手账主编排
 *
 * 视觉/UI 拆分到 components/handbook/*：
 *   - HandbookCover       列表"封面 + 书签"
 *   - HandbookDayView     当日"翻开的活页本"（左侧装订环 + 纸张感）
 *   - HandbookPageCard    单页（胶带 + 倾斜便签）
 *   - HandbookCharPicker  生成前的角色筛选 bottom sheet
 *   - paper.ts            纸张原语 + 装饰小部件
 *
 * 这里只放 state、handlers、整体壳。
 */

import React, { useState, useEffect, useMemo, useCallback } from 'react';
import { useOS } from '../context/OSContext';
import { DB } from '../utils/db';
import { HandbookEntry, HandbookPage, Tracker } from '../types';
import {
    generateUserDiaryPage, generateLifestreamPage, generatePageLayout,
    findCharactersWithChatToday, pickLifestreamChars, getLocalDateStr,
    countUserMsgsToday, planFragmentBudget,
    LifestreamDepth,
} from '../utils/handbookGenerator';
import { ensureSeedTrackers } from '../utils/trackerSeeds';
import HandbookCover from '../components/handbook/HandbookCover';
import HandbookDayView from '../components/handbook/HandbookDayView';
import HandbookCharPicker from '../components/handbook/HandbookCharPicker';
import HandbookSideTabs, { HandbookSection } from '../components/handbook/HandbookSideTabs';
import TrackerSection from '../components/handbook/TrackerSection';
import TrackerCreateSheet from '../components/handbook/TrackerCreateSheet';
import { PAPER_TONES, SERIF_STACK, dayOfWeekZh, monthEn, dayNum } from '../components/handbook/paper';
import { CaretLeft, Plus, Sparkle } from '@phosphor-icons/react';

const HandbookApp: React.FC = () => {
    const { closeApp, characters, apiConfig, userProfile, addToast } = useOS();

    type View = 'list' | 'day';
    const [view, setView] = useState<View>('list');
    const [activeDate, setActiveDate] = useState<string>(getLocalDateStr());
    const [entries, setEntries] = useState<HandbookEntry[]>([]);
    const [loading, setLoading] = useState(true);
    const [editingPageId, setEditingPageId] = useState<string | null>(null);
    const [generating, setGenerating] = useState(false);
    const [regenPageId, setRegenPageId] = useState<string | null>(null);
    // 二次 LLM 排版状态(失败 → 显示在 DayView 上的报错条)
    const [layoutGenerating, setLayoutGenerating] = useState(false);
    const [layoutError, setLayoutError] = useState<string | null>(null);

    // 分区(今日 vs 各 tracker)
    const [activeSection, setActiveSection] = useState<HandbookSection>({ kind: 'today' });
    const [trackers, setTrackers] = useState<Tracker[]>([]);
    const [showTrackerCreate, setShowTrackerCreate] = useState(false);

    // 角色选择面板
    const [showCharPicker, setShowCharPicker] = useState(false);
    const [chatCharIds, setChatCharIds] = useState<string[]>([]);
    const [excludedChatChars, setExcludedChatChars] = useState<Set<string>>(new Set());
    const [excludedLifeChars, setExcludedLifeChars] = useState<Set<string>>(new Set());

    // 角色生活流深度档位(localStorage 持久化)
    const [lifestreamDepth, setLifestreamDepth] = useState<LifestreamDepth>(() => {
        try {
            const saved = localStorage.getItem('handbook_lifestream_depth');
            if (saved === 'light' || saved === 'medium' || saved === 'deep') return saved;
        } catch {}
        return 'medium';
    });
    const updateLifestreamDepth = (d: LifestreamDepth) => {
        setLifestreamDepth(d);
        try { localStorage.setItem('handbook_lifestream_depth', d); } catch {}
    };

    // ─── 数据加载 ───────────────────────────────────────
    const refreshEntries = useCallback(async () => {
        const all = await DB.getAllHandbooks();
        setEntries(all.sort((a, b) => b.date.localeCompare(a.date)));
        setLoading(false);
    }, []);

    const refreshTrackers = useCallback(async () => {
        await ensureSeedTrackers(); // 首次自动种"心情"作为示范
        const list = await DB.getAllTrackers();
        list.sort((a, b) => (a.sortOrder ?? 0) - (b.sortOrder ?? 0));
        setTrackers(list);
    }, []);

    useEffect(() => { refreshEntries(); refreshTrackers(); }, [refreshEntries, refreshTrackers]);

    const activeTracker = useMemo(() => {
        if (activeSection.kind !== 'tracker') return null;
        return trackers.find(t => t.id === activeSection.trackerId) || null;
    }, [activeSection, trackers]);

    const activeEntry = useMemo(
        () => entries.find(e => e.date === activeDate) || null,
        [entries, activeDate],
    );
    const todayEntry = useMemo(
        () => entries.find(e => e.date === getLocalDateStr()) || null,
        [entries],
    );
    const lifestreamCandidates = useMemo(() => pickLifestreamChars(characters), [characters]);

    // ─── 写入 entry 助手 ────────────────────────────────
    const upsertEntry = useCallback(async (date: string, mutate: (e: HandbookEntry) => HandbookEntry) => {
        const existing = await DB.getHandbook(date);
        const base: HandbookEntry = existing || { id: date, date, pages: [], updatedAt: Date.now() };
        const next = { ...mutate(base), updatedAt: Date.now() };
        await DB.saveHandbook(next);
        await refreshEntries();
        return next;
    }, [refreshEntries]);

    // ─── 打开"生成今日"面板 ─────────────────────────
    const openGeneratePicker = async () => {
        const chatted = await findCharactersWithChatToday(characters, activeDate);
        setChatCharIds(chatted);
        setExcludedChatChars(new Set());
        setExcludedLifeChars(new Set());
        setShowCharPicker(true);
    };

    // ─── 执行生成 ─────────────────────────────────────
    const runGenerate = async () => {
        setShowCharPicker(false);
        if (!apiConfig.apiKey || !apiConfig.baseUrl) {
            addToast('请先在设置里配置主 API', 'error');
            return;
        }
        setGenerating(true);
        try {
            const selectedChat = chatCharIds.filter(id => !excludedChatChars.has(id));
            const selectedLife = lifestreamCandidates.filter(c => !excludedLifeChars.has(c.id));

            // ─── 篇幅预算: 一天 ≤ 2 页, ~14 片 ────────────
            //  user 多话 → user 多写 char 少陪
            //  user 少话 → char 来撑场
            const totalUserMsgs = await countUserMsgsToday(selectedChat, activeDate);
            const budget = planFragmentBudget(totalUserMsgs, selectedChat, selectedLife);

            const newPages: HandbookPage[] = [];
            if (selectedChat.length > 0 && budget.userBudget > 0) {
                const r = await generateUserDiaryPage({
                    date: activeDate, selectedCharIds: selectedChat,
                    characters, userProfile, apiConfig,
                    fragmentBudget: budget.userBudget,
                });
                if (r.page) newPages.push(r.page);
                else if (r.totalUserMsgs === 0) addToast('今天还没和谁说过话——只生成角色的小生活', 'info');
                else addToast('日记生成失败,仅生成角色生活流', 'error');
            }

            const lifeResults = await Promise.all(
                selectedLife.map(c => generateLifestreamPage(
                    c, activeDate, userProfile, apiConfig, lifestreamDepth,
                    budget.perChar[c.id] ?? 0,
                )),
            );
            for (const p of lifeResults) if (p) newPages.push(p);

            if (newPages.length === 0) {
                addToast('什么都没生成出来 :( 检查 API 配置或重试', 'error');
                return;
            }

            // 替换同类型 LLM 旧页面，保留 user 编辑过的页
            const updated = await upsertEntry(activeDate, prev => {
                const kept = prev.pages.filter(p => {
                    if (p.generatedBy !== 'llm') return true;
                    if (p.type === 'user_diary' && newPages.some(np => np.type === 'user_diary')) return false;
                    if (p.type === 'character_life' && newPages.some(np => np.type === 'character_life' && np.charId === p.charId)) return false;
                    return true;
                });
                // 内容变了就废掉旧 layout, 后续自动跑排版
                return { ...prev, pages: [...kept, ...newPages], layouts: [], generatedAt: Date.now() };
            });

            setView('day');
            addToast(`生成了 ${newPages.length} 页`, 'success');

            // 紧接着自动跑一次排版(失败不兜底,user 可点重试)
            await runLayoutPass(updated.date);
        } finally {
            setGenerating(false);
        }
    };

    // ─── 二次 LLM 排版调用 ────────────────────────────
    const runLayoutPass = useCallback(async (date: string) => {
        if (!apiConfig.apiKey || !apiConfig.baseUrl) {
            setLayoutError('请先在设置里配置主 API');
            return;
        }
        const existing = await DB.getHandbook(date);
        if (!existing || existing.pages.length === 0) return;
        setLayoutGenerating(true);
        setLayoutError(null);
        try {
            const layouts = await generatePageLayout({
                date, pages: existing.pages, characters, userProfile, apiConfig,
            });
            await upsertEntry(date, prev => ({ ...prev, layouts }));
        } catch (e: any) {
            const msg = e?.message ? String(e.message) : '排版失败';
            setLayoutError(msg);
            addToast(`排版失败: ${msg}`, 'error');
        } finally {
            setLayoutGenerating(false);
        }
    }, [apiConfig, characters, userProfile, upsertEntry, addToast]);

    // ─── 单页操作 ───────────────────────────────────────
    // 任何 page 结构性变化都会清掉 layouts,user 自己点"排版"重做
    const updatePage = async (pageId: string, mutator: (p: HandbookPage) => HandbookPage) => {
        await upsertEntry(activeDate, prev => ({
            ...prev,
            pages: prev.pages.map(p => p.id === pageId ? mutator(p) : p),
            layouts: [],
        }));
        setLayoutError(null);
    };

    const handleSavePage = async (pageId: string, newContent: string, newPaperStyle?: string) => {
        await updatePage(pageId, p => ({
            ...p,
            content: newContent,
            paperStyle: newPaperStyle ?? p.paperStyle,
            // 编辑后清空碎片 → 回退到段落形态(user 改写之后不再是 LLM 的 fragments 结构)
            fragments: undefined,
            generatedBy: p.generatedBy === 'llm' ? 'user' : p.generatedBy,
        }));
        setEditingPageId(null);
    };

    const handleDeletePage = async (pageId: string) => {
        if (!confirm('撕掉这页?')) return;
        await upsertEntry(activeDate, prev => ({
            ...prev,
            pages: prev.pages.filter(p => p.id !== pageId),
            layouts: [],
        }));
        setLayoutError(null);
    };

    const handleToggleExclude = async (pageId: string) => {
        await updatePage(pageId, p => ({ ...p, excluded: !p.excluded }));
    };

    const handleRegenerateLifestream = async (page: HandbookPage) => {
        if (!page.charId) return;
        const char = characters.find(c => c.id === page.charId);
        if (!char) return;
        setRegenPageId(page.id);
        try {
            // 重生单页时也尊重预算: 沿用原页面 fragment 数(±1) 让 LLM 写差不多多的
            const oldCount = page.fragments?.length;
            const fresh = await generateLifestreamPage(
                char, activeDate, userProfile, apiConfig, lifestreamDepth,
                oldCount && oldCount > 0 ? oldCount : undefined,
            );
            if (!fresh) { addToast('重新生成失败', 'error'); return; }
            await updatePage(page.id, () => ({ ...fresh, id: page.id }));
            addToast(`${char.name} · 小生活已刷新`, 'success');
        } finally {
            setRegenPageId(null);
        }
    };

    const handleAddNote = async () => {
        const newPage: HandbookPage = {
            id: `note-${Date.now()}`, type: 'user_note', content: '',
            paperStyle: 'dot', generatedBy: 'user', generatedAt: Date.now(),
        };
        await upsertEntry(activeDate, prev => ({
            ...prev,
            pages: [...prev.pages, newPage],
            layouts: [],
        }));
        setLayoutError(null);
        setEditingPageId(newPage.id);
    };

    // ─── 顶栏 ───────────────────────────────────────────
    const handleBack = () => {
        // 在 tracker → 回今日;day → 回封面;封面 → 关 app
        if (activeSection.kind === 'tracker') {
            setActiveSection({ kind: 'today' });
            return;
        }
        if (view === 'day') {
            setView('list');
            return;
        }
        closeApp();
    };

    const renderHeader = () => (
        <div
            className="flex items-center justify-between px-4 pt-12 pb-2 shrink-0"
            style={{ background: 'transparent' }}
        >
            <button
                onClick={handleBack}
                className="w-9 h-9 flex items-center justify-center rounded-full active:scale-95 transition"
                style={{ background: 'rgba(253,246,231,0.7)', color: PAPER_TONES.ink }}
            >
                <CaretLeft className="w-4 h-4" weight="bold" />
            </button>
            <div className="text-center" style={SERIF_STACK}>
                {activeSection.kind === 'tracker' && activeTracker ? (
                    <>
                        <div className="text-[9px] tracking-[0.4em]" style={{ color: PAPER_TONES.inkSoft }}>
                            TRACKER
                        </div>
                        <div className="text-[14px] font-bold" style={{ color: PAPER_TONES.ink }}>
                            {activeTracker.icon ? `${activeTracker.icon} ` : ''}{activeTracker.name}
                        </div>
                    </>
                ) : view === 'list' ? (
                    <>
                        <div className="text-[9px] tracking-[0.4em]" style={{ color: PAPER_TONES.inkSoft }}>
                            HANDBOOK
                        </div>
                        <div className="text-[14px] font-bold" style={{ color: PAPER_TONES.ink }}>
                            手账
                        </div>
                    </>
                ) : (
                    <>
                        <div className="text-[9px] tracking-[0.4em]" style={{ color: PAPER_TONES.inkSoft }}>
                            {monthEn(activeDate)}
                        </div>
                        <div className="text-[14px] font-bold" style={{ color: PAPER_TONES.ink }}>
                            {dayNum(activeDate)} · 周{dayOfWeekZh(activeDate)}
                        </div>
                    </>
                )}
            </div>
            {activeSection.kind === 'today' && view === 'day' ? (
                <button
                    onClick={handleAddNote}
                    title="自己写一页"
                    className="w-9 h-9 flex items-center justify-center rounded-full active:scale-95 transition"
                    style={{ background: 'rgba(253,246,231,0.7)', color: PAPER_TONES.ink }}
                >
                    <Plus className="w-4 h-4" weight="bold" />
                </button>
            ) : (
                <div className="w-9 h-9" />
            )}
        </div>
    );

    // ─── 当日视图底部"书签条" ────────────────────────
    const renderDayBookmarks = () => {
        if (activeSection.kind !== 'today' || view !== 'day') return null;
        return (
            <div className="absolute bottom-5 left-0 right-0 px-5 flex justify-center pointer-events-none">
                <div
                    className="pointer-events-auto flex items-center gap-1 rounded-full px-2 py-2"
                    style={{
                        background: 'rgba(253,246,231,0.96)',
                        boxShadow: '0 4px 14px -4px rgba(58,47,37,0.25), 0 0 0 1px rgba(168,140,100,0.15)',
                        backdropFilter: 'blur(6px)',
                    }}
                >
                    <button
                        onClick={openGeneratePicker}
                        disabled={generating}
                        className="flex items-center gap-1.5 px-4 py-2 rounded-full text-[12px] active:scale-95 transition disabled:opacity-50"
                        style={{
                            ...SERIF_STACK,
                            background: PAPER_TONES.cover,
                            color: '#fdf6e7',
                            boxShadow: '0 1px 3px rgba(0,0,0,0.15)',
                        }}
                    >
                        <Sparkle weight="fill" className="w-3 h-3" />
                        {generating ? '正在落笔…' : (activeEntry ? '再写一份' : '让 AI 替我写')}
                    </button>
                    <button
                        onClick={handleAddNote}
                        className="flex items-center gap-1 px-3 py-2 rounded-full text-[12px] active:scale-95 transition"
                        style={{
                            ...SERIF_STACK,
                            color: PAPER_TONES.ink,
                            border: `1px solid ${PAPER_TONES.spine}`,
                        }}
                    >
                        <Plus className="w-3 h-3" weight="bold" />
                        手写
                    </button>
                </div>
            </div>
        );
    };

    const chatCharObjs = chatCharIds
        .map(id => characters.find(c => c.id === id))
        .filter(Boolean) as typeof characters;

    return (
        <div
            className="absolute inset-0 flex flex-col overflow-hidden"
            style={{ background: PAPER_TONES.paperCool }}
        >
            {renderHeader()}
            {loading ? (
                <div
                    className="flex-1 flex items-center justify-center text-sm"
                    style={{ ...SERIF_STACK, color: PAPER_TONES.inkSoft }}
                >
                    翻开中…
                </div>
            ) : activeSection.kind === 'tracker' && activeTracker ? (
                <TrackerSection
                    tracker={activeTracker}
                    onAddToast={(msg, type) => addToast(msg, type)}
                />
            ) : view === 'list' ? (
                <HandbookCover
                    today={getLocalDateStr()}
                    todayEntry={todayEntry}
                    entries={entries}
                    userName={userProfile.name || '我'}
                    generating={generating}
                    onGenerateToday={() => {
                        setActiveDate(getLocalDateStr());
                        openGeneratePicker();
                    }}
                    onOpenDate={(date) => {
                        setActiveDate(date);
                        setView('day');
                    }}
                />
            ) : (
                <HandbookDayView
                    date={activeDate}
                    entry={activeEntry}
                    characters={characters}
                    editingPageId={editingPageId}
                    regenPageId={regenPageId}
                    onStartEdit={setEditingPageId}
                    onSavePage={handleSavePage}
                    onCancelEdit={() => setEditingPageId(null)}
                    onToggleExclude={handleToggleExclude}
                    onDeletePage={handleDeletePage}
                    onRegenerateLifestream={handleRegenerateLifestream}
                    onGenerateLayout={() => runLayoutPass(activeDate)}
                    layoutGenerating={layoutGenerating}
                    layoutError={layoutError}
                />
            )}
            {renderDayBookmarks()}

            {/* 右侧活页本侧边 tab */}
            {!loading && (
                <HandbookSideTabs
                    activeSection={activeSection}
                    trackers={trackers}
                    onSwitch={setActiveSection}
                    onAddTracker={() => setShowTrackerCreate(true)}
                />
            )}
            <TrackerCreateSheet
                visible={showTrackerCreate}
                existingTrackers={trackers}
                onCancel={() => setShowTrackerCreate(false)}
                onCreated={async (tracker) => {
                    await refreshTrackers();
                    setShowTrackerCreate(false);
                    setActiveSection({ kind: 'tracker', trackerId: tracker.id });
                    addToast(`「${tracker.name}」已添加 ♡`, 'success');
                }}
            />
            <HandbookCharPicker
                visible={showCharPicker}
                chatChars={chatCharObjs}
                lifeChars={lifestreamCandidates}
                excludedChat={excludedChatChars}
                excludedLife={excludedLifeChars}
                onToggleChat={(id) => setExcludedChatChars(prev => {
                    const n = new Set(prev);
                    if (n.has(id)) n.delete(id); else n.add(id);
                    return n;
                })}
                onToggleLife={(id) => setExcludedLifeChars(prev => {
                    const n = new Set(prev);
                    if (n.has(id)) n.delete(id); else n.add(id);
                    return n;
                })}
                onCancel={() => setShowCharPicker(false)}
                onConfirm={runGenerate}
                generating={generating}
                depth={lifestreamDepth}
                onDepthChange={updateLifestreamDepth}
            />
        </div>
    );
};

export default HandbookApp;
