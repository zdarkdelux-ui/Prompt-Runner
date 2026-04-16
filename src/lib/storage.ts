import { PromptTemplate, RunHistory, AppSettings } from '../types';

const STORAGE_KEYS = {
  PROMPTS: 'prompt_runner_prompts',
  HISTORY: 'prompt_runner_history',
  SETTINGS: 'prompt_runner_settings',
  DRAFT: 'prompt_runner_current_draft'
};

export const storage = {
  getPrompts: (): PromptTemplate[] => {
    const data = localStorage.getItem(STORAGE_KEYS.PROMPTS);
    return data ? JSON.parse(data) : [];
  },
  savePrompts: (prompts: PromptTemplate[]) => {
    localStorage.setItem(STORAGE_KEYS.PROMPTS, JSON.stringify(prompts));
  },
  getHistory: (): RunHistory[] => {
    const data = localStorage.getItem(STORAGE_KEYS.HISTORY);
    return data ? JSON.parse(data) : [];
  },
  saveHistory: (history: RunHistory[]) => {
    localStorage.setItem(STORAGE_KEYS.HISTORY, JSON.stringify(history));
  },
  getSettings: (): AppSettings => {
    const data = localStorage.getItem(STORAGE_KEYS.SETTINGS);
    return data ? JSON.parse(data) : {
      theme: 'system',
      accentColor: '#3b82f6',
      autoSave: true,
      logOrder: 'newest-first',
      missingMarkerBehavior: 'warn'
    };
  },
  saveSettings: (settings: AppSettings) => {
    localStorage.setItem(STORAGE_KEYS.SETTINGS, JSON.stringify(settings));
  },
  getDraft: (): string => {
    return localStorage.getItem(STORAGE_KEYS.DRAFT) || '';
  },
  saveDraft: (content: string) => {
    localStorage.setItem(STORAGE_KEYS.DRAFT, content);
  }
};
