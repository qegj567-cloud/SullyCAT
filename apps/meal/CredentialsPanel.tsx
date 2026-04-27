import React, { useEffect, useState } from 'react';
import { X, Key, CheckCircle, Warning } from '@phosphor-icons/react';
import { MEAL_PLATFORM_LABEL, MealPlatform } from '../../utils/mealClient';
import { MealCredentials, getPlatformCookie, setPlatformCookie } from './credentials';

interface Props {
  open: boolean;
  onClose: () => void;
  credentials: MealCredentials;
  onChange: (next: MealCredentials) => void;
  bridgeReady?: boolean;
}

const PLATFORM_HINTS: Record<MealPlatform, string> = {
  meituan:
    '从浏览器登录 waimai.meituan.com / i.meituan.com，DevTools → Network → 任意请求 → 复制完整 Cookie。',
  eleme:
    '（暂未启用真实调用）登录 h5.ele.me 后从 DevTools 复制 Cookie，留作未来切换真实接口用。',
  hema:
    '（暂未启用真实调用）登录 www.freshhema.com 后从 DevTools 复制 Cookie，留作未来切换真实接口用。',
};

const PLATFORM_REAL: Record<MealPlatform, '已启用真实尝试' | '暂未启用'> = {
  meituan: '已启用真实尝试',
  eleme: '暂未启用',
  hema: '暂未启用',
};

const formatAge = (ts?: number) => {
  if (!ts) return '';
  const days = Math.floor((Date.now() - ts) / (1000 * 60 * 60 * 24));
  if (days <= 0) return '今天贴的';
  if (days < 7) return `${days} 天前贴的`;
  if (days < 30) return `${days} 天前贴的（可能过期）`;
  return `${days} 天前贴的（多半过期）`;
};

const CredentialsPanel: React.FC<Props> = ({ open, onClose, credentials, onChange, bridgeReady }) => {
  const [drafts, setDrafts] = useState<Record<MealPlatform, string>>({
    meituan: '',
    eleme: '',
    hema: '',
  });

  useEffect(() => {
    if (open) {
      setDrafts({
        meituan: credentials.meituan || '',
        eleme: credentials.eleme || '',
        hema: credentials.hema || '',
      });
    }
  }, [open, credentials]);

  if (!open) return null;

  const platforms: MealPlatform[] = ['meituan', 'eleme', 'hema'];

  const save = () => {
    let next = credentials;
    for (const p of platforms) {
      const draft = drafts[p];
      const current = getPlatformCookie(credentials, p) || '';
      if (draft !== current) {
        next = setPlatformCookie(next, p, draft);
      }
    }
    onChange(next);
    onClose();
  };

  return (
    <div className="absolute inset-0 z-30 flex items-center justify-center bg-black/40 backdrop-blur-sm p-4">
      <div className="w-full max-w-md max-h-full overflow-hidden rounded-2xl bg-white shadow-2xl flex flex-col">
        <div className="px-4 py-3 border-b border-black/5 flex items-center justify-between">
          <div className="flex items-center gap-2">
            <Key size={18} weight="bold" className="text-orange-500" />
            <span className="font-semibold">平台 Cookie</span>
          </div>
          <button onClick={onClose} className="p-1 rounded-full hover:bg-black/5">
            <X size={16} weight="bold" />
          </button>
        </div>

        {bridgeReady && (
          <div className="px-4 py-3 text-xs text-emerald-700 bg-emerald-50 flex items-start gap-2 border-b border-emerald-100">
            <CheckCircle size={14} weight="fill" className="shrink-0 mt-0.5" />
            <div className="leading-relaxed">
              <strong>检测到 SullyOS Meal Bridge 扩展已就绪</strong>——读数据已经走扩展（用你已登录的浏览器抓真菜单），
              这个面板里贴的 cookie <strong>可以不填、可以删掉</strong>，不影响 char 拿真数据。
            </div>
          </div>
        )}
        <div className="px-4 py-3 text-xs text-amber-700 bg-amber-50 flex items-start gap-2 border-b border-amber-100">
          <Warning size={14} weight="fill" className="shrink-0 mt-0.5" />
          <div className="leading-relaxed">
            Cookie 只存你本地浏览器，不上传 sully 数据库。但请求会经过项目方的 Cloudflare Worker
            才能转发到平台（CORS 没法直连）。介意的话二改时换成你自己的 Worker。
            {bridgeReady ? '装了扩展之后这条路是兜底——优先建议用扩展。' : ''}
          </div>
        </div>

        <div className="flex-1 overflow-y-auto px-4 py-3 space-y-4">
          {platforms.map(p => {
            const updatedAt = credentials.updatedAt?.[p];
            return (
              <div key={p} className="space-y-1.5">
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-2">
                    <span className="text-sm font-medium">{MEAL_PLATFORM_LABEL[p]}</span>
                    <span
                      className={`text-[10px] px-1.5 py-0.5 rounded ${
                        PLATFORM_REAL[p] === '已启用真实尝试'
                          ? 'bg-emerald-100 text-emerald-700'
                          : 'bg-slate-100 text-slate-500'
                      }`}
                    >
                      {PLATFORM_REAL[p]}
                    </span>
                  </div>
                  {credentials[p] && (
                    <span className="text-[10px] text-slate-400 flex items-center gap-1">
                      <CheckCircle size={10} weight="fill" className="text-emerald-500" />
                      {formatAge(updatedAt)}
                    </span>
                  )}
                </div>
                <div className="text-[11px] text-slate-500 leading-relaxed">{PLATFORM_HINTS[p]}</div>
                <textarea
                  value={drafts[p]}
                  onChange={e => setDrafts(prev => ({ ...prev, [p]: e.target.value }))}
                  placeholder="key1=val1; key2=val2; ..."
                  rows={3}
                  className="w-full text-xs font-mono px-2 py-1.5 rounded-lg bg-slate-50 border border-slate-200 focus:border-orange-400 focus:bg-white outline-none resize-none break-all"
                />
              </div>
            );
          })}
        </div>

        <div className="px-4 py-3 border-t border-black/5 flex items-center justify-end gap-2">
          <button
            onClick={onClose}
            className="px-3 py-1.5 rounded-full text-sm text-slate-600 hover:bg-slate-100"
          >
            取消
          </button>
          <button
            onClick={save}
            className="px-4 py-1.5 rounded-full bg-orange-500 text-white text-sm font-semibold hover:bg-orange-600"
          >
            保存
          </button>
        </div>
      </div>
    </div>
  );
};

export default CredentialsPanel;
