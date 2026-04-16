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

const extractJson = <T = any>(text: string): T | null => {
    // Try fenced block first, then loose object
    const fenced = text.match(/```(?:json)?\s*([\s\S]*?)```/);
    const raw = fenced ? fenced[1] : (text.match(/(\{[\s\S]*\})/) || [])[1];
    if (!raw) return null;
    try { return JSON.parse(raw); } catch { return null; }
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
            const raw = await callLlm(apiConfig, sys, usr);
            const draft = extractJson<PersonaDraft>(raw);
            if (!draft) throw new Error('LLM 未返回可解析的 JSON');

            const playlists: CharPlaylist[] = (draft.playlists || []).map((p, i) => ({
                id: `pl-${now}-${i}`,
                title: p.title || `歌单 ${i + 1}`,
                description: p.description || '',
                coverStyle: p.coverStyle || `gradient-0${(i % 6) + 1}`,
                songs: [],
                mood: (p.mood as any) || undefined,
                createdAt: now,
                updatedAt: now,
            }));

            return {
                bio: draft.bio || `${char.name} 的音乐角落`,
                genreTags: draft.genreTags?.length ? draft.genreTags.slice(0, 8) : [...DEFAULT_GENRES],
                signatureArtists: draft.signatureArtists?.length
                    ? draft.signatureArtists.slice(0, 8).map(a => ({ name: a.name }))
                    : [...DEFAULT_ARTISTS],
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
