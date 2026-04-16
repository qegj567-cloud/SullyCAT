/**
 * 网易云「我的」主页
 * - 未登录: 扫码登录 / 手机验证码登录
 * - 已登录: 昵称 + 头像 + 签名 + VIP + 签到 + 我的歌单 + 播放记录 + 云盘
 */
import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { useOS } from '../../context/OSContext';
import { useMusic, musicApi, Song } from '../../context/MusicContext';
import {
  C, Sparkle, MizuHeader, BokehBg,
} from './MusicUI';
import NeteaseLoginPanel from './NeteaseLoginPanel';

interface Playlist {
  id: number;
  name: string;
  coverImgUrl: string;
  trackCount: number;
  subscribed: boolean;
  creatorNickname?: string;
}

interface RecordItem {
  song: Song;
  score: number;
  playCount: number;
}

interface Props {
  onBack: () => void;
  onOpenPlayer: () => void;
}

const NeteaseProfilePage: React.FC<Props> = ({ onBack, onOpenPlayer }) => {
  const { addToast } = useOS();
  const { cfg, setCfg, profile, refreshProfile, playSong } = useMusic();

  const [tab, setTab] = useState<'playlist' | 'record' | 'cloud'>('playlist');
  const [playlists, setPlaylists] = useState<Playlist[]>([]);
  const [records, setRecords] = useState<RecordItem[]>([]);
  const [cloud, setCloud] = useState<Song[]>([]);
  const [loading, setLoading] = useState(false);
  const [expandedPl, setExpandedPl] = useState<number | null>(null);
  const [plTracks, setPlTracks] = useState<Record<number, Song[]>>({});
  const [signedIn, setSignedIn] = useState(false);

  const uid = profile?.userId;

  // 加载歌单 / 播放记录 / 云盘
  const reload = useCallback(async () => {
    if (!uid || !cfg.cookie) return;
    setLoading(true);
    try {
      const [plRes, recRes, clRes] = await Promise.allSettled([
        musicApi.userPlaylist(cfg, uid),
        musicApi.userRecord(cfg, uid, 1),
        musicApi.userCloud(cfg),
      ]);

      if (plRes.status === 'fulfilled') {
        const arr = (plRes.value?.playlist || []).map((p: any): Playlist => ({
          id: p.id,
          name: p.name,
          coverImgUrl: p.coverImgUrl || '',
          trackCount: p.trackCount || 0,
          subscribed: !!p.subscribed,
          creatorNickname: p.creator?.nickname,
        }));
        setPlaylists(arr);
      }

      if (recRes.status === 'fulfilled') {
        const weekly = recRes.value?.weekData || recRes.value?.allData || [];
        const mapped: RecordItem[] = weekly.map((r: any): RecordItem => ({
          score: r.score || 0,
          playCount: r.playCount || 0,
          song: {
            id: r.song?.id,
            name: r.song?.name || '',
            artists: (r.song?.ar || []).map((a: any) => a.name).join(' / '),
            album: r.song?.al?.name || '',
            albumPic: r.song?.al?.picUrl || '',
            duration: (r.song?.dt || 0) / 1000,
            fee: r.song?.fee ?? 0,
          },
        }));
        setRecords(mapped);
      }

      if (clRes.status === 'fulfilled') {
        const clData = clRes.value?.data || [];
        const mapped: Song[] = clData.map((c: any): Song => ({
          id: c.songId || c.simpleSong?.id,
          name: c.songName || c.simpleSong?.name || '',
          artists: c.artist || (c.simpleSong?.ar || []).map((a: any) => a.name).join(' / '),
          album: c.album || c.simpleSong?.al?.name || '',
          albumPic: c.simpleSong?.al?.picUrl || '',
          duration: (c.simpleSong?.dt || 0) / 1000,
          fee: 0,
        }));
        setCloud(mapped);
      }
    } catch (e: any) {
      addToast(`加载失败：${e.message}`, 'error');
    } finally {
      setLoading(false);
    }
  }, [uid, cfg, addToast]);

  useEffect(() => { reload(); }, [reload]);

  // 展开歌单
  const expandPlaylist = useCallback(async (pl: Playlist) => {
    if (expandedPl === pl.id) { setExpandedPl(null); return; }
    setExpandedPl(pl.id);
    if (plTracks[pl.id]) return;
    try {
      const r = await musicApi.playlistTrackAll(cfg, pl.id, 100, 0);
      const songs: Song[] = (r?.songs || []).map((s: any) => ({
        id: s.id,
        name: s.name,
        artists: (s.ar || []).map((a: any) => a.name).join(' / '),
        album: s.al?.name || '',
        albumPic: s.al?.picUrl || '',
        duration: (s.dt || 0) / 1000,
        fee: s.fee ?? 0,
      }));
      setPlTracks(prev => ({ ...prev, [pl.id]: songs }));
    } catch (e: any) {
      addToast(`加载歌单失败：${e.message}`, 'error');
    }
  }, [cfg, expandedPl, plTracks, addToast]);

  // 签到
  const doSignIn = useCallback(async () => {
    try {
      await musicApi.dailySignin(cfg, 1);
      setSignedIn(true);
      addToast('签到成功 +5', 'success');
    } catch (e: any) {
      if (String(e.message).includes('重复')) {
        setSignedIn(true);
        addToast('今天已经签过了', 'info');
      } else {
        addToast(`签到失败：${e.message}`, 'error');
      }
    }
  }, [cfg, addToast]);

  // 登出
  const doLogout = useCallback(async () => {
    try { await musicApi.logout(cfg); } catch {}
    setCfg({ ...cfg, cookie: '' });
    addToast('已退出', 'success');
    await refreshProfile();
  }, [cfg, setCfg, addToast, refreshProfile]);

  // 未登录 → 登录面板
  if (!cfg.cookie || !profile) {
    return (
      <NeteaseLoginPanel
        onBack={onBack}
        onLoggedIn={async (cookie) => {
          setCfg({ ...cfg, cookie });
          // 给网络一点时间把 cookie 应用到上游
          await new Promise(r => setTimeout(r, 300));
          await refreshProfile();
          addToast('登录成功', 'success');
        }}
      />
    );
  }

  // 已登录 → 个人主页
  const vipLabel = useMemo(() => {
    const v = profile.vipType || 0;
    if (v >= 110) return '黑胶 SVIP';
    if (v >= 10) return '黑胶 VIP';
    if (v > 0) return 'VIP';
    return '普通用户';
  }, [profile]);

  return (
    <div className="flex flex-col h-full relative"
      style={{ background: `linear-gradient(180deg, #ffffff 0%, ${C.bg} 50%, ${C.bgDeep} 100%)` }}>
      <BokehBg />
      <MizuHeader title="My Cloud" onBack={onBack} />

      <div className="flex-1 overflow-y-auto relative z-10 shizuku-scrollbar pb-20">
        {/* Banner 头图 */}
        <div className="relative h-32 overflow-hidden">
          {profile.backgroundUrl ? (
            <img src={profile.backgroundUrl} className="absolute inset-0 w-full h-full object-cover" alt="" />
          ) : (
            <div className="absolute inset-0" style={{ background: `linear-gradient(135deg, ${C.accent}40, ${C.sakura}40, ${C.lavender}40)` }} />
          )}
          <div className="absolute inset-0" style={{ background: `linear-gradient(180deg, transparent 0%, ${C.bg}CC 100%)` }} />
        </div>

        {/* 用户卡 */}
        <div className="-mt-12 mx-4 rounded-3xl p-4 shizuku-glass-strong relative z-10"
          style={{ boxShadow: `0 10px 40px ${C.glow}15` }}>
          <div className="flex items-center gap-3">
            <div className="relative shrink-0">
              <img
                src={profile.avatarUrl || 'https://p1.music.126.net/y19E5SadGUmSR8SZxkrNtw==/109951163965029180.jpg'}
                alt=""
                className="w-16 h-16 rounded-2xl object-cover"
                style={{ border: `2px solid ${C.glow}60`, boxShadow: `0 4px 20px ${C.glow}30` }}
              />
              <div className="absolute -bottom-1 -right-1">
                <Sparkle size={10} color={C.sakura} delay={0.3} />
              </div>
            </div>
            <div className="flex-1 min-w-0">
              <div className="text-base font-semibold truncate" style={{ color: C.text, fontFamily: `'Noto Serif', serif` }}>
                {profile.nickname}
              </div>
              <div className="text-[10px] mt-0.5 truncate" style={{ color: C.muted }}>
                {profile.signature || '—'}
              </div>
              <div className="flex items-center gap-1.5 mt-1.5">
                <span className="text-[9px] px-2 py-0.5 rounded-full text-white font-medium"
                  style={{ background: `linear-gradient(135deg, ${C.vip}, #e0b88a)`, letterSpacing: '0.05em' }}>
                  {vipLabel}
                </span>
                <span className="text-[9px] px-2 py-0.5 rounded-full" style={{ color: C.muted, border: `1px solid ${C.faint}40` }}>
                  UID · {profile.userId}
                </span>
              </div>
            </div>
          </div>

          {/* 统计行 */}
          <div className="grid grid-cols-3 gap-2 mt-3 text-center">
            <StatCell label="歌单" value={playlists.length || profile.playlistCount || 0} />
            <StatCell label="关注" value={profile.follows ?? 0} />
            <StatCell label="粉丝" value={profile.followeds ?? 0} />
          </div>

          {/* 快捷按钮 */}
          <div className="flex items-center gap-2 mt-3">
            <button
              onClick={doSignIn}
              className="flex-1 py-2 rounded-xl text-[11px] transition-all shizuku-glass"
              style={{ color: signedIn ? C.muted : C.primary, border: `1px solid ${signedIn ? C.faint : C.primary}30` }}
            >
              {signedIn ? '已签到 ✓' : '每日签到'}
            </button>
            <button
              onClick={async () => {
                try {
                  const r = await musicApi.recommendSongs(cfg);
                  const songs: Song[] = (r?.data?.dailySongs || r?.recommend || []).map((s: any): Song => ({
                    id: s.id, name: s.name,
                    artists: (s.ar || s.artists || []).map((a: any) => a.name).join(' / '),
                    album: s.al?.name || s.album?.name || '',
                    albumPic: s.al?.picUrl || s.album?.picUrl || '',
                    duration: (s.dt || s.duration || 0) / 1000,
                    fee: s.fee ?? 0,
                  }));
                  if (!songs.length) { addToast('还没有每日推荐', 'info'); return; }
                  playSong(songs[0], { replaceQueue: songs, startIdx: 0 });
                  onOpenPlayer();
                } catch (e: any) { addToast(`获取失败：${e.message}`, 'error'); }
              }}
              className="flex-1 py-2 rounded-xl text-[11px] transition-all text-white"
              style={{ background: `linear-gradient(135deg, ${C.primary}, ${C.accent})`, boxShadow: `0 2px 10px ${C.glow}30` }}
            >
              每日推荐
            </button>
            <button
              onClick={async () => {
                try {
                  const r = await musicApi.personalFm(cfg);
                  const songs: Song[] = (r?.data || []).map((s: any): Song => ({
                    id: s.id, name: s.name,
                    artists: (s.artists || s.ar || []).map((a: any) => a.name).join(' / '),
                    album: s.album?.name || s.al?.name || '',
                    albumPic: s.album?.picUrl || s.al?.picUrl || '',
                    duration: (s.duration || s.dt || 0) / 1000,
                    fee: s.fee ?? 0,
                  }));
                  if (!songs.length) { addToast('FM 暂无歌曲', 'info'); return; }
                  playSong(songs[0], { replaceQueue: songs, startIdx: 0 });
                  onOpenPlayer();
                } catch (e: any) { addToast(`FM 失败：${e.message}`, 'error'); }
              }}
              className="flex-1 py-2 rounded-xl text-[11px] transition-all shizuku-glass"
              style={{ color: C.accent, border: `1px solid ${C.accent}30` }}
            >
              私人 FM
            </button>
          </div>

          <button
            onClick={doLogout}
            className="w-full mt-2 py-1.5 rounded-xl text-[10px] transition-all"
            style={{ color: C.faint }}
          >
            退出登录
          </button>
        </div>

        {/* Tabs */}
        <div className="mx-4 mt-5 flex items-center gap-1 shizuku-glass rounded-full p-1">
          {([
            { k: 'playlist', label: '歌单' },
            { k: 'record', label: '最近' },
            { k: 'cloud', label: '云盘' },
          ] as const).map(t => (
            <button
              key={t.k}
              onClick={() => setTab(t.k)}
              className="flex-1 py-1.5 rounded-full text-[11px] tracking-wider transition-all"
              style={{
                background: tab === t.k ? `linear-gradient(135deg, ${C.primary}, ${C.accent})` : 'transparent',
                color: tab === t.k ? 'white' : C.muted,
              }}
            >
              {t.label}
            </button>
          ))}
        </div>

        {loading && (
          <div className="text-center text-[10px] mt-6" style={{ color: C.faint }}>
            <span className="inline-block w-3 h-3 border-2 rounded-full animate-spin"
              style={{ borderColor: `${C.faint}40`, borderTopColor: C.primary }} />
            <span className="ml-2">loading...</span>
          </div>
        )}

        {tab === 'playlist' && (
          <div className="px-3 mt-3 space-y-2">
            {playlists.length === 0 && !loading && (
              <div className="text-center text-[11px] py-10" style={{ color: C.faint }}>还没有歌单</div>
            )}
            {playlists.map(pl => (
              <div key={pl.id} className="rounded-2xl shizuku-glass overflow-hidden">
                <button
                  onClick={() => expandPlaylist(pl)}
                  className="w-full flex items-center gap-3 p-2.5 text-left"
                >
                  <img src={pl.coverImgUrl} alt=""
                    className="w-12 h-12 rounded-xl object-cover"
                    style={{ border: `1px solid ${C.faint}30` }} />
                  <div className="flex-1 min-w-0">
                    <div className="text-sm truncate" style={{ color: C.text }}>{pl.name}</div>
                    <div className="text-[10px] truncate" style={{ color: C.muted }}>
                      {pl.trackCount} 首 · {pl.subscribed ? '收藏' : '创建'}
                      {pl.creatorNickname && ` · ${pl.creatorNickname}`}
                    </div>
                  </div>
                  <div className="text-[10px] shrink-0" style={{ color: C.accent }}>
                    {expandedPl === pl.id ? '收起' : '展开'}
                  </div>
                </button>
                {expandedPl === pl.id && (
                  <div className="border-t px-2 py-1" style={{ borderColor: `${C.faint}20` }}>
                    {(plTracks[pl.id] || []).slice(0, 30).map(s => (
                      <button key={s.id}
                        onClick={() => {
                          playSong(s, { replaceQueue: plTracks[pl.id], startIdx: plTracks[pl.id].findIndex(x => x.id === s.id) });
                          onOpenPlayer();
                        }}
                        className="w-full text-left flex items-center gap-2 py-1.5 px-1">
                        <img src={s.albumPic} alt="" className="w-7 h-7 rounded-md object-cover" />
                        <div className="flex-1 min-w-0">
                          <div className="text-[11px] truncate" style={{ color: C.text }}>{s.name}</div>
                          <div className="text-[9px] truncate" style={{ color: C.muted }}>{s.artists}</div>
                        </div>
                      </button>
                    ))}
                    {(plTracks[pl.id] || []).length === 0 && (
                      <div className="text-[10px] text-center py-2" style={{ color: C.faint }}>加载中...</div>
                    )}
                  </div>
                )}
              </div>
            ))}
          </div>
        )}

        {tab === 'record' && (
          <div className="px-3 mt-3 space-y-1">
            {records.length === 0 && !loading && (
              <div className="text-center text-[11px] py-10" style={{ color: C.faint }}>最近一周还没有播放记录</div>
            )}
            {records.map((r, i) => (
              <button key={r.song.id + '-' + i}
                onClick={() => {
                  const q = records.map(x => x.song);
                  playSong(r.song, { replaceQueue: q, startIdx: i });
                  onOpenPlayer();
                }}
                className="w-full flex items-center gap-3 p-2 rounded-2xl text-left transition-all"
                style={{ background: 'rgba(255,255,255,0.06)' }}
              >
                <div className="text-[10px] w-5 text-center shrink-0" style={{ color: C.faint }}>{i + 1}</div>
                <img src={r.song.albumPic} alt="" className="w-10 h-10 rounded-lg object-cover" />
                <div className="flex-1 min-w-0">
                  <div className="text-sm truncate" style={{ color: C.text }}>{r.song.name}</div>
                  <div className="text-[10px] truncate" style={{ color: C.muted }}>{r.song.artists}</div>
                </div>
                <div className="text-[9px] shrink-0 text-right" style={{ color: C.accent }}>
                  <div>×{r.playCount}</div>
                  <div className="opacity-60">{Math.round(r.score)}°</div>
                </div>
              </button>
            ))}
          </div>
        )}

        {tab === 'cloud' && (
          <div className="px-3 mt-3 space-y-1">
            {cloud.length === 0 && !loading && (
              <div className="text-center text-[11px] py-10" style={{ color: C.faint }}>云盘里还没有歌曲</div>
            )}
            {cloud.map((s, i) => (
              <button key={s.id + '-' + i}
                onClick={() => { playSong(s, { replaceQueue: cloud, startIdx: i }); onOpenPlayer(); }}
                className="w-full flex items-center gap-3 p-2 rounded-2xl text-left transition-all"
                style={{ background: 'rgba(255,255,255,0.06)' }}
              >
                <img src={s.albumPic || 'https://p1.music.126.net/y19E5SadGUmSR8SZxkrNtw==/109951163965029180.jpg'}
                  alt="" className="w-10 h-10 rounded-lg object-cover" />
                <div className="flex-1 min-w-0">
                  <div className="text-sm truncate" style={{ color: C.text }}>{s.name}</div>
                  <div className="text-[10px] truncate" style={{ color: C.muted }}>{s.artists} · {s.album}</div>
                </div>
              </button>
            ))}
          </div>
        )}
      </div>
    </div>
  );
};

const StatCell: React.FC<{ label: string; value: number }> = ({ label, value }) => (
  <div className="rounded-xl py-1.5 shizuku-glass">
    <div className="text-base font-light" style={{ color: C.primary, fontFamily: `'Noto Serif', serif` }}>{value}</div>
    <div className="text-[9px] tracking-wider" style={{ color: C.muted }}>{label}</div>
  </div>
);

export default NeteaseProfilePage;
