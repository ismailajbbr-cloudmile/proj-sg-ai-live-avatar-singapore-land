export const SUPPORTED_LOCALES = ["en-US", "zh-CN"] as const;
export type Locale = (typeof SUPPORTED_LOCALES)[number];
export const DEFAULT_LOCALE: Locale = "en-US";
export const SELECTED_LANG_KEY = "selectedLang";

export function isValidLocale(code: string): code is Locale {
  return (SUPPORTED_LOCALES as readonly string[]).includes(code);
}

export function readStoredLocale(): Locale {
  if (typeof window === "undefined") return DEFAULT_LOCALE;
  const stored = sessionStorage.getItem(SELECTED_LANG_KEY);
  return stored && isValidLocale(stored) ? stored : DEFAULT_LOCALE;
}

export interface LocaleStrings {
  lobby: {
    title: string;
    subtitle: string;
    prompts: string[];
    startButton: string;
    connecting: string;
    permError: string;
    languageEnglish: string;
    languageChinese: string;
  };
  chat: {
    welcome: (avatarName: string) => string;
    qrTts: string;
    qrCaption: string;
    errorEmpty: string;
    errorSystem: string;
    placeholder: string;
    thinking: string;
    header: string;
    waiting: (n: number) => string;
    speaking: string;
    privacy: string;
  };
  idle: {
    title: string;
    countdown: (n: number) => string;
    stay: string;
    newSession: string;
  };
  chatPage: {
    pttListening: string;
    pttHold: string;
    pttListeningShort: string;
    pttHoldShort: string;
    pttTalkShort: string;
    thinkingSr: string;
    toolbarChat: string;
    toolbarCaptions: string;
    toolbarEndCall: string;
    skipNext: string;
    skipAll: string;
  };
}

const STRINGS: Record<Locale, LocaleStrings> = {
  "en-US": {
    lobby: {
      title: "Hi, I'm your AI Concierge",
      subtitle: "Ask me anything about Marina Square",
      prompts: [
        "Where is the nearest restaurant?",
        "What events are happening this week?",
        "How do I get to Level 3?",
        "Where can I find parking?",
        "What time does the mall close?",
        "Are there any promotions today?",
      ],
      startButton: "Tap to Start",
      connecting: "Connecting...",
      permError: "Camera/Mic access denied. Continuing with text only...",
      languageEnglish: "English",
      languageChinese: "中文",
    },
    chat: {
      welcome: (avatarName) =>
        `Welcome to Marina Square. I'm your ${avatarName}. How can I assist you today?`,
      qrTts: "You can scan this QR code for detailed directions and information.",
      qrCaption: "You can scan this QR for detailed information:",
      errorEmpty: "Sorry, I am having trouble responding right now.",
      errorSystem: "I'm sorry, there was a system error when trying to respond.",
      placeholder: "Type your message...",
      thinking: "AI is thinking...",
      header: "Conversation",
      waiting: (n) => `${n} waiting`,
      speaking: "Speaking…",
      privacy: "Powered by CloudMile • Your privacy is protected",
    },
    idle: {
      title: "Still there?",
      countdown: (n) =>
        `This session will end in ${n} second${n !== 1 ? "s" : ""} due to inactivity.`,
      stay: "I'm Still Here",
      newSession: "Start New Session",
    },
    chatPage: {
      pttListening: "Listening, release to send",
      pttHold: "Push and hold to talk — release to send",
      pttListeningShort: "Listening...",
      pttHoldShort: "Push & Hold to Talk",
      pttTalkShort: "Hold to Talk",
      thinkingSr: "AI is thinking, please wait",
      toolbarChat: "Chat",
      toolbarCaptions: "Captions",
      toolbarEndCall: "End call",
      skipNext: "Next",
      skipAll: "Skip All",
    },
  },
  "zh-CN": {
    lobby: {
      title: "您好，我是您的 AI 礼宾",
      subtitle: "有关滨海广场的任何问题都可以问我",
      prompts: [
        "最近的餐厅在哪里？",
        "本周有什么活动？",
        "怎么去三楼？",
        "停车场在哪里？",
        "商场几点关门？",
        "今天有什么促销活动？",
      ],
      startButton: "点击开始",
      connecting: "连接中…",
      permError: "摄像头/麦克风访问被拒绝。将以文字模式继续…",
      languageEnglish: "English",
      languageChinese: "中文",
    },
    chat: {
      welcome: (avatarName) =>
        `欢迎来到滨海广场。我是您的${avatarName}。今天有什么可以帮您的？`,
      qrTts: "您可以扫描此二维码，获取详细的路线和信息。",
      qrCaption: "扫描此二维码获取详细信息：",
      errorEmpty: "抱歉，我现在无法回复。",
      errorSystem: "抱歉，系统出现错误，无法回复。",
      placeholder: "输入您的消息…",
      thinking: "AI 正在思考…",
      header: "对话",
      waiting: (n) => `${n} 条等待中`,
      speaking: "正在说话…",
      privacy: "由 CloudMile 提供技术支持 • 您的隐私受到保护",
    },
    idle: {
      title: "还在吗？",
      countdown: (n) => `由于无操作，会话将在 ${n} 秒后结束。`,
      stay: "我还在",
      newSession: "开始新会话",
    },
    chatPage: {
      pttListening: "正在聆听，松开发送",
      pttHold: "按住说话",
      pttListeningShort: "聆听中…",
      pttHoldShort: "按住说话",
      pttTalkShort: "说话",
      thinkingSr: "AI 正在思考，请稍候",
      toolbarChat: "聊天",
      toolbarCaptions: "字幕",
      toolbarEndCall: "结束通话",
      skipNext: "下一句",
      skipAll: "全部跳过",
    },
  },
};

export function getLocaleStrings(locale: string): LocaleStrings {
  return STRINGS[isValidLocale(locale) ? locale : DEFAULT_LOCALE];
}

export const LANGUAGE_NAMES: Record<Locale, string> = {
  "en-US": "English (US)",
  "zh-CN": "中文 (简体)",
};
