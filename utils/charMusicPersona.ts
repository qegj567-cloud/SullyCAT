/**
 * 角色音乐人格初始化
 *
 * 目标：第一次在音乐 App 里"拜访"某个 char 时（或用户手动点"初始化"），调一次 LLM，
 * 基于 char 的 systemPrompt + worldview + impression 生成一份 CharMusicProfile。
 *
 * 设计原则：
 * 1. 生成的 signatureArtists 名字都是真实存在的网易云可搜的艺人（LLM 要知道真艺人）。
 * 2. 生成的 playlists 是 3 个概念，不预先填真歌曲 — 歌曲等到用户打开某个歌单再实时搜。
 * 3. 产出是纯本地数据，不打网易云 upstream —— 零 Worker 成本。
 * 4. 失败时降级到基于 systemPrompt 关键词的最小可用 profile（avoid blocking）。
 */

import { APIConfig, CharacterProfile, CharMusicProfile, CharPlaylist, UserProfile } from '../types';
import { ContextBuilder } from './context';

const DEFAULT_GENRES = ['city-pop', 'indie-pop', '民谣', 'lo-fi'];
const DEFAULT_ARTISTS = [{ name: '陈绮贞' }, { name: '告五人' }];

const callLlm = async (api: APIConfig, sys: string, user: string): Promise<string> => {
    const baseUrl = api.baseUrl.replace(/\/+$/, '');
    const resp = await fetch(`${baseUrl}/chat/completions`, {
        method: 'POST',
        headers: {
            'Content-Type': 'application/json',
            'Authorization': `Bearer ${api.apiKey || 'sk-none'}`,
        },
        body: JSON.stringify({
            model: api.model,
            messages: [
                { role: 'system', content: sys },
                { role: 'user', content: user },
            ],
            temperature: 0.8,
            stream: false,
        }),
    });
    if (!resp.ok) throw new Error(`LLM ${resp.status}`);
    const j = await resp.json();
    return j?.choices?.[0]?.message?.content || '';
};

/**
 * 鲁棒的 JSON 提取器：
 * - 依次尝试：纯 parse → 去 fenced → 去 preamble → 最外层花括号 → 宽松修复 → 逐字段正则抠
 * - 宽松修复包括：中文全角标点 / trailing comma / 单引号 / 未加引号的 key / BOM
 * - 任何一步成功即返回；全部失败返回 null
 */
const extractJson = <T = any>(text: string): T | null => {
    if (!text || typeof text !== 'string') return null;

    // 1) 原文直接 parse
    const raw = text.trim().replace(/^\uFEFF/, '');
    const tryParse = (s: string): any | null => {
        try { return JSON.parse(s); } catch { return null; }
    };
    let hit = tryParse(raw);
    if (hit) return hit;

    // 2) 去除 ``` 代码围栏
    const fencedMatch = raw.match(/```(?:json|JSON)?\s*([\s\S]*?)```/);
    if (fencedMatch) {
        hit = tryParse(fencedMatch[1].trim());
        if (hit) return hit;
    }

    // 3) 抽取第一段最外层花括号（用栈匹配，正确处理嵌套）
    const braceSlice = (() => {
        const s = fencedMatch ? fencedMatch[1] : raw;
        const start = s.indexOf('{');
        if (start < 0) return null;
        let depth = 0, inStr = false, esc = false;
        for (let i = start; i < s.length; i++) {
            const ch = s[i];
            if (esc) { esc = false; continue; }
            if (ch === '\\') { esc = true; continue; }
            if (ch === '"') { inStr = !inStr; continue; }
            if (inStr) continue;
            if (ch === '{') depth++;
            else if (ch === '}') {
                depth--;
                if (depth === 0) return s.slice(start, i + 1);
            }
        }
        return null;
    })();
    if (braceSlice) {
        hit = tryParse(braceSlice);
        if (hit) return hit;

        // 4) 宽松修复后再试
        let repaired = braceSlice
            // 中文全角标点 → 半角（只处理 key/value 外围）
            .replace(/[：]/g, ':')
            .replace(/[，]/g, ',')
            .replace(/[“”„]/g, '"')
            .replace(/[‘’‚]/g, "'")
            // 单引号字符串 → 双引号（简版：不处理转义）
            .replace(/'([^'\n\r]*?)'/g, '"$1"')
            // 未加引号的 key 加引号（{ foo: → { "foo":）
            .replace(/([{,]\s*)([A-Za-z_][A-Za-z0-9_]*)(\s*:)/g, '$1"$2"$3')
            // trailing comma
            .replace(/,(\s*[}\]])/g, '$1');
        hit = tryParse(repaired);
        if (hit) return hit;
    }
    return null;
};

/** 从自由文本里逐字段提取 persona（JSON 完全不可用时的最后防线） */
const scavengeFields = (text: string): Partial<PersonaDraft> => {
    const out: Partial<PersonaDraft> = {};

    // bio — 找 "bio" 行
    const bioM = text.match(/"?bio"?\s*[:：]\s*["“]([^"\n”]{2,60})["”]/);
    if (bioM) out.bio = bioM[1].trim();

    // genreTags — 找第一个数组 [...]
    const genreM = text.match(/"?genre[tT]ags"?\s*[:：]\s*\[([^\]]+)\]/);
    if (genreM) {
        out.genreTags = genreM[1].split(',')
            .map(s => s.replace(/["'“”‘’\s]/g, ''))
            .filter(Boolean).slice(0, 8);
    }

    // signatureArtists — 形如 [{"name": "..."}] 或纯字符串数组
    const artistBlock = text.match(/"?signature[aA]rtists"?\s*[:：]\s*\[([\s\S]*?)\]/);
    if (artistBlock) {
        const inner = artistBlock[1];
        const names: string[] = [];
        const nameRe = /["“]([^"”\n]{1,30})["”]/g;
        let m: RegExpExecArray | null;
        while ((m = nameRe.exec(inner)) !== null) {
            const n = m[1].trim();
            if (n && !['name', 'artistId'].includes(n)) names.push(n);
        }
        if (names.length) out.signatureArtists = names.slice(0, 6).map(n => ({ name: n }));
    }

    // playlists — 最省事：找若干 title 字符串
    const playlistTitles: string[] = [];
    const plTitleRe = /"?title"?\s*[:：]\s*["“]([^"”\n]{1,30})["”]/g;
    let pm: RegExpExecArray | null;
    while ((pm = plTitleRe.exec(text)) !== null) playlistTitles.push(pm[1].trim());
    if (playlistTitles.length > 0) {
        out.playlists = playlistTitles.slice(0, 3).map(t => ({
            title: t,
            description: '',
        }));
    }

    return out;
};

interface PersonaDraft {
    bio: string;
    genreTags: string[];
    signatureArtists: { name: string; artistId?: number }[];
    playlists: { title: string; description: string; mood?: string; coverStyle?: string }[];
}

const buildPersonaPrompt = (char: CharacterProfile, user: UserProfile): { sys: string; usr: string } => {
    const core = ContextBuilder.buildRoleSettingsContext(char, { skipMemories: true });
    const sys = `你是一个"音乐人格生成器"。根据给定的角色设定，为这个角色设计一份网易云音乐个人主页的品味档案。

要求:
1. 艺人必须是真实存在、可以在网易云搜到的华语 / 日系 / 英语 / 韩语艺人（不要虚构）
2. 曲风标签要具体 (shoegaze / city-pop / post-rock / 民谣 / trip-hop / R&B / 后朋克 ...)，避免泛泛 ("流行"/"摇滚")
3. 歌单概念要和角色精神内核呼应，不要套路化
4. bio 用角色自己的口吻写（第一人称），一句话即可，不超过30字

只输出 JSON，不要任何解释:
{
  "bio": "(一句话，角色第一人称)",
  "genreTags": ["...", "...", "...(3-5个)"],
  "signatureArtists": [{"name":"真实艺人名"}, ... (3-6个)],
  "playlists": [
    {"title":"歌单名(短)", "description":"(角色口吻, 1-2句)", "mood":"dreamy|nostalgic|chill|sad|romantic|epic|happy|angry"},
    ...(共3个)
  ]
}`;

    const usr = `${core}

(可选) 用户姓名: ${user.name || '用户'}
(可选) 用户 bio: ${user.bio || ''}

请为"${char.name}"生成音乐人格档案。`;
    return { sys, usr };
};

export const CharMusicPersona = {
    /** 检查是否已初始化 */
    isInitialized(char: CharacterProfile): boolean {
        const p = char.musicProfile;
        return !!(p && p.initializedAt && p.signatureArtists.length > 0);
    },

    /** 生成一份空的最小 profile（紧急降级用） */
    buildFallback(char: CharacterProfile): CharMusicProfile {
        const now = Date.now();
        return {
            bio: `${char.name} 的音乐角落`,
            genreTags: [...DEFAULT_GENRES],
            signatureArtists: [...DEFAULT_ARTISTS],
            playlists: [
                {
                    id: `pl-${now}-default`,
                    title: '未命名歌单',
                    description: '还没想好放什么。',
                    coverStyle: 'gradient-01',
                    songs: [],
                    createdAt: now,
                    updatedAt: now,
                },
            ],
            likedSongIds: [],
            recentPlays: [],
            reviews: [],
            canReadUserMusic: true,
            initializedAt: now,
            updatedAt: now,
        };
    },

    /**
     * 调 LLM 生成角色的音乐人格档案
     * @returns 新的 CharMusicProfile（调用方负责持久化到 CharacterProfile）
     */
    async initialize(
        char: CharacterProfile,
        userProfile: UserProfile,
        apiConfig: APIConfig,
    ): Promise<CharMusicProfile> {
        const now = Date.now();

        // 基础检查：没有 LLM 配置直接 fallback
        if (!apiConfig.baseUrl || !apiConfig.model) {
            return CharMusicPersona.buildFallback(char);
        }

        try {
            const { sys, usr } = buildPersonaPrompt(char, userProfile);
            const rawText = await callLlm(apiConfig, sys, usr);

            // Step 1: 结构化 parse；不行就 scavenge（逐字段正则抠）；
            // 两条线结果合并 — 任何字段单项 OK 都先收下，缺的再 fallback
            const structured = extractJson<PersonaDraft>(rawText) || {};
            const scavenged = scavengeFields(rawText);
            const draft: Partial<PersonaDraft> = {
                bio: sanitizeStr(structured.bio) || sanitizeStr(scavenged.bio),
                genreTags: firstArray(structured.genreTags, scavenged.genreTags),
                signatureArtists: firstArray(
                    structured.signatureArtists,
                    scavenged.signatureArtists as PersonaDraft['signatureArtists'],
                ),
                playlists: firstArray(structured.playlists, scavenged.playlists as PersonaDraft['playlists']),
            };

            const playlistsIn = (draft.playlists || []).slice(0, 3);
            const playlists: CharPlaylist[] = playlistsIn.map((p, i) => ({
                id: `pl-${now}-${i}`,
                title: sanitizeStr(p?.title) || `歌单 ${i + 1}`,
                description: sanitizeStr(p?.description) || '',
                coverStyle: sanitizeStr(p?.coverStyle) || `gradient-0${(i % 6) + 1}`,
                songs: [],
                mood: (typeof p?.mood === 'string' && ['happy','sad','romantic','angry','chill','epic','nostalgic','dreamy'].includes(p.mood))
                    ? (p.mood as any) : undefined,
                createdAt: now,
                updatedAt: now,
            }));

            // 艺人字段：兼容三种形态 — [{name:"..."}] / ["..."] / 混合
            const artistsIn = draft.signatureArtists || [];
            const artists = artistsIn
                .map((a: any) => {
                    if (typeof a === 'string') return { name: a.trim() };
                    if (a && typeof a === 'object' && typeof a.name === 'string') return { name: a.name.trim() };
                    return null;
                })
                .filter((a): a is { name: string } => !!a && !!a.name)
                .slice(0, 8);

            const genres = (draft.genreTags || [])
                .filter((t: any) => typeof t === 'string' && t.trim())
                .map((t: string) => t.trim())
                .slice(0, 8);

            return {
                bio: sanitizeStr(draft.bio) || `${char.name} 的音乐角落`,
                genreTags: genres.length ? genres : [...DEFAULT_GENRES],
                signatureArtists: artists.length ? artists : [...DEFAULT_ARTISTS],
                playlists: playlists.length > 0 ? playlists : CharMusicPersona.buildFallback(char).playlists,
                likedSongIds: [],
                recentPlays: [],
                reviews: [],
                canReadUserMusic: true,
                initializedAt: now,
                updatedAt: now,
            };
        } catch (e) {
            console.warn('[CharMusicPersona] init failed, falling back:', e);
            return CharMusicPersona.buildFallback(char);
        }
    },
};

// —— helpers ——
const sanitizeStr = (s: any): string => {
    if (typeof s !== 'string') return '';
    return s
        .replace(/^\s*["“”'‘’]+|["“”'‘’]+\s*$/g, '')  // 去首尾多余引号
        .replace(/\s+/g, ' ')
        .trim();
};

function firstArray<T>(...candidates: (T[] | undefined)[]): T[] | undefined {
    for (const c of candidates) {
        if (Array.isArray(c) && c.length > 0) return c;
    }
    return undefined;
}
