
import React, { useState, useEffect } from 'react';
import Modal from '../os/Modal';
import { CharacterProfile, ApiPreset, APIConfig, CharacterBuff } from '../../types';

interface EmotionSettingsModalProps {
    isOpen: boolean;
    onClose: () => void;
    char: CharacterProfile;
    apiPresets: ApiPreset[];
    addApiPreset: (name: string, config: APIConfig) => void;
    onSave: (config: NonNullable<CharacterProfile['emotionConfig']>) => void;
    onClearBuffs: () => void;
}

const normalizeIntensity = (n: number | undefined | null): 1 | 2 | 3 => {
    const parsed = Number.isFinite(n) ? Math.round(Number(n)) : 2;
    if (parsed <= 1) return 1;
    if (parsed >= 3) return 3;
    return 2;
};

const INTENSITY_DOTS = (n: number | undefined | null) => {
    const safe = normalizeIntensity(n);
    return '●'.repeat(safe) + '○'.repeat(3 - safe);
};

const EmotionSettingsModal: React.FC<EmotionSettingsModalProps> = ({
    isOpen, onClose, char, apiPresets, addApiPreset, onSave, onClearBuffs
}) => {
    const [enabled, setEnabled] = useState(false);
    const [url, setUrl] = useState('');
    const [key, setKey] = useState('');
    const [model, setModel] = useState('');
    const [showSavePreset, setShowSavePreset] = useState(false);
    const [newPresetName, setNewPresetName] = useState('');

    // Sync form from char whenever modal opens
    useEffect(() => {
        if (!isOpen) return;
        const s = char.emotionConfig;
        setEnabled(s?.enabled ?? false);
        setUrl(s?.api?.baseUrl ?? '');
        setKey(s?.api?.apiKey ?? '');
        setModel(s?.api?.model ?? '');
        setShowSavePreset(false);
        setNewPresetName('');
    }, [isOpen, char.id, char.emotionConfig]);

    const loadPreset = (preset: ApiPreset) => {
        setUrl(preset.config.baseUrl);
        setKey(preset.config.apiKey);
        setModel(preset.config.model);
    };

    const handleSavePreset = () => {
        if (!newPresetName.trim()) return;
        addApiPreset(newPresetName.trim(), { baseUrl: url, apiKey: key, model });
        setNewPresetName('');
        setShowSavePreset(false);
    };

    const handleSave = () => {
        const api = url ? { baseUrl: url, apiKey: key, model } : undefined;
        onSave({ enabled, api });
        onClose();
    };

    const buffs: CharacterBuff[] = char.activeBuffs || [];

    return (
        <Modal isOpen={isOpen} title="情绪感知" onClose={onClose} footer={
            <>
                <button onClick={onClose} className="flex-1 py-3 bg-slate-100 text-slate-500 font-bold rounded-2xl active:scale-95 transition-transform">
                    取消
                </button>
                <button onClick={handleSave} className="flex-1 py-3 bg-pink-500 text-white font-bold rounded-2xl active:scale-95 transition-transform shadow-lg">
                    保存
                </button>
            </>
        }>
            <div className="space-y-5">
                <div className="text-xs text-slate-500 leading-relaxed space-y-1.5">
                    <p>
                        开启后，每次发送消息时与主 API <b>并行</b>调用一次副 API，
                        <b>同时产出两样东西</b>并注入下一次回复：
                    </p>
                    <ul className="pl-4 list-disc space-y-0.5 text-slate-500">
                        <li>角色当前的<b>情绪底色（buffs）</b>——焦虑/委屈/期待这些</li>
                        <li>角色的<b>意识流独白</b>——说完刚才那句话后脑子里真正在转的东西</li>
                    </ul>
                    <p className="text-slate-400">
                        作用范围：仅用于情绪感知 + 意识流。<b>不影响</b>记忆宫殿/向量化/主聊天。
                    </p>
                    <p className="text-amber-600 bg-amber-50 border border-amber-200 rounded-lg px-2 py-1.5">
                        ⚙️ 下方不填 URL 时会<b>自动回退到主 API</b> 跑情绪评估。
                        希望隔离账单 / 防止情绪任务污染主模型，就在这里填独立的 API。
                    </p>
                    <p className="text-slate-400">
                        💡 <b>模型建议</b>：情绪分析吃人物理解 &gt; 吃推理。推荐 <b>Claude 系列</b>（Haiku 4.5 / Sonnet 4.6 都行），
                        对角色语气、沉默的含义、反讽的把握明显优于 Gemini Flash 那一挂；
                        Gemini 容易输出流水线式的"用户当前情绪：焦虑"，情绪底色会变得机械。
                        如果看不懂这些参数，直接选<b>便宜的 Haiku / 4o-mini</b> 这一类就好，
                        别选带 thinking/reasoning 的型号——副 API 不需要推理，只需要体感。
                    </p>
                </div>

                {/* Enable Toggle */}
                <div className="flex items-center justify-between">
                    <span className="text-sm font-bold text-slate-700">启用情绪感知</span>
                    <button
                        onClick={() => setEnabled(!enabled)}
                        className={`w-12 h-7 rounded-full transition-colors relative ${enabled ? 'bg-pink-500' : 'bg-slate-200'}`}
                    >
                        <span className={`absolute top-0.5 left-0.5 w-6 h-6 bg-white rounded-full shadow transition-all duration-200 ${enabled ? 'translate-x-5' : 'translate-x-0'}`} />
                    </button>
                </div>

                {enabled && (
                    <>
                        {/* Preset chips */}
                        {apiPresets.length > 0 && (
                            <div>
                                <label className="text-[10px] font-bold text-slate-400 uppercase tracking-widest mb-2 block pl-1">我的预设</label>
                                <div className="flex gap-2 flex-wrap">
                                    {apiPresets.map(preset => (
                                        <button
                                            key={preset.id}
                                            onClick={() => loadPreset(preset)}
                                            className="flex items-center bg-white border border-slate-200 rounded-lg px-3 py-1 shadow-sm text-xs font-medium text-slate-600 hover:text-pink-500 hover:border-pink-200 active:scale-95 transition-all"
                                        >
                                            {preset.name}
                                            <span className="ml-1.5 text-slate-300">{preset.config.model}</span>
                                        </button>
                                    ))}
                                </div>
                            </div>
                        )}

                        {/* API fields — always visible, same layout as Settings */}
                        <div className="space-y-3">
                            <div className="flex items-center justify-between mb-0.5">
                                <label className="text-[10px] font-bold text-slate-400 uppercase tracking-widest pl-1">副 API 配置</label>
                                <button
                                    onClick={() => setShowSavePreset(!showSavePreset)}
                                    className="text-[10px] bg-slate-100 text-slate-600 px-3 py-1.5 rounded-full font-bold shadow-sm active:scale-95 transition-transform"
                                >
                                    保存为预设
                                </button>
                            </div>

                            {showSavePreset && (
                                <div className="flex gap-2">
                                    <input
                                        type="text"
                                        value={newPresetName}
                                        onChange={e => setNewPresetName(e.target.value)}
                                        onKeyDown={e => e.key === 'Enter' && handleSavePreset()}
                                        placeholder="预设名称..."
                                        className="flex-1 bg-white/50 border border-slate-200/60 rounded-xl px-3 py-2 text-sm focus:bg-white transition-all"
                                        autoFocus
                                    />
                                    <button
                                        onClick={handleSavePreset}
                                        className="px-4 py-2 bg-pink-500 text-white text-sm font-bold rounded-xl active:scale-95 transition-transform"
                                    >
                                        保存
                                    </button>
                                </div>
                            )}

                            <div>
                                <label className="text-[10px] font-bold text-slate-400 uppercase tracking-widest mb-1.5 block pl-1">URL</label>
                                <input
                                    type="text"
                                    value={url}
                                    onChange={e => setUrl(e.target.value)}
                                    placeholder="https://..."
                                    className="w-full bg-white/50 border border-slate-200/60 rounded-xl px-4 py-2.5 text-sm font-mono focus:bg-white transition-all"
                                />
                            </div>
                            <div>
                                <label className="text-[10px] font-bold text-slate-400 uppercase tracking-widest mb-1.5 block pl-1">Key</label>
                                <input
                                    type="password"
                                    value={key}
                                    onChange={e => setKey(e.target.value)}
                                    placeholder="sk-..."
                                    className="w-full bg-white/50 border border-slate-200/60 rounded-xl px-4 py-2.5 text-sm font-mono focus:bg-white transition-all"
                                />
                            </div>
                            <div>
                                <label className="text-[10px] font-bold text-slate-400 uppercase tracking-widest mb-1.5 block pl-1">Model</label>
                                <input
                                    type="text"
                                    value={model}
                                    onChange={e => setModel(e.target.value)}
                                    placeholder="claude-haiku-4-5 / gpt-4o-mini / ..."
                                    className="w-full bg-white/50 border border-slate-200/60 rounded-xl px-4 py-2.5 text-sm font-mono focus:bg-white transition-all"
                                />
                            </div>
                        </div>

                        {/* Current buffs */}
                        {buffs.length > 0 ? (
                            <div>
                                <div className="flex items-center justify-between mb-2">
                                    <label className="text-[10px] font-bold text-slate-400 uppercase tracking-widest pl-1">当前情绪状态</label>
                                    <button onClick={onClearBuffs} className="text-xs text-slate-400 hover:text-red-400 transition-colors">清除</button>
                                </div>
                                <div className="flex flex-wrap gap-2">
                                    {buffs.map(buff => (
                                        <div
                                            key={buff.id}
                                            className="flex items-center gap-1 px-2.5 py-1.5 rounded-full text-xs font-bold"
                                            style={{
                                                backgroundColor: buff.color ? buff.color + '22' : '#fdf2f8',
                                                color: buff.color || '#db2777',
                                                border: `1px solid ${buff.color ? buff.color + '55' : '#fbcfe8'}`
                                            }}
                                        >
                                            {buff.emoji && <span>{buff.emoji}</span>}
                                            <span>{buff.label}</span>
                                            <span className="opacity-60">{INTENSITY_DOTS(buff.intensity)}</span>
                                        </div>
                                    ))}
                                </div>
                            </div>
                        ) : (
                            <div className="text-xs text-slate-400 text-center py-2">
                                暂无情绪状态 — 发几条消息后会自动生成
                            </div>
                        )}
                    </>
                )}
            </div>
        </Modal>
    );
};

export default React.memo(EmotionSettingsModal);
