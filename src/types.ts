export type PromptStatus = 'draft' | 'active' | 'archive';

export interface PromptTemplate {
  id: string;
  name: string;
  content: string;
  description: string;
  tags: string[];
  color: string;
  status: PromptStatus;
  createdAt: number;
  updatedAt: number;
  isPinned?: boolean;
}

export interface LogEntry {
  id: string;
  timestamp: number;
  type: 'info' | 'success' | 'warning' | 'error';
  message: string;
  step?: string;
}

export interface RunHistory {
  id: string;
  templateId: string;
  templateName: string;
  targetUrl: string;
  finalPrompt: string;
  status: 'success' | 'error' | 'running';
  startTime: number;
  endTime?: number;
  duration?: number;
  logs: LogEntry[];
}

export interface AppSettings {
  theme: 'light' | 'dark' | 'system';
  accentColor: string;
  autoSave: boolean;
  logOrder: 'newest-first' | 'oldest-first';
  missingMarkerBehavior: 'warn' | 'append';
}
