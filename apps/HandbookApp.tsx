import React, { useState, useEffect, useMemo, useCallback } from 'react';
import { useOS } from '../context/OSContext';
import { DB } from '../utils/db';
import {
    HandbookEntry, HandbookPage, HandbookPageType, CharacterProfile,
} from '../types';
import {
    generateUserDiaryPage, generateLifestreamPage,
    findCharactersWithChatToday, pickLifestreamChars, getLocalDateStr,
} from '../utils/handbookGenerator';
import {
    CaretLeft, Plus, Sparkle, PencilSimple, Trash, Eye, EyeSlash,
    ArrowsClockwise, Notebook,
} from '@phosphor-icons/react';

// ─── Paper styles (轻量自包含，沿用 JournalApp 视觉惯例) ────
const PAPER_STYLES: Record<string, { bg: string; text: string; style?: React.CSSProperties }> = {
    plain: { bg: 'bg-white', text: 'text-slate-700' },
    grid:  { bg: 'bg-white', text: 'text-slate-700',
        style: { backgroundImage: 'linear-gradient(#eef2ff 1px, transparent 1px), linear-gradient(90deg, #eef2ff 1px, transparent 1px)', backgroundSize: '20px 20px' } },
    dot:   { bg: 'bg-[#fffdf5]', text: 'text-slate-700',
        style: { backgroundImage: 'radial-gradient(#e7e5e4 1px, transparent 1px)', backgroundSize: '20px 20px' } },
    lined: { bg: 'bg-[#fefce8]', text: 'text-slate-700',
        style: { backgroundImage: 'repeating-linear-gradient(transparent, transparent 23px, #fde68a 23px, #fde68a 24px)' } },
    pink:  { bg: 'bg-pink-50', text: 'text-slate-700',
        style: { backgroundImage: 'radial-gradient(#fbcfe8 1.5px, transparent 1.5px)', backgroundSize: '28px 28px' } },
};
const PAPER_ORDER = ['plain', 'grid', 'lined', 'dot', 'pink'] as const;

// ─── 中文星期 ───
const dayOfWeekZh = (date: string): string => {
    const d = new Date(date.replace(/-/g, '/'));
    return ['日', '一', '二', '三', '四', '五', '六'][d.getDay()];
};

const formatDateLabel = (date: string): string => {
    const today = getLocalDateStr();
    const yesterday = (() => {
        const d = new Date();
        d.setDate(d.getDate() - 1);
        return getLocalDateStr(d);
    })();
    if (date === today) return `今天 · ${date.slice(5)}`;
    if (date === yesterday) return `昨天 · ${date.slice(5)}`;
    return `${date.slice(5)} · 周${dayOfWeekZh(date)}`;
};

// ─── 单页卡片 ──────────────────────────────────────────────
interface PageCardProps {
    page: HandbookPage;
    char?: CharacterProfile;
    isEditing: boolean;
    onStartEdit: () => void;
    onSave: (newContent: string) => void;
    onCancel: () => void;
    onToggleExclude: () => void;
    onDelete: () => void;
    onRegenerate?: () => void;
    isRegenerating?: boolean;
}

const PageCard: React.FC<PageCardProps> = ({
    page, char, isEditing, onStartEdit, onSave, onCancel,
    onToggleExclude, onDelete, onRegenerate, isRegenerating,
}) => {
    const [draft, setDraft] = useState(page.content);
    useEffect(() => { setDraft(page.content); }, [page.content, isEditing]);

    const paper = PAPER_STYLES[page.paperStyle || 'plain'] || PAPER_STYLES.plain;

    const typeBadge = (() => {
        switch (page.type) {
            case 'user_diary':     return { label: '我的一天', color: 'bg-amber-100 text-amber-700' };
            case 'character_life': return { label: char ? `${char.name} · 小生活` : '小生活', color: 'bg-pink-100 text-pink-700' };
            case 'user_note':      return { label: '我写的', color: 'bg-sky-100 text-sky-700' };
            case 'free':           return { label: '便签', color: 'bg-slate-100 text-slate-600' };
        }
    })();

    return (
        <div
            className={`relative ${paper.bg} ${paper.text} rounded-2xl shadow-sm border border-black/5 px-4 py-3 mb-3 transition-all ${page.excluded ? 'opacity-40' : ''}`}
            style={paper.style}
        >
            {/* 顶部条：类型徽章 + 角色头像 + 操作 */}
            <div className="flex items-center justify-between mb-2">
                <div className="flex items-center gap-2 min-w-0">
                    {char && page.type === 'character_life' && (
                        <img src={char.avatar} alt={char.name} className="w-6 h-6 rounded-full object-cover ring-1 ring-black/10 shrink-0" />
                    )}
                    <span className={`px-2 py-0.5 rounded-full text-[10px] font-bold ${typeBadge.color}`}>
                        {typeBadge.label}
                    </span>
                    {page.generatedBy === 'llm' && (
                        <span className="text-[9px] text-slate-400 font-mono">AI 草稿</span>
                    )}
                </div>
                <div className="flex items-center gap-1 text-slate-400 shrink-0">
                    {onRegenerate && !isEditing && (
                        <button
                            onClick={onRegenerate}
                            disabled={isRegenerating}
                            className="p-1.5 hover:bg-black/5 rounded-full active:scale-95 transition disabled:opacity-40"
                            title="重新生成"
                        >
                            <ArrowsClockwise className={`w-3.5 h-3.5 ${isRegenerating ? 'animate-spin' : ''}`} />
                        </button>
                    )}
                    {!isEditing && (
                        <button onClick={onStartEdit} className="p-1.5 hover:bg-black/5 rounded-full active:scale-95 transition" title="编辑">
                            <PencilSimple className="w-3.5 h-3.5" />
                        </button>
                    )}
                    <button onClick={onToggleExclude} className="p-1.5 hover:bg-black/5 rounded-full active:scale-95 transition" title={page.excluded ? '入册' : '不入册'}>
                        {page.excluded ? <EyeSlash className="w-3.5 h-3.5" /> : <Eye className="w-3.5 h-3.5" />}
                    </button>
                    <button onClick={onDelete} className="p-1.5 hover:bg-rose-50 hover:text-rose-500 rounded-full active:scale-95 transition" title="删除此页">
                        <Trash className="w-3.5 h-3.5" />
                    </button>
                </div>
            </div>

            {/* 正文 */}
            {isEditing ? (
                <>
                    <textarea
                        value={draft}
                        onChange={e => setDraft(e.target.value)}
                        className="w-full bg-transparent outline-none resize-none text-[14px] leading-7 min-h-[120px]"
                        autoFocus
                    />
                    <div className="flex justify-end gap-2 mt-2">
                        <button onClick={onCancel} className="px-3 py-1 text-xs rounded-full bg-slate-100 text-slate-500 active:scale-95 transition">
                            取消
                        </button>
                        <button onClick={() => onSave(draft)} className="px-3 py-1 text-xs rounded-full bg-slate-800 text-white active:scale-95 transition">
                            存
                        </button>
                    </div>
                </>
            ) : (
                <p className="whitespace-pre-wrap text-[14px] leading-7 break-words">
                    {page.content || <span className="text-slate-300 italic">(空白)</span>}
                </p>
            )}
        </div>
    );
};

// ─── 主组件 ────────────────────────────────────────────────
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

    // 角色选择面板（生成今日之前可调）
    const [showCharPicker, setShowCharPicker] = useState(false);
    const [chatCharIds, setChatCharIds] = useState<string[]>([]);
    const [excludedChatChars, setExcludedChatChars] = useState<Set<string>>(new Set());
    const [excludedLifeChars, setExcludedLifeChars] = useState<Set<string>>(new Set());

    // ─── 数据加载 ───────────────────────────────────────
    const refreshEntries = useCallback(async () => {
        const all = await DB.getAllHandbooks();
        setEntries(all.sort((a, b) => b.date.localeCompare(a.date)));
        setLoading(false);
    }, []);

    useEffect(() => { refreshEntries(); }, [refreshEntries]);

    const activeEntry = useMemo(
        () => entries.find(e => e.date === activeDate) || null,
        [entries, activeDate],
    );

    const lifestreamCandidates = useMemo(() => pickLifestreamChars(characters), [characters]);

    // ─── 写入 entry 助手 ────────────────────────────────
    const upsertEntry = useCallback(async (date: string, mutate: (e: HandbookEntry) => HandbookEntry) => {
        const existing = await DB.getHandbook(date);
        const base: HandbookEntry = existing || {
            id: date, date, pages: [], updatedAt: Date.now(),
        };
        const next = { ...mutate(base), updatedAt: Date.now() };
        await DB.saveHandbook(next);
        await refreshEntries();
        return next;
    }, [refreshEntries]);

    // ─── 打开"生成今日"面板：先扫描今天聊过的角色 ─────
    const openGeneratePicker = async () => {
        const chatted = await findCharactersWithChatToday(characters, activeDate);
        setChatCharIds(chatted);
        setExcludedChatChars(new Set());
        setExcludedLifeChars(new Set());
        setShowCharPicker(true);
    };

    // ─── 执行生成：user 视角页 + 各 lifestyle 角色生活流页 ─
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

            // 1. user 视角页（仅当今天有聊天时）
            let newPages: HandbookPage[] = [];
            if (selectedChat.length > 0) {
                const r = await generateUserDiaryPage({
                    date: activeDate,
                    selectedCharIds: selectedChat,
                    characters,
                    userProfile,
                    apiConfig,
                });
                if (r.page) {
                    newPages.push(r.page);
                } else if (r.totalUserMsgs === 0) {
                    addToast('今天还没和谁说过话——只生成角色的小生活', 'info');
                } else {
                    addToast('日记生成失败，仅生成角色生活流', 'error');
                }
            }

            // 2. 生活系角色：每个独立生成一段
            const lifeResults = await Promise.all(
                selectedLife.map(c => generateLifestreamPage(c, activeDate, userProfile, apiConfig)),
            );
            for (const p of lifeResults) {
                if (p) newPages.push(p);
            }

            if (newPages.length === 0) {
                addToast('什么都没生成出来 :( 检查 API 配置或重试', 'error');
                return;
            }

            // 3. 合并到今天的 entry —— 同类型的旧页移到末尾或替换？
            //    策略：替换同类型同 charId 的旧 LLM 页面（user 不会想看一堆相似草稿堆叠），
            //    但保留 user_note / 用户编辑过的页 (generatedBy='user')
            await upsertEntry(activeDate, prev => {
                const kept = prev.pages.filter(p => {
                    if (p.generatedBy !== 'llm') return true;
                    // 替换 user_diary 全部
                    if (p.type === 'user_diary' && newPages.some(np => np.type === 'user_diary')) return false;
                    // 替换同 charId 的 character_life
                    if (p.type === 'character_life' && newPages.some(np => np.type === 'character_life' && np.charId === p.charId)) return false;
                    return true;
                });
                return {
                    ...prev,
                    pages: [...kept, ...newPages],
                    generatedAt: Date.now(),
                };
            });

            setView('day');
            addToast(`生成了 ${newPages.length} 页`, 'success');
        } finally {
            setGenerating(false);
        }
    };

    // ─── 单页编辑/删除/排除 ────────────────────────────
    const updatePage = async (pageId: string, mutator: (p: HandbookPage) => HandbookPage) => {
        await upsertEntry(activeDate, prev => ({
            ...prev,
            pages: prev.pages.map(p => p.id === pageId ? mutator(p) : p),
        }));
    };

    const handleSavePage = async (pageId: string, newContent: string) => {
        await updatePage(pageId, p => ({
            ...p,
            content: newContent,
            generatedBy: p.generatedBy === 'llm' ? 'user' : p.generatedBy,
        }));
        setEditingPageId(null);
    };

    const handleDeletePage = async (pageId: string) => {
        if (!confirm('删除这页？')) return;
        await upsertEntry(activeDate, prev => ({
            ...prev,
            pages: prev.pages.filter(p => p.id !== pageId),
        }));
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
            const fresh = await generateLifestreamPage(char, activeDate, userProfile, apiConfig);
            if (!fresh) {
                addToast('重新生成失败', 'error');
                return;
            }
            await updatePage(page.id, () => ({ ...fresh, id: page.id }));
            addToast(`${char.name} · 小生活已刷新`, 'success');
        } finally {
            setRegenPageId(null);
        }
    };

    // ─── 手写一页 ───────────────────────────────────────
    const handleAddNote = async () => {
        const newPage: HandbookPage = {
            id: `note-${Date.now()}`,
            type: 'user_note',
            content: '',
            paperStyle: 'plain',
            generatedBy: 'user',
            generatedAt: Date.now(),
        };
        await upsertEntry(activeDate, prev => ({ ...prev, pages: [...prev.pages, newPage] }));
        setEditingPageId(newPage.id);
    };

    // ─── 列表视图 ──────────────────────────────────────
    const renderListView = () => (
        <div className="flex-1 overflow-y-auto px-5 pt-3 pb-24">
            {/* 今日卡片 */}
            <div className="bg-white/85 backdrop-blur-sm rounded-3xl shadow-sm border border-black/5 px-5 py-5 mb-4">
                <div className="flex items-center gap-2 mb-1">
                    <span className="text-[11px] font-bold text-fuchsia-600 tracking-wide">TODAY</span>
                    <span className="text-[11px] text-slate-400">{getLocalDateStr()} · 周{dayOfWeekZh(getLocalDateStr())}</span>
                </div>
                <div className="text-base font-bold text-slate-800 mb-3">
                    {entries.find(e => e.date === getLocalDateStr())
                        ? `今天已经有 ${entries.find(e => e.date === getLocalDateStr())?.pages.length} 页了`
                        : '今天还没翻开'}
                </div>
                <div className="flex gap-2">
                    <button
                        onClick={() => { setActiveDate(getLocalDateStr()); openGeneratePicker(); }}
                        disabled={generating}
                        className="flex-1 flex items-center justify-center gap-2 py-3 rounded-2xl bg-gradient-to-r from-fuchsia-500 to-pink-500 text-white text-sm font-bold shadow-md active:scale-95 transition disabled:opacity-50"
                    >
                        <Sparkle weight="fill" className="w-4 h-4" />
                        {generating ? '生成中…' : '📖 生成今日'}
                    </button>
                    <button
                        onClick={() => { setActiveDate(getLocalDateStr()); setView('day'); }}
                        className="px-4 py-3 rounded-2xl bg-slate-100 text-slate-700 text-sm font-bold active:scale-95 transition"
                    >
                        翻开
                    </button>
                </div>
            </div>

            {/* 时间线 */}
            <div className="text-[11px] text-slate-400 px-1 mb-2 tracking-wide">回望</div>
            {entries.length === 0 ? (
                <div className="text-center py-12 text-slate-400 text-sm">
                    <Notebook className="w-10 h-10 mx-auto mb-2 opacity-40" weight="thin" />
                    <div>还没有任何一页</div>
                    <div className="text-[11px] mt-1 opacity-70">没关系 · 想翻的时候再翻</div>
                </div>
            ) : (
                <div className="space-y-2">
                    {entries.map(e => {
                        const preview = e.pages.find(p => !p.excluded)?.content?.slice(0, 60) || '';
                        const visiblePageCount = e.pages.filter(p => !p.excluded).length;
                        return (
                            <button
                                key={e.id}
                                onClick={() => { setActiveDate(e.date); setView('day'); }}
                                className="w-full text-left bg-white/70 hover:bg-white/95 rounded-2xl px-4 py-3 border border-black/5 active:scale-[0.99] transition"
                            >
                                <div className="flex items-center justify-between mb-1">
                                    <div className="text-sm font-bold text-slate-800">{formatDateLabel(e.date)}</div>
                                    <div className="text-[10px] text-slate-400">{visiblePageCount} 页</div>
                                </div>
                                {preview && (
                                    <div className="text-[12px] text-slate-500 line-clamp-2 leading-snug">
                                        {preview}{preview.length >= 60 ? '…' : ''}
                                    </div>
                                )}
                            </button>
                        );
                    })}
                </div>
            )}
        </div>
    );

    // ─── 当日视图 ──────────────────────────────────────
    const renderDayView = () => {
        const visiblePages = activeEntry?.pages || [];
        return (
            <div className="flex-1 overflow-y-auto px-4 pt-2 pb-28">
                {visiblePages.length === 0 ? (
                    <div className="text-center py-16 text-slate-400">
                        <Notebook className="w-10 h-10 mx-auto mb-2 opacity-40" weight="thin" />
                        <div className="text-sm">这一天还是空白</div>
                        <div className="text-[11px] mt-1 opacity-70">点下面的 ✨ 让 AI 替你写一份草稿</div>
                        <div className="text-[11px] opacity-70">或点 + 自己写一页</div>
                    </div>
                ) : (
                    visiblePages.map(p => (
                        <PageCard
                            key={p.id}
                            page={p}
                            char={p.charId ? characters.find(c => c.id === p.charId) : undefined}
                            isEditing={editingPageId === p.id}
                            onStartEdit={() => setEditingPageId(p.id)}
                            onSave={(content) => handleSavePage(p.id, content)}
                            onCancel={() => setEditingPageId(null)}
                            onToggleExclude={() => handleToggleExclude(p.id)}
                            onDelete={() => handleDeletePage(p.id)}
                            onRegenerate={p.type === 'character_life' ? () => handleRegenerateLifestream(p) : undefined}
                            isRegenerating={regenPageId === p.id}
                        />
                    ))
                )}
            </div>
        );
    };

    // ─── 角色筛选 modal ───────────────────────────────
    const renderCharPicker = () => {
        if (!showCharPicker) return null;
        const chatChars = chatCharIds.map(id => characters.find(c => c.id === id)).filter(Boolean) as CharacterProfile[];
        return (
            <div className="absolute inset-0 z-50 bg-black/40 backdrop-blur-sm flex items-end justify-center" onClick={() => setShowCharPicker(false)}>
                <div className="w-full bg-white rounded-t-3xl max-h-[85%] overflow-y-auto" onClick={e => e.stopPropagation()}>
                    <div className="px-5 pt-5 pb-3 border-b border-slate-100">
                        <div className="text-base font-bold text-slate-800">生成今日手账</div>
                        <div className="text-[11px] text-slate-400 mt-1">默认全部入册，可以单独勾掉不想入册的角色</div>
                    </div>

                    <div className="px-5 py-4">
                        {/* 我的一天：今天聊过的角色 */}
                        <div className="text-[11px] font-bold text-amber-600 mb-2 tracking-wide">我的一天 · 取材自</div>
                        {chatChars.length === 0 ? (
                            <div className="text-[12px] text-slate-400 py-2">今天还没和谁聊天</div>
                        ) : (
                            <div className="space-y-1.5 mb-4">
                                {chatChars.map(c => {
                                    const excluded = excludedChatChars.has(c.id);
                                    return (
                                        <button
                                            key={c.id}
                                            onClick={() => {
                                                setExcludedChatChars(prev => {
                                                    const n = new Set(prev);
                                                    if (n.has(c.id)) n.delete(c.id); else n.add(c.id);
                                                    return n;
                                                });
                                            }}
                                            className={`w-full flex items-center gap-3 px-3 py-2 rounded-xl border transition ${excluded ? 'bg-slate-50 border-slate-200 opacity-50' : 'bg-amber-50 border-amber-200'}`}
                                        >
                                            <img src={c.avatar} className="w-8 h-8 rounded-full object-cover" alt="" />
                                            <span className="flex-1 text-left text-sm text-slate-700">{c.name}</span>
                                            <span className={`text-[10px] font-bold ${excluded ? 'text-slate-400' : 'text-amber-700'}`}>
                                                {excluded ? '已排除' : '入册'}
                                            </span>
                                        </button>
                                    );
                                })}
                            </div>
                        )}

                        {/* 陪伴页：生活系角色 */}
                        <div className="text-[11px] font-bold text-pink-600 mb-2 tracking-wide">陪伴页 · 角色们的小生活</div>
                        {lifestreamCandidates.length === 0 ? (
                            <div className="text-[12px] text-slate-400 py-2">没有"生活系"角色——把角色 scheduleStyle 设成 lifestyle 后就会出现在这里</div>
                        ) : (
                            <div className="space-y-1.5">
                                {lifestreamCandidates.map(c => {
                                    const excluded = excludedLifeChars.has(c.id);
                                    return (
                                        <button
                                            key={c.id}
                                            onClick={() => {
                                                setExcludedLifeChars(prev => {
                                                    const n = new Set(prev);
                                                    if (n.has(c.id)) n.delete(c.id); else n.add(c.id);
                                                    return n;
                                                });
                                            }}
                                            className={`w-full flex items-center gap-3 px-3 py-2 rounded-xl border transition ${excluded ? 'bg-slate-50 border-slate-200 opacity-50' : 'bg-pink-50 border-pink-200'}`}
                                        >
                                            <img src={c.avatar} className="w-8 h-8 rounded-full object-cover" alt="" />
                                            <span className="flex-1 text-left text-sm text-slate-700">{c.name}</span>
                                            <span className={`text-[10px] font-bold ${excluded ? 'text-slate-400' : 'text-pink-700'}`}>
                                                {excluded ? '已排除' : '入册'}
                                            </span>
                                        </button>
                                    );
                                })}
                            </div>
                        )}
                    </div>

                    <div className="sticky bottom-0 bg-white border-t border-slate-100 px-5 py-3 flex gap-2">
                        <button
                            onClick={() => setShowCharPicker(false)}
                            className="px-4 py-3 rounded-2xl bg-slate-100 text-slate-600 text-sm font-bold active:scale-95 transition"
                        >
                            取消
                        </button>
                        <button
                            onClick={runGenerate}
                            disabled={generating || (chatChars.length === 0 && lifestreamCandidates.length === 0)}
                            className="flex-1 flex items-center justify-center gap-2 py-3 rounded-2xl bg-gradient-to-r from-fuchsia-500 to-pink-500 text-white text-sm font-bold shadow-md active:scale-95 transition disabled:opacity-50"
                        >
                            <Sparkle weight="fill" className="w-4 h-4" />
                            开始生成
                        </button>
                    </div>
                </div>
            </div>
        );
    };

    // ─── 顶栏 ───────────────────────────────────────────
    const renderHeader = () => (
        <div className="flex items-center justify-between px-4 pt-12 pb-2 shrink-0">
            <button
                onClick={() => view === 'day' ? setView('list') : closeApp()}
                className="w-9 h-9 flex items-center justify-center rounded-full bg-white/70 active:scale-95 transition"
            >
                <CaretLeft className="w-4 h-4 text-slate-700" weight="bold" />
            </button>
            <div className="text-center">
                <div className="text-[10px] text-slate-500 tracking-[0.3em] uppercase font-bold">Handbook</div>
                <div className="text-sm font-bold text-slate-800">
                    {view === 'list' ? '手账' : formatDateLabel(activeDate)}
                </div>
            </div>
            {view === 'day' ? (
                <button
                    onClick={handleAddNote}
                    className="w-9 h-9 flex items-center justify-center rounded-full bg-white/70 active:scale-95 transition"
                    title="自己写一页"
                >
                    <Plus className="w-4 h-4 text-slate-700" weight="bold" />
                </button>
            ) : (
                <div className="w-9 h-9" />
            )}
        </div>
    );

    // ─── 当日视图底部浮动按钮 ────────────────────────
    const renderDayFloatingBar = () => {
        if (view !== 'day') return null;
        return (
            <div className="absolute bottom-6 left-0 right-0 px-5 flex justify-center pointer-events-none">
                <div className="pointer-events-auto flex items-center gap-2 bg-white/95 backdrop-blur-xl rounded-full shadow-xl border border-black/5 px-2 py-2">
                    <button
                        onClick={openGeneratePicker}
                        disabled={generating}
                        className="flex items-center gap-2 px-4 py-2 rounded-full bg-gradient-to-r from-fuchsia-500 to-pink-500 text-white text-xs font-bold active:scale-95 transition disabled:opacity-50"
                    >
                        <Sparkle weight="fill" className="w-3.5 h-3.5" />
                        {generating ? '生成中…' : (activeEntry ? '重新生成' : '生成这一天')}
                    </button>
                    <button
                        onClick={handleAddNote}
                        className="flex items-center gap-1 px-3 py-2 rounded-full bg-slate-100 text-slate-700 text-xs font-bold active:scale-95 transition"
                    >
                        <Plus className="w-3.5 h-3.5" weight="bold" />
                        手写一页
                    </button>
                </div>
            </div>
        );
    };

    return (
        <div className="absolute inset-0 flex flex-col overflow-hidden bg-gradient-to-br from-fuchsia-50 via-white to-pink-50">
            {renderHeader()}
            {loading ? (
                <div className="flex-1 flex items-center justify-center text-slate-400 text-sm">加载中…</div>
            ) : view === 'list' ? renderListView() : renderDayView()}
            {renderDayFloatingBar()}
            {renderCharPicker()}
        </div>
    );
};

export default HandbookApp;
