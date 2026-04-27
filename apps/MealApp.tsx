import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { ArrowLeft, Cpu, Key } from '@phosphor-icons/react';
import { useOS } from '../context/OSContext';
import { safeResponseJson } from '../utils/safeApi';
import { CharacterProfile } from '../types';
import { buildMealSystemPrompt, formatToolResultsForReplay } from './meal/prompt';
import { parseToolCalls, runToolCalls } from './meal/toolRunner';
import { EMPTY_MEAL_STATE, MealAppState, MealChatMessage } from './meal/types';
import { MealCartLine } from '../utils/mealClient';
import MealChat from './meal/MealChat';
import CartPanel from './meal/CartPanel';
import CredentialsPanel from './meal/CredentialsPanel';
import { MealCredentials, loadMealCredentials, saveMealCredentials } from './meal/credentials';
import { isMealBridgeReady, MealBridgeProgress, pingMealBridge } from '../utils/mealBridge';

const MAX_TOOL_LOOPS = 5;

const newId = () => `m_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 7)}`;

const SourceBadge: React.FC<{ source: string; reason?: string }> = ({ source, reason }) => {
  const map: Record<string, { label: string; cls: string; title: string }> = {
    real_bridge: {
      label: '真·扩展',
      cls: 'bg-emerald-100 text-emerald-700',
      title: '通过浏览器扩展从你已登录的浏览器拿到的真数据（无需 mtgsig）',
    },
    real: { label: '真·Worker', cls: 'bg-emerald-100 text-emerald-700', title: '通过 Worker 真接口拿到的数据' },
    mock_fallback: {
      label: 'mock',
      cls: 'bg-amber-100 text-amber-700',
      title: `真接口失败回退到占位${reason ? `：${reason}` : ''}`,
    },
    static_mock: {
      label: '离线 mock',
      cls: 'bg-slate-200 text-slate-600',
      title: `Worker 不通（多半是没开梯子），走前端静态占位${reason ? `：${reason}` : ''}`,
    },
    mock: { label: 'mock', cls: 'bg-slate-200 text-slate-600', title: '此平台暂未启用真实调用' },
  };
  const cfg = map[source] || { label: source, cls: 'bg-slate-100 text-slate-500', title: source };
  return (
    <span
      className={`text-[9px] font-bold px-1 py-0 rounded ${cfg.cls}`}
      title={cfg.title}
    >
      {cfg.label}
    </span>
  );
};

const MealApp: React.FC = () => {
  const { closeApp, characters, activeCharacterId, apiConfig, userProfile, addToast } = useOS();

  const initialChar = useMemo<CharacterProfile | null>(() => {
    if (activeCharacterId) {
      const c = characters.find(x => x.id === activeCharacterId);
      if (c) return c;
    }
    return characters[0] || null;
  }, [characters, activeCharacterId]);

  const [charId, setCharId] = useState<string | null>(initialChar?.id || null);
  const char = useMemo(() => characters.find(c => c.id === charId) || initialChar, [characters, charId, initialChar]);

  const [state, setState] = useState<MealAppState>(EMPTY_MEAL_STATE);
  const [messages, setMessages] = useState<MealChatMessage[]>([]);
  const [loading, setLoading] = useState(false);
  const [loadingHint, setLoadingHint] = useState<string | undefined>(undefined);
  const stateRef = useRef(state);
  stateRef.current = state;

  const [credentials, setCredentials] = useState<MealCredentials>(() => loadMealCredentials());
  const [credsOpen, setCredsOpen] = useState(false);
  const credentialsRef = useRef(credentials);
  credentialsRef.current = credentials;

  // 记一下最近一次工具调用回来的数据来源，用来在 header 显示徽章。
  const [lastSource, setLastSource] = useState<{ source: string; reason?: string } | null>(null);

  // 浏览器扩展状态
  const [bridgeReady, setBridgeReady] = useState(false);
  const [bridgeVersion, setBridgeVersion] = useState<string | undefined>(undefined);
  const [bridgeProgress, setBridgeProgress] = useState<MealBridgeProgress | null>(null);

  useEffect(() => {
    saveMealCredentials(credentials);
  }, [credentials]);

  useEffect(() => {
    let cancelled = false;
    const check = async () => {
      const local = isMealBridgeReady();
      if (!local.ready) {
        if (!cancelled) {
          setBridgeReady(false);
          setBridgeVersion(undefined);
        }
        return;
      }
      const ping = await pingMealBridge();
      if (cancelled) return;
      setBridgeReady(!!ping.ok);
      setBridgeVersion(ping.version);
    };
    check();
    // 用户可能刚装完扩展，每 3 秒重检 3 次
    const t1 = setTimeout(check, 3000);
    const t2 = setTimeout(check, 6000);
    return () => {
      cancelled = true;
      clearTimeout(t1);
      clearTimeout(t2);
    };
  }, []);

  const apiOk = !!apiConfig?.baseUrl && !!apiConfig?.apiKey && !!apiConfig?.model;

  const callLLM = useCallback(
    async (history: MealChatMessage[], systemPrompt: string): Promise<string> => {
      const payloadMessages = [
        { role: 'system' as const, content: systemPrompt },
        ...history.map(m => {
          // assistant 消息送回时用原始 content（含 [[TOOL]] 块），让模型看见自己上一轮调了啥。
          // tool 消息送回时把工具结果格式化为 user 角色（兼容性最高，不依赖 OpenAI 原生 function calling）。
          if (m.role === 'tool') {
            return { role: 'user' as const, content: formatToolResultsForReplay(m.toolResults || []) };
          }
          return { role: m.role as 'user' | 'assistant', content: m.content };
        }),
      ];
      const resp = await fetch(`${apiConfig.baseUrl.replace(/\/+$/, '')}/chat/completions`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${apiConfig.apiKey}`,
        },
        body: JSON.stringify({
          model: apiConfig.model,
          messages: payloadMessages,
          temperature: 0.7,
          max_tokens: 2000,
        }),
      });
      if (!resp.ok) {
        const text = await resp.text().catch(() => '');
        throw new Error(`LLM ${resp.status}: ${text.slice(0, 200)}`);
      }
      const data = await safeResponseJson(resp);
      const content: string = data?.choices?.[0]?.message?.content || '';
      return content;
    },
    [apiConfig]
  );

  const handleRemoveLine = (line: MealCartLine) => {
    setState(prev => ({
      ...prev,
      cart: prev.cart.filter(
        c => !(c.platform === line.platform && c.storeId === line.storeId && c.item.id === line.item.id)
      ),
      checkout: null,
    }));
  };

  const handleClearCart = () => {
    setState(prev => ({ ...prev, cart: [], checkout: null }));
  };

  const handleSend = async (userText: string) => {
    if (!char) {
      addToast('先去神经链接里选一个角色', 'info');
      return;
    }
    if (!apiOk) {
      addToast('API 还没填，去设置里填好 baseUrl / key / model', 'info');
      return;
    }

    const systemPrompt = buildMealSystemPrompt(char, userProfile, { bridgeReady });
    const userMsg: MealChatMessage = {
      id: newId(),
      role: 'user',
      content: userText,
      createdAt: Date.now(),
    };
    let history: MealChatMessage[] = [...messages, userMsg];
    setMessages(history);
    setLoading(true);

    try {
      for (let loop = 0; loop < MAX_TOOL_LOOPS; loop++) {
        setLoadingHint(loop === 0 ? `${char.name} 正在看菜单…` : `${char.name} 看完了，再想想…`);
        const raw = await callLLM(history, systemPrompt);
        const { stripped, calls } = parseToolCalls(raw);

        const assistantMsg: MealChatMessage = {
          id: newId(),
          role: 'assistant',
          content: raw,
          display: stripped,
          toolCalls: calls.length > 0 ? calls : undefined,
          createdAt: Date.now(),
        };
        history = [...history, assistantMsg];
        setMessages(history);

        if (calls.length === 0) break;

        // 工具一次性顺序执行，结束后再 commit state
        setLoadingHint(`${char.name} 正在加菜…`);
        const startState = stateRef.current;
        const { results, finalState } = await runToolCalls(
          calls,
          startState,
          credentialsRef.current,
          progress => {
            setBridgeProgress(progress);
            if (progress.status === 'done' || progress.status === 'error') {
              addToast(progress.message || progress.status, progress.status === 'done' ? 'success' : ('error' as any));
            }
          }
        );
        setState(finalState);
        stateRef.current = finalState;

        // 抽出最近一条带 source 的 ok 结果，更新 header 徽章
        for (let i = results.length - 1; i >= 0; i--) {
          const r = results[i];
          if (r.ok && r.data && typeof r.data.source === 'string' && r.data.source !== 'cache') {
            setLastSource({ source: r.data.source, reason: r.data.reason });
            break;
          }
        }

        const toolMsg: MealChatMessage = {
          id: newId(),
          role: 'tool',
          content: formatToolResultsForReplay(results),
          toolResults: results,
          createdAt: Date.now(),
        };
        history = [...history, toolMsg];
        setMessages(history);
      }
    } catch (e: any) {
      addToast(e?.message || '出错了', 'error' as any);
      const errMsg: MealChatMessage = {
        id: newId(),
        role: 'assistant',
        content: `（系统提示）调用 LLM 失败：${e?.message || e}`,
        display: `（系统提示）调用 LLM 失败：${e?.message || e}`,
        createdAt: Date.now(),
      };
      setMessages(prev => [...prev, errMsg]);
    } finally {
      setLoading(false);
      setLoadingHint(undefined);
    }
  };

  return (
    <div className="absolute inset-0 flex flex-col bg-gradient-to-br from-orange-100 via-pink-50 to-white text-slate-800">
      {/* Header */}
      <div className="px-4 py-3 flex items-center justify-between gap-2 border-b border-black/5 bg-white/70 backdrop-blur-md">
        <button onClick={closeApp} className="p-1.5 rounded-full hover:bg-black/5 shrink-0">
          <ArrowLeft size={18} weight="bold" />
        </button>
        <div className="text-center min-w-0 flex-1">
          <div className="text-sm font-bold tracking-wide flex items-center justify-center gap-1.5">
            <span>饭友 · 今天吃啥</span>
            {lastSource && <SourceBadge source={lastSource.source} reason={lastSource.reason} />}
          </div>
          <div className="text-[10px] text-slate-500 truncate">
            {char ? `${char.name} 帮你看 饿了么 / 美团 / 盒马` : '先选个角色'}
          </div>
        </div>
        <button
          onClick={() => setCredsOpen(true)}
          className="p-1.5 rounded-full hover:bg-black/5 shrink-0"
          title="贴平台 cookie（启用真实数据）"
        >
          <Key size={16} weight="bold" />
        </button>
        <select
          className="text-xs bg-white/70 border border-black/10 rounded-full px-2 py-1 outline-none shrink-0 max-w-[100px]"
          value={charId || ''}
          onChange={e => setCharId(e.target.value || null)}
          title="换个角色帮你点"
        >
          {characters.length === 0 && <option value="">无</option>}
          {characters.map(c => (
            <option key={c.id} value={c.id}>{c.name}</option>
          ))}
        </select>
      </div>

      <CredentialsPanel
        open={credsOpen}
        onClose={() => setCredsOpen(false)}
        credentials={credentials}
        onChange={setCredentials}
        bridgeReady={bridgeReady}
      />

      {!apiOk && (
        <div className="px-4 py-2 bg-amber-100/80 text-amber-800 text-xs flex items-center gap-2">
          <Cpu size={14} weight="bold" />
          API 还没配置好，去「设置」里填 baseUrl / key / model 后再回来。
        </div>
      )}

      <div
        className={`px-4 py-1.5 text-[11px] flex items-center gap-2 border-b border-black/5 ${
          bridgeReady ? 'bg-emerald-50/70 text-emerald-700' : 'bg-slate-50/70 text-slate-500'
        }`}
      >
        <span
          className={`inline-block w-1.5 h-1.5 rounded-full ${
            bridgeReady ? 'bg-emerald-500' : 'bg-slate-300'
          }`}
        />
        {bridgeReady ? (
          <span>
            扩展已就绪 v{bridgeVersion || '?'} — char 可以在你已登录的浏览器里自动加购了
          </span>
        ) : (
          <span>
            未装 SullyOS Meal Bridge 扩展，char 只能给 deeplink 你手动跳。
            <a
              href="https://github.com/qegj567-cloud/NOI2test/tree/main/extension"
              target="_blank"
              rel="noreferrer"
              className="underline ml-1"
            >
              安装方法
            </a>
          </span>
        )}
      </div>

      {bridgeProgress && bridgeProgress.status !== 'done' && bridgeProgress.status !== 'error' && (
        <div className="px-4 py-1.5 text-[11px] bg-orange-50 text-orange-700 flex items-center gap-2 border-b border-orange-100 animate-pulse">
          <span className="inline-block w-1.5 h-1.5 rounded-full bg-orange-500" />
          扩展进度：{bridgeProgress.status} {bridgeProgress.message ? `— ${bridgeProgress.message}` : ''}
        </div>
      )}

      {/* Body */}
      <div className="flex-1 min-h-0 grid grid-cols-1 sm:grid-cols-[1fr_280px]">
        <div className="min-h-0 sm:border-r border-black/5">
          <MealChat
            char={char || null}
            messages={messages}
            loading={loading}
            loadingHint={loadingHint}
            onSend={handleSend}
          />
        </div>
        <div className="hidden sm:block min-h-0">
          <CartPanel
            cart={state.cart}
            checkout={state.checkout}
            onRemove={handleRemoveLine}
            onClear={handleClearCart}
          />
        </div>
      </div>

      {/* Mobile cart strip — 折叠版购物车，宽度<sm 时显示 */}
      <div className="sm:hidden border-t border-black/5 bg-white/80 backdrop-blur-md max-h-[50%] overflow-hidden">
        <CartPanel
          cart={state.cart}
          checkout={state.checkout}
          onRemove={handleRemoveLine}
          onClear={handleClearCart}
        />
      </div>
    </div>
  );
};

export default MealApp;
