// 外卖助手 — 平台凭证（cookie）本地存储
//
// 三家平台的 cookie 各自独立，纯本地 localStorage（永不上传 sully 数据库）。
// 用户在 App 里贴一次，之后请求时由前端附在 header 里走 Worker。
// Worker 收到后转发给上游，但不持久化、不记日志。
//
// 安全权衡：cookie 必然要经过项目方的 Cloudflare Worker（CORS 没法绕），
// 这是 SullyOS 现有的小红书/网易云路径上已经在用的模式。强烈建议二改用户
// 换成自己的 Worker，这点 README 已经强调过。

import { MealPlatform } from '../../utils/mealClient';

const STORAGE_KEY = 'sully.meal.credentials.v1';

export interface MealCredentials {
  /**
   * 完整 Cookie header 字符串，格式：`key1=val1; key2=val2`
   * 用户从浏览器 DevTools → Network → 任意一个 waimai.meituan.com 请求里复制 Cookie 整串。
   */
  meituan?: string;
  eleme?: string;
  hema?: string;
  /** 最后一次更新 epoch ms，用来在 UI 上提示"7 天前贴的，可能过期了" */
  updatedAt?: Partial<Record<MealPlatform, number>>;
}

const EMPTY: MealCredentials = { updatedAt: {} };

export function loadMealCredentials(): MealCredentials {
  if (typeof window === 'undefined') return EMPTY;
  try {
    const raw = window.localStorage.getItem(STORAGE_KEY);
    if (!raw) return EMPTY;
    const parsed = JSON.parse(raw);
    if (!parsed || typeof parsed !== 'object') return EMPTY;
    return { ...EMPTY, ...parsed, updatedAt: { ...(parsed.updatedAt || {}) } };
  } catch {
    return EMPTY;
  }
}

export function saveMealCredentials(creds: MealCredentials): void {
  if (typeof window === 'undefined') return;
  try {
    window.localStorage.setItem(STORAGE_KEY, JSON.stringify(creds));
  } catch {
    // 隐私模式或配额满，静默失败
  }
}

export function setPlatformCookie(
  prev: MealCredentials,
  platform: MealPlatform,
  value: string
): MealCredentials {
  const trimmed = value.trim();
  const next: MealCredentials = {
    ...prev,
    updatedAt: { ...(prev.updatedAt || {}) },
  };
  if (trimmed) {
    next[platform] = trimmed;
    next.updatedAt![platform] = Date.now();
  } else {
    delete next[platform];
    delete next.updatedAt![platform];
  }
  return next;
}

export function getPlatformCookie(creds: MealCredentials, platform: MealPlatform): string | undefined {
  return creds[platform];
}
