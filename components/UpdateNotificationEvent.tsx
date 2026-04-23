/**
 * UpdateNotificationEvent.tsx
 * 版本更新强制提醒弹窗 (2026.4)
 *
 * 所有尚未确认过本次弹窗的用户，打开后都会被强制接到一次，
 * 点击"查看更新"后会跳转到使用帮助 App 的 2026 年 4 月更新页。
 */

import React from 'react';
import { useOS } from '../context/OSContext';
import { AppID } from '../types';

export const UPDATE_NOTIFICATION_KEY = 'sullyos_update_2026_04_seen';
export const FAQ_TARGET_SECTION_KEY = 'sullyos_faq_target_section';
export const CHANGELOG_2026_04 = 'changelog-2026-04';

export const shouldShowUpdateNotification = (): boolean => {
    try {
        return !localStorage.getItem(UPDATE_NOTIFICATION_KEY);
    } catch {
        return false;
    }
};

interface UpdateNotificationPopupProps {
    onClose: () => void;
}

export const UpdateNotificationPopup: React.FC<UpdateNotificationPopupProps> = ({ onClose }) => {
    const { openApp } = useOS();

    const handleView = () => {
        try {
            localStorage.setItem(UPDATE_NOTIFICATION_KEY, Date.now().toString());
            sessionStorage.setItem(FAQ_TARGET_SECTION_KEY, CHANGELOG_2026_04);
        } catch { /* ignore */ }
        openApp(AppID.FAQ);
        onClose();
    };

    return (
        <div className="fixed inset-0 z-[9998] flex items-center justify-center p-5 animate-fade-in">
            <div className="absolute inset-0 bg-black/60 backdrop-blur-md" />
            <div className="relative w-full max-w-sm bg-white/95 backdrop-blur-xl rounded-[2.5rem] shadow-2xl border border-white/30 overflow-hidden animate-slide-up">
                <div className="pt-7 pb-3 px-6 text-center">
                    <img
                        src="https://cdnjs.cloudflare.com/ajax/libs/twemoji/14.0.2/72x72/2728.png"
                        alt="update"
                        className="w-10 h-10 mx-auto mb-2"
                    />
                    <h2 className="text-lg font-extrabold text-slate-800">版本更新提醒</h2>
                    <p className="text-[11px] text-slate-400 mt-1">2026 年 4 月 · 向量记忆更新</p>
                </div>

                <div className="px-6 pb-4 space-y-3">
                    <div className="bg-gradient-to-br from-indigo-50 to-purple-50 border border-indigo-100 rounded-2xl p-4">
                        <p className="text-[13px] text-slate-700 leading-relaxed">
                            本次更新带来了<strong className="text-indigo-600">向量记忆</strong>与自动归档等重要变化，记忆系统的玩法和老版本不同。
                        </p>
                        <p className="text-[12px] text-slate-500 leading-relaxed mt-2">
                            为避免使用困惑，请先阅读本次的更新说明。你可以稍后在"使用帮助 → 更新日志"中随时重读。
                        </p>
                    </div>
                    <div className="bg-amber-50 border border-amber-200 rounded-2xl p-3">
                        <p className="text-[12px] font-bold text-amber-700 text-center">
                            点击下方按钮查看本次更新说明
                        </p>
                    </div>
                </div>

                <div className="px-6 pb-7 pt-2">
                    <button
                        onClick={handleView}
                        className="w-full py-3.5 bg-gradient-to-r from-indigo-500 to-purple-500 text-white font-bold rounded-2xl shadow-lg shadow-indigo-200 active:scale-95 transition-transform text-sm"
                    >
                        查看 2026 年 4 月更新内容
                    </button>
                </div>
            </div>
        </div>
    );
};

interface UpdateNotificationControllerProps {
    onClose: () => void;
}

export const UpdateNotificationController: React.FC<UpdateNotificationControllerProps> = ({ onClose }) => {
    return <UpdateNotificationPopup onClose={onClose} />;
};
