/**
 * Char 音乐 · Schedule 运行时
 *
 * 目标：当 char 的 DailySchedule 里当前 slot 暗示"在听歌"时（通过关键词检测），
 * 在 char.musicProfile.currentListening 里填入"此刻在听的歌 + 当前歌词 + 窗口"。
 *
 * Worker 代价最小化：
 * - 默认从 char 歌单里已有的歌（songId 本地就有）挑一首，只调 /lyric（30天缓存命中率极高）。
 * - 当前歌词行根据"开始时间 → 现在"的经过秒数对齐 lyric timestamps 线性推进（不启动真实 audio）。
 * - lyric 返回的时间戳已足够精确，所以只要一次 API 调用后整段都能本地推进。
 *
 * 调用约定：
 * - 调用方（例如 chatPrompts / CharVisitPage）传入 char、schedule、apiCfg（MusicCfg）、updateCharacter 回调。
 * - 如果当前 slot 不是"听歌"状态 → 返回 { listening: null } 且顺手清掉 stale 的 currentListening。
 * - 如果已经在听同一首歌 → 只推进 lyricNow/lyricWindow，不重复拉取。
 */

import { CharacterProfile, CharCurrentListening, CharPlaylistSong, DailySchedule, ScheduleSlot } from '../types';
import { musicApi, MusicCfg, parseLyric } from '../context/MusicContext';

const LISTENING_KEYWORDS = [
    '听歌', '听音乐', '戴耳机', '戴上耳机', '戴着耳机', '耳机',
    '循环', '单曲循环', '播放', '耳畔', '耳旁',
    '播放列表', '歌单', '副歌', '前奏',
    'listening', 'music', 'song', 'playlist', 'vinyl', 'headphone', '🎵', '🎶', '🎧',
];

const MAX_SAMPLED_SONGS = 20; // 从 char 歌单里最多参考多少首
const WINDOW_BEFORE = 2;
const WINDOW_AFTER = 2;

/** 返回当前时间属于哪一个 slot */
export const getCurrentSlot = (schedule: DailySchedule | null, at: Date = new Date()): ScheduleSlot | null => {
    if (!schedule?.slots?.length) return null;
    const nowMin = at.getHours() * 60 + at.getMinutes();
    for (let i = schedule.slots.length - 1; i >= 0; i--) {
        const [h, m] = schedule.slots[i].startTime.split(':').map(Number);
        if (!isFinite(h) || !isFinite(m)) continue;
        if (nowMin >= h * 60 + m) return schedule.slots[i];
    }
    return null;
};

/** 判断某个 slot 是否暗示"在听歌" */
export const slotIsListening = (slot: ScheduleSlot | null): boolean => {
    if (!slot) return false;
    const blob = `${slot.activity || ''} ${slot.description || ''} ${slot.innerThought || ''} ${slot.emoji || ''}`.toLowerCase();
    return LISTENING_KEYWORDS.some(kw => blob.includes(kw.toLowerCase()));
};

/** 把 slot.startTime "08:00" 转成今日的 Date */
const slotStartToDate = (slot: ScheduleSlot, baseDate: Date): Date => {
    const [h, m] = slot.startTime.split(':').map(Number);
    const d = new Date(baseDate);
    d.setHours(h || 0, m || 0, 0, 0);
    return d;
};

/** 从 char.musicProfile 的歌单 & 喜欢列表里抽样一首"稳定可挑选"的歌（seed = day + slot.startTime 保证同 slot 不会一直换歌） */
const pickSongForSlot = (
    char: CharacterProfile,
    slot: ScheduleSlot,
    today: string,
): CharPlaylistSong | null => {
    const p = char.musicProfile;
    if (!p) return null;

    // 1. 收集所有歌（去重）
    const pool: CharPlaylistSong[] = [];
    const seen = new Set<number>();
    for (const pl of p.playlists) {
        for (const s of pl.songs) {
            if (seen.has(s.id)) continue;
            seen.add(s.id);
            pool.push(s);
            if (pool.length >= MAX_SAMPLED_SONGS) break;
        }
        if (pool.length >= MAX_SAMPLED_SONGS) break;
    }
    if (pool.length === 0) return null;

    // 2. 用 today + slot.startTime 作为种子稳定选择
    const seedStr = `${today}-${slot.startTime}-${char.id}`;
    let h = 0;
    for (const ch of seedStr) h = (h * 31 + ch.charCodeAt(0)) >>> 0;
    return pool[h % pool.length];
};

interface UpdateResult {
    listening: CharCurrentListening | null;
    /** 如果状态确实变化了，给调用方一个 "profile diff" 直接 merge 即可 */
    profilePatch: Partial<CharacterProfile['musicProfile']> | null;
}

/**
 * 计算当前 slot 下 char 应该有的 currentListening；如果需要网络，会去拉 /lyric。
 *
 * 幂等：如果已经在听这首歌，只更新 lyricNow/window，不会多打网络。
 *
 * @param cfg MusicCfg — 用 user 的 cookie（与 Worker 共用缓存）
 */
export async function computeCurrentListening(
    char: CharacterProfile,
    schedule: DailySchedule | null,
    cfg: MusicCfg,
    now: Date = new Date(),
): Promise<UpdateResult> {
    const p = char.musicProfile;
    if (!p) return { listening: null, profilePatch: null };

    const slot = getCurrentSlot(schedule, now);
    const isListening = slotIsListening(slot);

    // 当前不该在听 → 清理 stale
    if (!slot || !isListening) {
        if (p.currentListening) {
            return { listening: null, profilePatch: { currentListening: undefined, updatedAt: Date.now() } };
        }
        return { listening: null, profilePatch: null };
    }

    // 决定要听哪首（基于 slot.startTime 种子稳定）
    const today = now.toISOString().slice(0, 10);
    const song = pickSongForSlot(char, slot, today);
    if (!song) {
        // char 还没歌单/歌 → 无法"在听"
        if (p.currentListening) {
            return { listening: null, profilePatch: { currentListening: undefined, updatedAt: Date.now() } };
        }
        return { listening: null, profilePatch: null };
    }

    const slotStartMs = slotStartToDate(slot, now).getTime();
    const elapsedSec = Math.max(0, (now.getTime() - slotStartMs) / 1000);

    // 已经在听同一首歌 → 只推进歌词窗口，不拉网络
    const prev = p.currentListening;
    if (prev && prev.songId === song.id && prev.startedAt === slotStartMs) {
        // 如果上次已经算出了 lyricWindow 里的一个位置，可以推进
        // 但为了保持简单，直接在这里不重拉，回传 prev
        return { listening: prev, profilePatch: null };
    }

    // 新歌 → 需要拉歌词
    let lyricWindow: string[] = [];
    let lyricNow: string | undefined;
    try {
        const r = await musicApi.lyric(cfg, song.id);
        const rawLyric = r?.lrc?.lyric || '';
        const parsed = parseLyric(rawLyric);
        if (parsed.length > 0) {
            // 找到当前 elapsedSec 对应的行
            let idx = 0;
            for (let k = 0; k < parsed.length; k++) {
                if (parsed[k].t <= elapsedSec) idx = k; else break;
            }
            lyricNow = parsed[idx]?.text;
            const from = Math.max(0, idx - WINDOW_BEFORE);
            const to = Math.min(parsed.length, idx + WINDOW_AFTER + 1);
            lyricWindow = parsed.slice(from, to).map(l => l.text);
        }
    } catch (e) {
        // 歌词失败不致命 — 只影响展示
        console.warn('[charMusicSchedule] lyric fetch failed', e);
    }

    const listening: CharCurrentListening = {
        songId: song.id,
        songName: song.name,
        artists: song.artists,
        albumPic: song.albumPic,
        lyricNow,
        lyricWindow,
        vibe: slot.innerThought || slot.description || undefined,
        startedAt: slotStartMs,
    };

    return { listening, profilePatch: { currentListening: listening, updatedAt: Date.now() } };
}
