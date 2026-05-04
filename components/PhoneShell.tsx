


import React, { useState, useEffect } from 'react';
import { useOS } from '../context/OSContext';
import StatusBar from './os/StatusBar';
import Launcher from '../apps/Launcher';
import Settings from '../apps/Settings';
import Character from '../apps/Character';
import Chat from '../apps/Chat'; 
import GroupChat from '../apps/GroupChat'; 
import ThemeMaker from '../apps/ThemeMaker';
import Appearance from '../apps/Appearance';
import Gallery from '../apps/Gallery'; 
import DateApp from '../apps/DateApp'; 
import UserApp from '../apps/UserApp';
import JournalApp from '../apps/JournalApp'; 
import ScheduleApp from '../apps/ScheduleApp'; 
import RoomApp from '../apps/RoomApp'; 
import CheckPhone from '../apps/CheckPhone';
import SocialApp from '../apps/SocialApp'; 
import StudyApp from '../apps/StudyApp'; 
import FAQApp from '../apps/FAQApp'; 
import GameApp from '../apps/GameApp'; 
import WorldbookApp from '../apps/WorldbookApp';
import NovelApp from '../apps/NovelApp'; 
import BankApp from '../apps/BankApp';
import XhsStockApp from '../apps/XhsStockApp';
import XhsFreeRoamApp from '../apps/XhsFreeRoamApp';
import BrowserApp from '../apps/BrowserApp';
import SongwritingApp from '../apps/SongwritingApp';
import MusicApp from '../apps/MusicApp';
import CallApp from '../apps/CallApp';
import VoiceDesignerApp from '../apps/VoiceDesignerApp';
import GuidebookApp from '../apps/GuidebookApp';
import LifeSimApp from '../apps/LifeSimApp';
import MemoryPalaceApp from '../apps/MemoryPalaceApp';
import HandbookApp from '../apps/HandbookApp';
import QQBridge from '../apps/QQBridge';
import { SpecialMomentsApp } from './ValentineEvent';
// Trial: 版本更新弹窗已禁用, import 保留为空
import { AppID } from '../types';
import { App as CapApp } from '@capacitor/app';
import { StatusBar as CapStatusBar, Style as StatusBarStyle } from '@capacitor/status-bar';
import { LocalNotifications } from '@capacitor/local-notifications';
import { Capacitor } from '@capacitor/core';
import { isIOSStandaloneWebApp } from '../utils/iosStandalone';
import AppErrorBoundary from './os/AppErrorBoundary';
import GlobalMiniPlayer from './os/GlobalMiniPlayer';

/*
// Internal Error Boundary Component
class AppErrorBoundary extends Component<{ children: React.ReactNode, onCloseApp: () => void, resetKey: string }, { hasError: boolean, error: Error | null, copyLabel: string }> {
    private copyLabelTimer: number | null = null;

    constructor(props: { children: React.ReactNode, onCloseApp: () => void, resetKey: string }) {
        super(props);
        this.state = { hasError: false, error: null, copyLabel: '复制报错信息' };
    }

    static getDerivedStateFromError(error: Error) {
        return { hasError: true, error };
    }

    componentDidCatch(error: Error, errorInfo: ErrorInfo) {
        console.error("App Crash:", error, errorInfo);
    }

    // Reset error state only when the active app changes.
    componentDidUpdate(prevProps: { children: React.ReactNode, onCloseApp: () => void, resetKey: string }) {
        if (prevProps.resetKey !== this.props.resetKey && this.state.hasError) {
            this.setState({ hasError: false, error: null, copyLabel: '复制报错信息' });
        }
    }

    componentWillUnmount() {
        if (this.copyLabelTimer) window.clearTimeout(this.copyLabelTimer);
    }

    private updateCopyLabel = (label: string) => {
        if (this.copyLabelTimer) window.clearTimeout(this.copyLabelTimer);
        this.setState({ copyLabel: label });
        this.copyLabelTimer = window.setTimeout(() => {
            this.setState({ copyLabel: '复制报错信息' });
            this.copyLabelTimer = null;
        }, 1800);
    };

    private handleCopy = async () => {
        const errText = this.state.error?.stack || this.state.error?.message || 'Unknown Error';

        try {
            if (navigator.clipboard?.writeText) {
                await navigator.clipboard.writeText(errText);
                this.updateCopyLabel('已复制');
                return;
            }
        } catch {
            // Fall through to legacy copy path.
        }

        try {
            const textarea = document.createElement('textarea');
            textarea.value = errText;
            textarea.setAttribute('readonly', 'true');
            textarea.style.position = 'fixed';
            textarea.style.opacity = '0';
            textarea.style.pointerEvents = 'none';
            document.body.appendChild(textarea);
            textarea.focus();
            textarea.select();
            const copied = document.execCommand('copy');
            document.body.removeChild(textarea);
            if (copied) {
                this.updateCopyLabel('已复制');
                return;
            }
        } catch {
            // Fall through to prompt fallback.
        }

        window.prompt('请手动复制报错信息', errText);
        this.updateCopyLabel('请手动复制');
    };

    render() {
        if (this.state.hasError) {
            return (
                <div className="w-full h-full flex flex-col items-center justify-center bg-slate-900 text-white p-6 text-center space-y-4">
                    <img src="https://cdnjs.cloudflare.com/ajax/libs/twemoji/14.0.2/72x72/1f635.png" alt="error" className="w-10 h-10" />
                    <h2 className="text-lg font-bold">应用运行错误</h2>
                    <p className="text-xs text-slate-400 font-mono bg-black/30 p-3 rounded max-w-full overflow-auto max-h-40 select-text break-all whitespace-pre-wrap">
                        {this.state.error?.message || 'Unknown Error'}
                    </p>
                    <button
                        onClick={() => {
                            const errText = this.state.error?.message || 'Unknown Error';
                            navigator.clipboard?.writeText(errText).then(() => {}).catch(() => {});
                        }}
                        className="px-4 py-2 bg-slate-700 rounded-full text-xs active:scale-95 transition-transform"
                    >
                        复制错误信息
                    </button>
                    <button
                        onClick={() => { this.setState({ hasError: false }); this.props.onCloseApp(); }}
                        className="px-6 py-3 bg-red-600 rounded-full font-bold text-sm shadow-lg active:scale-95 transition-transform"
                    >
                        返回桌面
                    </button>
                </div>
            );
        }
        return this.props.children;
    }
}
*/

const DISCLAIMER_KEY = 'sullyos_disclaimer_accepted';
const ONBOARDING_KEY = 'sullyos_trial_onboarding_done';

// Trial: 多步新手指引, 走完才算结束
const ONBOARDING_STEPS: { title: string; emoji: string; lines: React.ReactNode[] }[] = [
  {
    emoji: '1f44b',
    title: '欢迎来到 SullyOS',
    lines: [
      <>这是一台跑在浏览器里的"手机"，每个 app 对应一种和 AI 角色相处的方式。</>,
      <>试玩版只保留最核心的几款；接下来 30 秒带你过一遍。</>,
    ],
  },
  {
    emoji: '1f5fa',
    title: '认识主屏',
    lines: [
      <><b>神经链接</b> · 创建/管理你的角色（人设、外观、记忆）</>,
      <><b>Message</b> · 和角色聊天的主战场</>,
      <><b>见面 / 小小窝 / 相册 / 交换日记 / TRPG / 世界书</b> · 各种额外玩法</>,
      <><b>档案</b> · 你自己的资料（角色会以此称呼你）</>,
      <><b>设置</b> · 在这里配 API、备份数据等</>,
    ],
  },
  {
    emoji: '1f9e0',
    title: '第一步：打开「神经链接」',
    lines: [
      <>它在<b>主屏左上第一个图标</b>。</>,
      <>进去之后可以创建角色，或直接用内置的预设角色 <b>Sully</b> 开始。</>,
    ],
  },
  {
    emoji: '1f511',
    title: '第二步：到「设置」配 API',
    lines: [
      <>角色对话靠的是你自己的 LLM API，<b>没配 API 角色不会回话</b>。</>,
      <>到 dock 右侧第四个【设置】，填入 <b>URL / Key / Model</b> 三项，点保存。</>,
      <>没有 API？文档里有推荐渠道。</>,
    ],
  },
  {
    emoji: '1f4ac',
    title: '第三步：发出第一条消息',
    lines: [
      <>回到 dock 第一个【Message】，点你的角色头像进去对话。</>,
      <>底部输入框里随便打一句话，按发送 — 就开始了。</>,
      <>祝玩得开心 ✨</>,
    ],
  },
];

const TwemojiBig: React.FC<{ code: string; size?: number }> = ({ code, size = 56 }) => (
  <img
    src={`https://cdnjs.cloudflare.com/ajax/libs/twemoji/14.0.2/72x72/${code}.png`}
    alt=""
    style={{ width: size, height: size }}
    className="mx-auto mb-3 drop-shadow-sm"
  />
);

const OnboardingPopup: React.FC<{ onDone: () => void }> = ({ onDone }) => {
  const [step, setStep] = useState(0);
  const total = ONBOARDING_STEPS.length;
  const cur = ONBOARDING_STEPS[step];
  const isLast = step === total - 1;

  return (
    <div className="fixed inset-0 z-[9998] flex items-center justify-center p-5 animate-fade-in">
      <div className="absolute inset-0 bg-black/60 backdrop-blur-md" />
      <div className="relative w-full max-w-sm bg-white/95 backdrop-blur-xl rounded-[2.5rem] shadow-2xl border border-white/30 overflow-hidden animate-slide-up">
        {/* Progress bar */}
        <div className="h-1 bg-slate-100">
          <div
            className="h-full bg-gradient-to-r from-indigo-500 to-purple-500 transition-all duration-300"
            style={{ width: `${((step + 1) / total) * 100}%` }}
          />
        </div>

        <div className="pt-7 pb-3 px-6 text-center">
          <TwemojiBig code={cur.emoji} />
          <h2 className="text-lg font-extrabold text-slate-800">{cur.title}</h2>
          <p className="text-[11px] text-slate-400 mt-1">第 {step + 1} / {total} 步 · 新手指引</p>
        </div>

        <div className="px-6 pb-4 max-h-[55vh] overflow-y-auto no-scrollbar space-y-2.5">
          {cur.lines.map((line, i) => (
            <p key={i} className="text-[13px] text-slate-600 leading-relaxed">{line}</p>
          ))}
        </div>

        <div className="px-6 pb-7 pt-2 flex gap-2">
          {step > 0 && (
            <button
              onClick={() => setStep(s => Math.max(0, s - 1))}
              className="flex-1 py-3 bg-slate-100 text-slate-600 font-bold rounded-2xl active:scale-95 transition-transform text-sm"
            >
              上一步
            </button>
          )}
          <button
            onClick={() => {
              if (isLast) onDone();
              else setStep(s => s + 1);
            }}
            className="flex-[2] py-3 bg-gradient-to-r from-indigo-500 to-purple-500 text-white font-bold rounded-2xl shadow-lg shadow-indigo-200 active:scale-95 transition-transform text-sm"
          >
            {isLast ? '我懂了，开始体验' : '下一步'}
          </button>
        </div>
      </div>
    </div>
  );
};

const DisclaimerPopup: React.FC<{ onAccept: () => void }> = ({ onAccept }) => (
  <div className="fixed inset-0 z-[9999] flex items-center justify-center p-5 animate-fade-in">
    <div className="absolute inset-0 bg-black/60 backdrop-blur-md" />
    <div className="relative w-full max-w-sm bg-white/95 backdrop-blur-xl rounded-[2.5rem] shadow-2xl border border-white/30 overflow-hidden animate-slide-up">
      {/* Header */}
      <div className="pt-7 pb-3 px-6 text-center">
        <img src="https://cdnjs.cloudflare.com/ajax/libs/twemoji/14.0.2/72x72/1f4e2.png" alt="announcement" className="w-8 h-8 mb-2" />
        <h2 className="text-lg font-extrabold text-slate-800">测试版提示</h2>
        <p className="text-[11px] text-slate-400 mt-1">Trial · 手抓糯米机 (SullyOS)</p>
      </div>

      {/* Content */}
      <div className="px-6 pb-4 space-y-3">
        <p className="text-[13px] text-slate-600 leading-relaxed text-center">
          该版本为<strong className="text-slate-800">手抓糯米机（SullyOS）测试版本</strong>，数据与正式版互通，请妥善保存。
        </p>
      </div>

      {/* Footer */}
      <div className="px-6 pb-7 pt-2">
        <button
          onClick={onAccept}
          className="w-full py-3.5 bg-gradient-to-r from-indigo-500 to-purple-500 text-white font-bold rounded-2xl shadow-lg shadow-indigo-200 active:scale-95 transition-transform text-sm"
        >
          我已知悉，继续使用
        </button>
      </div>
    </div>
  </div>
);

const PhoneShell: React.FC = () => {
  const { theme, isLocked, unlock, activeApp, closeApp, virtualTime, isDataLoaded, toasts, unreadMessages, characters, handleBack, suspendedCall, resumeCall, activeCharacterId } = useOS();
  const useIOSStandaloneLayout = isIOSStandaloneWebApp();

  // Disclaimer popup for first-time users
  const [showDisclaimer, setShowDisclaimer] = useState(() => {
    try {
      return !localStorage.getItem(DISCLAIMER_KEY);
    } catch {
      return true;
    }
  });

  const handleAcceptDisclaimer = () => {
    try {
      localStorage.setItem(DISCLAIMER_KEY, Date.now().toString());
    } catch { /* ignore */ }
    setShowDisclaimer(false);
  };

  // Trial: 新手指引 — 仅在用户接受 disclaimer 后、且没走过指引时弹出
  const [showOnboarding, setShowOnboarding] = useState(() => {
    try {
      return !localStorage.getItem(ONBOARDING_KEY);
    } catch { return true; }
  });
  const handleFinishOnboarding = () => {
    try { localStorage.setItem(ONBOARDING_KEY, Date.now().toString()); } catch { /* ignore */ }
    setShowOnboarding(false);
  };

  // Capacitor Native Handling
  useEffect(() => {
    const initNative = async () => {
        if (Capacitor.isNativePlatform()) {
            try {
                await CapStatusBar.setOverlaysWebView({ overlay: true });
                await CapStatusBar.hide();
                await CapStatusBar.setStyle({ style: StatusBarStyle.Dark });

                const permStatus = await LocalNotifications.checkPermissions();
                if (permStatus.display !== 'granted') {
                    await LocalNotifications.requestPermissions();
                }
            } catch (e) {
                console.error("Native init failed", e);
            }
        }
    };
    initNative();

    // Handle Android Hardware Back Button
    const setupBackButton = async () => {
        if (Capacitor.isNativePlatform()) {
            try {
                await CapApp.removeAllListeners();
                CapApp.addListener('backButton', ({ canGoBack }) => {
                    if (isLocked) {
                        CapApp.exitApp();
                    } else {
                        handleBack(); // Delegate to OSContext logic
                    }
                });
            } catch (e) { console.log('Back button listener setup failed'); }
        }
    };

    setupBackButton();

    return () => {
        if (Capacitor.isNativePlatform()) {
            CapApp.removeAllListeners().catch(() => {});
        }
    };
  }, [activeApp, isLocked, closeApp, handleBack]);

  // Force scroll to top when app changes to prevent "push up" glitches on iOS
  useEffect(() => {
      window.scrollTo(0, 0);
  }, [activeApp]);

  // 把 theme.wallpaper 字符串转成可以直接塞给 CSS background 的值。
  // 支持: http URL / data: / blob: / 站内相对路径 (./trial/x.png 或 /trial/x.png) /
  //       CSS 渐变字符串 (linear-gradient / radial-gradient / conic-gradient) /
  //       纯色 hex。
  const wallpaperToBg = (wp: string | undefined | null): string => {
    if (!wp) return '#0f1115';
    const v = wp.trim();
    if (/^(linear-gradient|radial-gradient|conic-gradient)\(/.test(v)) return v;
    if (/^#[0-9a-fA-F]{3,8}$/.test(v) || v.startsWith('rgb') || v.startsWith('hsl')) return v;
    // 其它都按图片 URL 处理 (含 http/data:/blob:/相对路径/绝对路径)
    return `url("${v}")`;
  };

  useEffect(() => {
    if (typeof document === 'undefined') return;
    const backgroundValue = wallpaperToBg(theme.wallpaper);
    [document.documentElement, document.body].forEach((element) => {
      element.style.background = backgroundValue;
      element.style.backgroundPosition = 'center';
      element.style.backgroundSize = 'cover';
      element.style.backgroundRepeat = 'no-repeat';
    });
  }, [theme.wallpaper]);

  if (!isDataLoaded) {
    return <div className="w-full h-full bg-black flex items-center justify-center"><div className="w-8 h-8 border-2 border-white/20 border-t-white rounded-full animate-spin"></div></div>;
  }

  const getBgStyle = (wp: string) => wallpaperToBg(wp);

  const bgImageValue = getBgStyle(theme.wallpaper);
  const contentColor = theme.contentColor || '#ffffff';

  if (isLocked) {
    const unreadCount = Object.values(unreadMessages).reduce((a,b) => a+b, 0);
    const unreadCharId = Object.keys(unreadMessages)[0];
    const unreadChar = unreadCharId ? characters.find(c => c.id === unreadCharId) : null;

        return (
      <div 
        onClick={() => {
            // Only ask once when permission is still undecided; don't keep poking blocked/denied browsers.
            if ('Notification' in window && Notification.permission === 'default') {
                Notification.requestPermission();
            }
            unlock();
        }}
        className="relative w-full h-full bg-cover bg-center cursor-pointer overflow-hidden group font-light select-none overscroll-none"
        style={{ backgroundImage: bgImageValue, color: contentColor }}
      >
        <div className="absolute inset-0 bg-black/5 backdrop-blur-sm transition-all group-hover:backdrop-blur-none group-hover:bg-transparent duration-700" />
        
        <div className="absolute top-24 w-full text-center drop-shadow-[0_2px_4px_rgba(0,0,0,0.3)]">
           <div className="text-8xl tracking-tighter opacity-95 font-bold">
             {virtualTime.hours.toString().padStart(2,'0')}<span className="animate-pulse">:</span>{virtualTime.minutes.toString().padStart(2,'0')}
           </div>
           <div className="text-lg tracking-widest opacity-90 mt-2 uppercase text-xs font-bold">SullyOS Simulation</div>
        </div>

        {unreadCount > 0 && (
            <div className="absolute top-[40%] left-4 right-4 animate-slide-up">
                <div className="bg-white/20 backdrop-blur-md rounded-2xl p-4 shadow-lg border border-white/10 flex items-center gap-4">
                    <div className="w-10 h-10 rounded-xl bg-green-500 flex items-center justify-center text-white shrink-0 shadow-sm">
                        <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="currentColor" className="w-6 h-6"><path fillRule="evenodd" d="M4.804 21.644A6.707 6.707 0 0 0 6 21.75a6.721 6.721 0 0 0 3.583-1.029c.774.182 1.584.279 2.417.279 5.322 0 9.75-3.97 9.75-9 0-5.03-4.428-9-9.75-9s-9.75 3.97-9.75 9c0 2.409 1.025 4.587 2.674 6.192.232.226.277.428.254.543a3.73 3.73 0 0 1-.814 1.686.75.75 0 0 0 .44 1.223ZM8.25 10.875a1.125 1.125 0 1 0 0 2.25 1.125 1.125 0 0 0 0-2.25ZM10.875 12a1.125 1.125 0 1 1 2.25 0 1.125 1.125 0 0 1-2.25 0Zm4.875-1.125a1.125 1.125 0 1 0 0 2.25 1.125 1.125 0 0 0 0-2.25Z" clipRule="evenodd" /></svg>
                    </div>
                    <div className="flex-1 min-w-0 text-white text-left">
                        <div className="font-bold text-sm flex justify-between">
                            <span>{unreadChar ? unreadChar.name : 'Message'}</span>
                            <span className="text-[10px] opacity-70">刚刚</span>
                        </div>
                        <div className="text-xs opacity-90 truncate">
                            {unreadCount > 1 ? `收到 ${unreadCount} 条新消息` : '发来了一条新消息'}
                        </div>
                    </div>
                </div>
            </div>
        )}

        <div className="absolute bottom-12 w-full flex flex-col items-center gap-3 animate-pulse opacity-80 drop-shadow-md">
          <div className="w-1 h-8 rounded-full bg-gradient-to-b from-transparent to-current"></div>
          <span className="text-[10px] tracking-widest uppercase font-semibold">Tap to Unlock</span>
        </div>
      </div>
    );
  }

  const renderApp = () => {
    switch (activeApp) {
      case AppID.Settings: return <Settings />;
      case AppID.Character: return <Character />;
      case AppID.Chat: return <Chat />;
      case AppID.GroupChat: return <GroupChat />; 
      case AppID.ThemeMaker: return <ThemeMaker />;
      case AppID.Appearance: return <Appearance />;
      case AppID.Gallery: return <Gallery />;
      case AppID.Date: return <DateApp />; 
      case AppID.User: return <UserApp />;
      case AppID.Journal: return <JournalApp />; 
      case AppID.Schedule: return <ScheduleApp />;
      case AppID.Room: return <RoomApp />; 
      case AppID.CheckPhone: return <CheckPhone />;
      case AppID.Social: return <SocialApp />;
      case AppID.Study: return <StudyApp />; 
      case AppID.FAQ: return <FAQApp />; 
      case AppID.Game: return <GameApp />; 
      case AppID.Worldbook: return <WorldbookApp />;
      case AppID.Novel: return <NovelApp />; 
      case AppID.Bank: return <BankApp />;
      case AppID.XhsStock: return <XhsStockApp />;
      case AppID.XhsFreeRoam: return <XhsFreeRoamApp />;
      case AppID.Browser: return <BrowserApp />;
      case AppID.Songwriting: return <SongwritingApp />;
      case AppID.Music: return <MusicApp />;
      case AppID.Call: return <CallApp />;
      case AppID.VoiceDesigner: return <VoiceDesignerApp />;
      case AppID.Guidebook: return <GuidebookApp />;
      case AppID.LifeSim: return <LifeSimApp />;
      case AppID.MemoryPalace: return <MemoryPalaceApp />;
      case AppID.Handbook: return <HandbookApp />;
      case AppID.QQBridge: return <QQBridge />;
      case AppID.SpecialMoments: return <SpecialMomentsApp />;
      case AppID.Launcher:
      default: return <Launcher />;
    }
  };

  return (
    <div className="relative w-full h-full overflow-hidden bg-gradient-to-br from-pink-200 via-purple-200 to-indigo-200 text-slate-900 font-sans select-none overscroll-none">
       {/* Optimized Background Layer */}
       <div 
         className="absolute inset-0 bg-cover bg-center transition-all duration-700 ease-[cubic-bezier(0.25,0.1,0.25,1)]"
         style={{ 
             backgroundImage: bgImageValue,
             transform: activeApp !== AppID.Launcher ? 'scale(1.1)' : 'scale(1)',
             filter: activeApp !== AppID.Launcher ? 'blur(10px)' : 'none',
             opacity: activeApp !== AppID.Launcher ? 0.6 : 1,
             backfaceVisibility: 'hidden',
             contain: useIOSStandaloneLayout ? undefined : 'strict'
         }}
       />
       
       <div className={`absolute inset-0 transition-all duration-500 ${activeApp === AppID.Launcher ? 'bg-transparent' : 'bg-white/50 backdrop-blur-3xl'}`} />
       
       {/* 
          CRITICAL FIX: 
          Using 'absolute inset-0' prevents layout collapse.
          REMOVED 'flex flex-col' to fix layout issues in CheckPhone (gap) and SocialApp (jumping).
          Now it acts as a pure container for full-screen apps.
       */}
      <div 
  className="absolute inset-0 z-10 w-full h-full overflow-hidden bg-transparent overscroll-none flex flex-col"
  style={{ 
      paddingTop: activeApp !== AppID.Launcher ? 'env(safe-area-inset-top)' : 0,
      paddingBottom: activeApp !== AppID.Launcher ? 'env(safe-area-inset-bottom)' : 0
  }}
> 
          {/* App Container */}
         <div className="flex-1 relative overflow-hidden" style={{ contain: useIOSStandaloneLayout ? undefined : 'layout style paint' }}>
    <AppErrorBoundary onCloseApp={closeApp} resetKey={`${activeApp}:${activeCharacterId || 'none'}`}>
        {renderApp()}
    </AppErrorBoundary>
</div>

          {/* Overlays: Status Bar (Top) */}
          {!theme.hideStatusBar && <StatusBar />}
          
          {/* Overlays: Suspended Call Bar */}
          {suspendedCall && activeApp !== AppID.Call && (
            <button
              onClick={resumeCall}
              className="absolute top-7 left-0 w-full z-[55] flex items-center justify-center gap-2 bg-emerald-500 text-white text-xs font-bold py-1.5 animate-pulse cursor-pointer active:bg-emerald-600 transition-colors"
            >
              <span className="w-2 h-2 rounded-full bg-white animate-ping" />
              <span>通话中 · {suspendedCall.charName}</span>
              <span className="opacity-70">点击返回</span>
            </button>
          )}

          {/* Overlays: Global Mini Player (when music is playing in background) */}
          <GlobalMiniPlayer />

          {/* Overlays: Toasts (Top) */}
          <div className="absolute top-12 left-0 w-full flex flex-col items-center gap-2 pointer-events-none z-[60]">
              {toasts.map(toast => (
                 <div key={toast.id} className="animate-fade-in bg-white/95 backdrop-blur-xl px-4 py-3 rounded-2xl shadow-xl border border-black/5 flex items-center gap-3 max-w-[85%] ring-1 ring-white/20">
                     {toast.type === 'success' && <div className="w-2.5 h-2.5 rounded-full bg-green-500 shrink-0"></div>}
                     {toast.type === 'error' && <div className="w-2.5 h-2.5 rounded-full bg-red-500 shrink-0"></div>}
                     {toast.type === 'info' && <div className="w-2.5 h-2.5 rounded-full bg-primary shrink-0"></div>}
                     <span className="text-xs font-bold text-slate-800 truncate leading-none">{toast.message}</span>
                 </div>
              ))}
           </div>
       </div>

       {/* First-time disclaimer popup */}
       {showDisclaimer && <DisclaimerPopup onAccept={handleAcceptDisclaimer} />}

       {/* Trial: 版本更新弹窗 disabled */}

       {/* Trial: 新手指引 (disclaimer 通过后才出现) */}
       {!showDisclaimer && showOnboarding && (
         <OnboardingPopup onDone={handleFinishOnboarding} />
       )}
    </div>
  );
};

export default PhoneShell;
