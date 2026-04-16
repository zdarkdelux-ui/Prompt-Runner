import React, { useState, useEffect, useMemo } from 'react';
import { 
  Plus, 
  Search, 
  Play, 
  Save, 
  Trash2, 
  Copy, 
  ExternalLink, 
  History as HistoryIcon, 
  Settings as SettingsIcon,
  ChevronLeft,
  ChevronRight,
  Pin,
  Tag,
  Clock,
  CheckCircle2,
  AlertCircle,
  Loader2,
  X,
  FileText,
  Layout,
  Moon,
  Sun,
  Monitor
} from 'lucide-react';
import { motion, AnimatePresence } from 'motion/react';
import { Button } from './components/ui/Button';
import { Input } from './components/ui/Input';
import { Badge } from './components/ui/Badge';
import { storage } from './lib/storage';
import { PromptTemplate, LogEntry, RunHistory, AppSettings, PromptStatus } from './types';

export default function App() {
  // --- State ---
  const [prompts, setPrompts] = useState<PromptTemplate[]>([]);
  const [activePromptId, setActivePromptId] = useState<string | null>(null);
  const [targetUrl, setTargetUrl] = useState('');
  const [logs, setLogs] = useState<LogEntry[]>([]);
  const [history, setHistory] = useState<RunHistory[]>([]);
  const [settings, setSettings] = useState<AppSettings>(storage.getSettings());
  const [searchQuery, setSearchQuery] = useState('');
  const [isSidebarOpen, setIsSidebarOpen] = useState(true);
  const [isLogOpen, setIsLogOpen] = useState(true);
  const [isRunning, setIsRunning] = useState(false);
  const [showHistory, setShowHistory] = useState(false);
  const [showSettings, setShowSettings] = useState(false);
  const [recentUrls, setRecentUrls] = useState<string[]>([]);
  const [toast, setToast] = useState<{ message: string; type: 'success' | 'info' | 'error' } | null>(null);
  const [confirmModal, setConfirmModal] = useState<{ title: string; message: string; onConfirm: () => void } | null>(null);

  // --- Derived State ---
  const activePrompt = useMemo(() => 
    prompts.find(p => p.id === activePromptId) || null
  , [prompts, activePromptId]);

  const filteredPrompts = useMemo(() => {
    return prompts.filter(p => 
      p.name.toLowerCase().includes(searchQuery.toLowerCase()) ||
      p.content.toLowerCase().includes(searchQuery.toLowerCase()) ||
      p.tags.some(t => t.toLowerCase().includes(searchQuery.toLowerCase()))
    ).sort((a, b) => {
      if (a.isPinned && !b.isPinned) return -1;
      if (!a.isPinned && b.isPinned) return 1;
      return b.updatedAt - a.updatedAt;
    });
  }, [prompts, searchQuery]);

  const substitutedPrompt = useMemo(() => {
    if (!activePrompt) return '';
    let url = targetUrl.trim();
    if (url && !url.startsWith('http')) {
      url = 'https://' + url;
    }
    
    const marker = '<prompt>';
    if (activePrompt.content.includes(marker)) {
      return activePrompt.content.replace(new RegExp(marker, 'g'), url || '[URL]');
    } else if (settings.missingMarkerBehavior === 'append' && url) {
      return `${activePrompt.content}\n\nTarget URL: ${url}`;
    }
    return activePrompt.content;
  }, [activePrompt, targetUrl, settings.missingMarkerBehavior]);

  const showToast = (message: string, type: 'success' | 'info' | 'error' = 'info') => {
    setToast({ message, type });
    setTimeout(() => setToast(null), 3000);
  };

  // --- Effects ---
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if ((e.metaKey || e.ctrlKey) && e.key === 'Enter') {
        e.preventDefault();
        runPrompt();
      }
      if ((e.metaKey || e.ctrlKey) && e.key === 's') {
        e.preventDefault();
        showToast('All changes saved automatically', 'success');
      }
      if ((e.metaKey || e.ctrlKey) && e.key === 'n') {
        e.preventDefault();
        createNewPrompt();
      }
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [activePrompt, targetUrl, isRunning]);

  useEffect(() => {
    const loadedPrompts = storage.getPrompts();
    setPrompts(loadedPrompts);
    if (loadedPrompts.length > 0) {
      setActivePromptId(loadedPrompts[0].id);
    }
    setHistory(storage.getHistory());
  }, []);

  useEffect(() => {
    storage.savePrompts(prompts);
  }, [prompts]);

  useEffect(() => {
    storage.saveHistory(history);
  }, [history]);

  useEffect(() => {
    storage.saveSettings(settings);
    // Apply theme
    if (settings.theme === 'dark' || (settings.theme === 'system' && window.matchMedia('(prefers-color-scheme: dark)').matches)) {
      document.documentElement.classList.add('dark');
    } else {
      document.documentElement.classList.remove('dark');
    }
  }, [settings]);

  // --- Handlers ---
  const createNewPrompt = () => {
    const newPrompt: PromptTemplate = {
      id: crypto.randomUUID(),
      name: 'New Prompt',
      content: 'Enter your prompt here. Use <prompt> for URL substitution.',
      description: '',
      tags: [],
      color: '#3b82f6',
      status: 'draft',
      createdAt: Date.now(),
      updatedAt: Date.now(),
    };
    setPrompts([newPrompt, ...prompts]);
    setActivePromptId(newPrompt.id);
  };

  const updateActivePrompt = (updates: Partial<PromptTemplate>) => {
    if (!activePromptId) return;
    setPrompts(prompts.map(p => 
      p.id === activePromptId 
        ? { ...p, ...updates, updatedAt: Date.now() } 
        : p
    ));
  };

  const deletePrompt = (id: string) => {
    setConfirmModal({
      title: 'Delete Prompt',
      message: 'Are you sure you want to delete this prompt? This action cannot be undone.',
      onConfirm: () => {
        const newPrompts = prompts.filter(p => p.id !== id);
        setPrompts(newPrompts);
        if (activePromptId === id) {
          setActivePromptId(newPrompts[0]?.id || null);
        }
        showToast('Prompt deleted', 'info');
        setConfirmModal(null);
      }
    });
  };

  const addLog = (message: string, type: LogEntry['type'] = 'info', step?: string) => {
    const newLog: LogEntry = {
      id: crypto.randomUUID(),
      timestamp: Date.now(),
      message,
      type,
      step
    };
    setLogs(prev => settings.logOrder === 'newest-first' ? [newLog, ...prev] : [...prev, newLog]);
  };

  const runPrompt = async () => {
    if (!activePrompt) return;
    if (!targetUrl) {
      addLog('Error: Target URL is missing', 'error');
      showToast('Please enter a target URL', 'error');
      return;
    }

    const marker = '<prompt>';
    if (!activePrompt.content.includes(marker) && settings.missingMarkerBehavior === 'warn') {
      showToast('Marker <prompt> not found in template', 'error');
      addLog('Warning: Marker <prompt> not found', 'warning');
      return;
    }

    setIsRunning(true);
    setLogs([]);
    const startTime = Date.now();

    const steps = [
      { name: 'Initialization', message: 'Starting Prompt Runner session...' },
      { name: 'Validation', message: 'Validating URL and prompt structure...' },
      { name: 'Substitution', message: 'Replacing <prompt> markers with target URL...' },
      { name: 'Finalization', message: 'Generating final prompt output...' },
      { name: 'Execution', message: 'Simulating execution...' },
    ];

    for (const step of steps) {
      addLog(step.message, 'info', step.name);
      await new Promise(r => setTimeout(r, 600 + Math.random() * 400));
    }

    addLog('Prompt execution completed successfully!', 'success', 'Complete');
    setIsRunning(false);

    // Save recent URL
    if (targetUrl && !recentUrls.includes(targetUrl)) {
      setRecentUrls(prev => [targetUrl, ...prev].slice(0, 5));
    }

    const newHistory: RunHistory = {
      id: crypto.randomUUID(),
      templateId: activePrompt.id,
      templateName: activePrompt.name,
      targetUrl,
      finalPrompt: substitutedPrompt,
      status: 'success',
      startTime,
      endTime: Date.now(),
      duration: Date.now() - startTime,
      logs: [] // In a real app we might store logs here
    };
    setHistory([newHistory, ...history]);
  };

  const copyToClipboard = (text: string) => {
    navigator.clipboard.writeText(text);
    addLog('Copied to clipboard', 'info');
    showToast('Copied to clipboard', 'success');
  };

  const togglePin = (id: string) => {
    setPrompts(prompts.map(p => 
      p.id === id ? { ...p, isPinned: !p.isPinned } : p
    ));
  };

  const duplicatePrompt = (id: string) => {
    const promptToDuplicate = prompts.find(p => p.id === id);
    if (!promptToDuplicate) return;
    
    const duplicated: PromptTemplate = {
      ...promptToDuplicate,
      id: crypto.randomUUID(),
      name: `${promptToDuplicate.name} (Copy)`,
      createdAt: Date.now(),
      updatedAt: Date.now(),
      isPinned: false
    };
    
    setPrompts([duplicated, ...prompts]);
    setActivePromptId(duplicated.id);
    addLog(`Duplicated prompt: ${promptToDuplicate.name}`, 'info');
    showToast('Prompt duplicated', 'success');
  };

  const exportData = () => {
    const data = JSON.stringify({ prompts, history, settings }, null, 2);
    const blob = new Blob([data], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `prompt-runner-export-${new Date().toISOString().split('T')[0]}.json`;
    a.click();
    showToast('Data exported successfully', 'success');
  };

  const importData = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = (event) => {
      try {
        const data = JSON.parse(event.target?.result as string);
        if (data.prompts) setPrompts(data.prompts);
        if (data.history) setHistory(data.history);
        if (data.settings) setSettings(data.settings);
        showToast('Data imported successfully', 'success');
      } catch (err) {
        showToast('Invalid export file', 'error');
      }
    };
    reader.readAsText(file);
  };

  // --- Render Helpers ---
  const renderSidebar = () => (
    <div className={`flex flex-col border-r border-border bg-sidebar transition-all duration-300 ${isSidebarOpen ? 'w-60' : 'w-0 overflow-hidden'}`}>
      <div className="p-5 border-b border-border flex items-center justify-between">
        <h2 className="font-semibold text-[15px] tracking-tight flex items-center gap-2.5">
          <div className="w-6 h-6 bg-accent rounded-md" />
          Prompt Runner
        </h2>
        <div className="flex items-center gap-1">
          <Button variant="ghost" size="icon" onClick={() => { 
            setConfirmModal({
              title: 'Clear All Prompts',
              message: 'Are you sure you want to delete ALL prompts? This cannot be undone.',
              onConfirm: () => {
                setPrompts([]);
                setActivePromptId(null);
                showToast('All prompts cleared', 'info');
                setConfirmModal(null);
              }
            });
          }} title="Clear all" className="text-text-muted hover:text-text-primary">
            <Trash2 className="w-4 h-4" />
          </Button>
          <Button variant="ghost" size="icon" onClick={createNewPrompt} className="text-text-muted hover:text-text-primary">
            <Plus className="w-5 h-5" />
          </Button>
        </div>
      </div>
      
      <div className="px-3 py-3">
        <div className="relative">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-text-muted" />
          <input 
            type="text" 
            placeholder="Search templates..." 
            className="w-full pl-9 pr-4 py-2 text-sm bg-surface border border-border rounded-md focus:outline-none focus:border-accent text-text-primary placeholder:text-text-muted"
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
          />
        </div>
      </div>

      <div className="flex-1 overflow-y-auto p-2 space-y-0.5">
        <div className="px-3 py-2 text-[11px] uppercase tracking-widest text-text-muted font-medium">Templates</div>
        {filteredPrompts.map(p => (
          <div 
            key={p.id}
            onClick={() => setActivePromptId(p.id)}
            className={`group relative flex flex-col p-3 rounded-md cursor-pointer transition-all ${
              activePromptId === p.id 
                ? 'bg-white/5 text-text-primary' 
                : 'text-text-secondary hover:bg-white/[0.03]'
            }`}
          >
            <div className="flex items-center justify-between">
              <span className="text-sm font-medium truncate pr-8">{p.name}</span>
              <div className="flex items-center gap-1">
                <button 
                  onClick={(e) => { e.stopPropagation(); togglePin(p.id); }}
                  className={`transition-colors ${p.isPinned ? 'text-accent' : 'opacity-0 group-hover:opacity-100 text-text-muted hover:text-accent'}`}
                >
                  <Pin className="w-3.5 h-3.5" />
                </button>
                <button 
                  onClick={(e) => { e.stopPropagation(); duplicatePrompt(p.id); }}
                  className="opacity-0 group-hover:opacity-100 text-text-muted hover:text-accent transition-opacity"
                  title="Duplicate"
                >
                  <Copy className="w-3.5 h-3.5" />
                </button>
              </div>
            </div>
            <div className="flex items-center gap-2 mt-1.5">
              {p.tags.map(tag => (
                <Badge key={tag} variant="secondary" className="text-[10px] px-1.5 py-0 bg-border text-text-secondary border-none">
                  {tag}
                </Badge>
              ))}
            </div>
          </div>
        ))}
      </div>

      <div className="p-3 border-t border-border flex justify-between items-center text-[11px] text-text-muted px-4">
        <span>v1.0.4 stable</span>
        <span>Cloud Sync: ON</span>
      </div>
    </div>
  );

  const renderLogPanel = () => (
    <div className={`flex flex-col border-l border-border bg-bg transition-all duration-300 ${isLogOpen ? 'w-[280px]' : 'w-0 overflow-hidden'}`}>
      <div className="p-5 border-b border-border flex items-center justify-between">
        <h2 className="font-medium text-[12px] uppercase tracking-widest text-text-secondary">Execution Log</h2>
        <div className="flex items-center gap-1">
          <Button variant="ghost" size="icon" onClick={() => {
            setConfirmModal({
              title: 'Clear Logs',
              message: 'Are you sure you want to clear the current logs?',
              onConfirm: () => {
                setLogs([]);
                showToast('Logs cleared', 'info');
                setConfirmModal(null);
              }
            });
          }} title="Clear logs" className="text-text-muted hover:text-text-primary">
            <Trash2 className="w-4 h-4" />
          </Button>
          <Button variant="ghost" size="icon" onClick={() => copyToClipboard(logs.map(l => `[${new Date(l.timestamp).toLocaleTimeString()}] ${l.step ? `[${l.step}] ` : ''}${l.message}`).join('\n'))} title="Copy logs" className="text-text-muted hover:text-text-primary">
            <Copy className="w-4 h-4" />
          </Button>
        </div>
      </div>
      
      <div className="flex-1 overflow-y-auto p-5 space-y-4 font-mono text-[12px]">
        {logs.length === 0 && (
          <div className="h-full flex flex-col items-center justify-center text-text-muted space-y-2 opacity-50">
            <Clock className="w-8 h-8" />
            <p>No logs yet</p>
          </div>
        )}
        {logs.map(log => (
          <motion.div 
            initial={{ opacity: 0, x: 10 }}
            animate={{ opacity: 1, x: 0 }}
            key={log.id} 
            className="flex gap-3"
          >
            <div className="w-0.5 bg-border relative ml-1.5 mt-1">
              <div className={`absolute -left-[3px] top-0 w-2 h-2 rounded-full ${
                log.type === 'success' ? 'bg-emerald-500 shadow-[0_0_8px_rgba(16,185,129,0.5)]' : 
                log.type === 'error' ? 'bg-red-500 shadow-[0_0_8px_rgba(239,68,68,0.5)]' : 
                'bg-accent shadow-[0_0_8px_rgba(59,130,246,0.5)]'
              }`} />
            </div>
            <div className="flex-1">
              <div className="text-[10px] text-text-muted mb-0.5">{new Date(log.timestamp).toLocaleTimeString()}</div>
              <div className={`${
                log.type === 'success' ? 'text-emerald-400' : 
                log.type === 'error' ? 'text-red-400' : 
                'text-text-secondary'
              }`}>
                {log.message}
              </div>
            </div>
          </motion.div>
        ))}
      </div>
    </div>
  );

  return (
    <div className="flex h-screen bg-white dark:bg-zinc-950 text-zinc-900 dark:text-zinc-100 overflow-hidden font-sans">
      {/* --- Sidebar --- */}
      {renderSidebar()}

      {/* --- Main Content --- */}
      <div className="flex-1 flex flex-col min-w-0 relative">
        {/* Header */}
        <header className="h-14 border-b border-border px-6 flex items-center justify-between bg-bg">
          <div className="flex items-center gap-4">
            <Button variant="ghost" size="icon" onClick={() => setIsSidebarOpen(!isSidebarOpen)} className="text-text-muted hover:text-text-primary">
              {isSidebarOpen ? <ChevronLeft className="w-5 h-5" /> : <ChevronRight className="w-5 h-5" />}
            </Button>
            <div className="text-sm text-text-secondary font-medium flex items-center gap-2">
              Templates <span className="text-text-muted">/</span> 
              <input 
                className="bg-transparent border-none focus:outline-none text-text-primary font-bold min-w-[100px]"
                value={activePrompt?.name || ''}
                onChange={(e) => updateActivePrompt({ name: e.target.value })}
                placeholder="Untitled Prompt"
              />
            </div>
          </div>
          
          <div className="flex items-center gap-2">
            <Button variant="ghost" size="icon" onClick={() => setShowHistory(true)} className="text-text-muted hover:text-text-primary">
              <HistoryIcon className="w-5 h-5" />
            </Button>
            <Button variant="ghost" size="icon" onClick={() => setShowSettings(true)} className="text-text-muted hover:text-text-primary">
              <SettingsIcon className="w-5 h-5" />
            </Button>
            <div className="h-6 w-px bg-border mx-2" />
            <div className="flex items-center gap-2">
              <Button 
                onClick={runPrompt} 
                isLoading={isRunning}
                className="bg-accent hover:bg-accent/90 text-white gap-2 px-5"
              >
                <Play className="w-4 h-4 fill-current" />
                Execute Prompt
              </Button>
              <Button 
                variant="outline" 
                onClick={() => showToast('Changes saved successfully', 'success')}
                className="gap-2 border-border bg-surface hover:bg-white/5 text-text-primary"
              >
                <Save className="w-4 h-4" />
                Save
              </Button>
            </div>
          </div>
        </header>

        {/* Editor Area */}
        <main className="flex-1 overflow-y-auto p-8 space-y-6 max-w-5xl mx-auto w-full">
          {!activePrompt ? (
            <div className="h-full flex flex-col items-center justify-center text-text-muted space-y-4">
              <div className="w-16 h-16 rounded-2xl bg-surface flex items-center justify-center border border-border">
                <FileText className="w-8 h-8" />
              </div>
              <div className="text-center">
                <h3 className="text-lg font-medium text-text-primary">No prompt selected</h3>
                <p className="text-sm">Select a prompt from the sidebar or create a new one.</p>
              </div>
              <Button onClick={createNewPrompt} className="bg-accent text-white">Create New Prompt</Button>
            </div>
          ) : (
            <>
              {/* Target URL Input */}
              <div className="space-y-2">
                <div className="flex justify-between items-center">
                  <label className="text-[12px] font-medium uppercase tracking-widest text-text-secondary">Target URL</label>
                  <label className="text-[12px] text-accent cursor-pointer hover:underline">Recent History</label>
                </div>
                <div className="relative group">
                  <input 
                    type="text" 
                    placeholder="https://example.com"
                    className="w-full h-12 px-4 bg-surface border border-border rounded-lg focus:outline-none focus:border-accent text-text-primary font-mono text-sm transition-colors"
                    value={targetUrl}
                    onChange={(e) => setTargetUrl(e.target.value)}
                  />
                  <button 
                    onClick={() => targetUrl && window.open(targetUrl.startsWith('http') ? targetUrl : `https://${targetUrl}`, '_blank')}
                    className="absolute right-3 top-1/2 -translate-y-1/2 p-1.5 text-text-muted hover:text-accent transition-colors"
                  >
                    <ExternalLink className="w-4 h-4" />
                  </button>
                </div>
                {recentUrls.length > 0 && (
                  <div className="flex flex-wrap gap-2 pt-1">
                    <span className="text-[10px] text-text-muted uppercase tracking-widest self-center mr-2">Recent:</span>
                    {recentUrls.map(url => (
                      <button 
                        key={url} 
                        onClick={() => setTargetUrl(url)}
                        className="text-[10px] px-2 py-1 rounded bg-surface border border-border text-text-secondary hover:text-text-primary hover:border-text-muted transition-colors truncate max-w-[150px]"
                      >
                        {url}
                      </button>
                    ))}
                  </div>
                )}
              </div>

              {/* Prompt Editor */}
              <div className="space-y-2">
                <div className="flex justify-between items-center">
                  <label className="text-[12px] font-medium uppercase tracking-widest text-text-secondary">Prompt Template</label>
                  <div className="text-[11px] text-text-muted">
                    {activePrompt.content.split(/\s+/).filter(Boolean).length} words · {activePrompt.content.length} chars
                  </div>
                </div>
                <div className="relative">
                  <textarea 
                    className="w-full h-80 p-5 bg-surface border border-border rounded-lg focus:outline-none focus:border-accent text-text-primary text-sm leading-relaxed resize-none font-sans"
                    placeholder="Write your prompt here. Use <prompt> where you want the URL to be inserted."
                    value={activePrompt.content}
                    onChange={(e) => updateActivePrompt({ content: e.target.value })}
                  />
                </div>
              </div>

              {/* Preview Area */}
              <div className="space-y-2">
                <label className="text-[12px] font-medium uppercase tracking-widest text-text-secondary">Final Prompt Preview</label>
                <div className="p-5 bg-white/[0.02] border border-dashed border-border rounded-lg">
                  <div className="text-[13px] text-text-secondary leading-relaxed whitespace-pre-wrap italic">
                    {substitutedPrompt.split(targetUrl || '[URL]').map((part, i, arr) => (
                      <React.Fragment key={i}>
                        {part}
                        {i < arr.length - 1 && (
                          <span className="text-accent font-bold not-italic underline decoration-2 underline-offset-4">
                            {targetUrl || '[URL]'}
                          </span>
                        )}
                      </React.Fragment>
                    ))}
                  </div>
                  <div className="mt-4 flex justify-end">
                    <Button variant="outline" size="sm" onClick={() => copyToClipboard(substitutedPrompt)} className="gap-2 border-border bg-surface hover:bg-white/5 text-text-primary">
                      <Copy className="w-3.5 h-3.5" />
                      Copy Results
                    </Button>
                  </div>
                </div>
              </div>

              {/* Metadata / Tags */}
              <div className="grid grid-cols-1 md:grid-cols-2 gap-8 items-start pt-4">
                <div className="space-y-5">
                  <div className="space-y-2">
                    <label className="text-[12px] font-medium uppercase tracking-widest text-text-secondary">Description</label>
                    <input 
                      type="text" 
                      placeholder="What is this prompt for?"
                      className="w-full h-10 px-0 bg-transparent border-b border-border focus:outline-none focus:border-accent text-sm text-text-primary placeholder:text-text-muted"
                      value={activePrompt.description}
                      onChange={(e) => updateActivePrompt({ description: e.target.value })}
                    />
                  </div>
                  <div className="space-y-2">
                    <label className="text-[12px] font-medium uppercase tracking-widest text-text-secondary">Tags (comma separated)</label>
                    <input 
                      type="text" 
                      placeholder="seo, audit, content..."
                      className="w-full h-10 px-0 bg-transparent border-b border-border focus:outline-none focus:border-accent text-sm text-text-primary placeholder:text-text-muted"
                      value={activePrompt.tags.join(', ')}
                      onChange={(e) => updateActivePrompt({ tags: e.target.value.split(',').map(t => t.trim()).filter(t => t) })}
                    />
                  </div>
                </div>
                <div className="space-y-5">
                  <div className="space-y-2">
                    <label className="text-[12px] font-medium uppercase tracking-widest text-text-secondary">Color Label</label>
                    <div className="flex gap-2.5">
                      {['#3b82f6', '#10b981', '#f59e0b', '#ef4444', '#8b5cf6', '#ec4899'].map(c => (
                        <button
                          key={c}
                          onClick={() => updateActivePrompt({ color: c })}
                          className={`w-6 h-6 rounded-full border-2 transition-all ${activePrompt.color === c ? 'border-text-primary scale-110' : 'border-transparent hover:scale-105'}`}
                          style={{ backgroundColor: c }}
                        />
                      ))}
                    </div>
                  </div>
                  <div className="flex justify-end pt-4">
                    <Button variant="outline" size="sm" onClick={() => deletePrompt(activePrompt.id)} className="text-red-500 hover:text-red-400 hover:bg-red-500/10 border-red-500/20">
                      <Trash2 className="w-4 h-4 mr-2" />
                      Delete Prompt
                    </Button>
                  </div>
                </div>
              </div>
            </>
          )}
        </main>

        {/* Footer / Status Bar */}
        <footer className="h-8 border-t border-border px-6 flex items-center justify-between text-[10px] uppercase tracking-widest text-text-muted bg-sidebar">
          <div className="flex items-center gap-4">
            <span className="flex items-center gap-1.5">
              <div className={`w-1.5 h-1.5 rounded-full ${isRunning ? 'bg-amber-500 animate-pulse shadow-[0_0_8px_#f59e0b]' : 'bg-emerald-500 shadow-[0_0_8px_#10b981]'}`} />
              {isRunning ? 'Executing...' : 'Ready'}
            </span>
            <span>{prompts.length} Templates</span>
          </div>
          <div className="flex items-center gap-4">
            <button onClick={() => setIsLogOpen(!isLogOpen)} className="hover:text-text-primary transition-colors">
              {isLogOpen ? 'Hide Logs' : 'Show Logs'}
            </button>
          </div>
        </footer>
      </div>

      {/* --- Log Panel --- */}
      {renderLogPanel()}

      {/* --- Modals / Overlays --- */}
      <AnimatePresence>
        {showHistory && (
          <motion.div 
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="fixed inset-0 z-50 flex items-center justify-center p-6 bg-black/60 backdrop-blur-sm"
          >
            <motion.div 
              initial={{ scale: 0.95, opacity: 0 }}
              animate={{ scale: 1, opacity: 1 }}
              exit={{ scale: 0.95, opacity: 0 }}
              className="bg-surface w-full max-w-2xl rounded-xl border border-border shadow-2xl overflow-hidden flex flex-col max-h-[80vh]"
            >
              <div className="p-6 border-b border-border flex items-center justify-between">
                <h2 className="text-lg font-bold text-text-primary">Run History</h2>
                <div className="flex items-center gap-2">
                  <Button variant="ghost" size="icon" onClick={() => {
                    setConfirmModal({
                      title: 'Clear History',
                      message: 'Are you sure you want to clear your entire run history?',
                      onConfirm: () => {
                        setHistory([]);
                        showToast('History cleared', 'info');
                        setConfirmModal(null);
                      }
                    });
                  }} title="Clear history" className="text-text-muted hover:text-red-400">
                    <Trash2 className="w-4 h-4" />
                  </Button>
                  <Button variant="ghost" size="icon" onClick={() => setShowHistory(false)} className="text-text-muted hover:text-text-primary">
                    <X className="w-5 h-5" />
                  </Button>
                </div>
              </div>
              <div className="flex-1 overflow-y-auto p-6 space-y-4">
                {history.length === 0 ? (
                  <div className="text-center py-12 text-text-muted">
                    <Clock className="w-12 h-12 mx-auto mb-4 opacity-20" />
                    <p>No history yet. Run a prompt to see it here.</p>
                  </div>
                ) : (
                  history.map(item => (
                    <div key={item.id} className="p-4 border border-border rounded-lg hover:bg-white/5 transition-colors">
                      <div className="flex items-center justify-between mb-2">
                        <h4 className="font-bold text-sm text-text-primary">{item.templateName}</h4>
                        <Badge variant="success" className="bg-emerald-500/10 text-emerald-400 border-emerald-500/20">{item.status}</Badge>
                      </div>
                      <p className="text-xs text-text-muted mb-2 truncate">{item.targetUrl}</p>
                      <div className="flex items-center justify-between text-[10px] text-text-muted uppercase tracking-widest">
                        <span>{new Date(item.startTime).toLocaleString()}</span>
                        <span>{item.duration}ms</span>
                      </div>
                    </div>
                  ))
                )}
              </div>
            </motion.div>
          </motion.div>
        )}
        {showSettings && (
          <motion.div 
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="fixed inset-0 z-50 flex items-center justify-center p-6 bg-black/60 backdrop-blur-sm"
          >
            <motion.div 
              initial={{ scale: 0.95, opacity: 0 }}
              animate={{ scale: 1, opacity: 1 }}
              exit={{ scale: 0.95, opacity: 0 }}
              className="bg-surface w-full max-w-md rounded-xl border border-border shadow-2xl overflow-hidden flex flex-col"
            >
              <div className="p-6 border-b border-border flex items-center justify-between">
                <h2 className="text-lg font-bold text-text-primary">Settings</h2>
                <Button variant="ghost" size="icon" onClick={() => setShowSettings(false)} className="text-text-muted hover:text-text-primary">
                  <X className="w-5 h-5" />
                </Button>
              </div>
              <div className="p-6 space-y-6">
                <div className="space-y-3">
                  <label className="text-[11px] font-bold uppercase tracking-widest text-text-muted">Theme Preference</label>
                  <div className="grid grid-cols-3 gap-2">
                    {(['light', 'dark', 'system'] as const).map(t => (
                      <Button 
                        key={t}
                        variant={settings.theme === t ? 'primary' : 'outline'}
                        size="sm"
                        onClick={() => setSettings({ ...settings, theme: t })}
                        className={`capitalize border-border ${settings.theme === t ? 'bg-accent text-white' : 'bg-transparent text-text-secondary hover:bg-white/5'}`}
                      >
                        {t === 'light' && <Sun className="w-3.5 h-3.5 mr-2" />}
                        {t === 'dark' && <Moon className="w-3.5 h-3.5 mr-2" />}
                        {t === 'system' && <Monitor className="w-3.5 h-3.5 mr-2" />}
                        {t}
                      </Button>
                    ))}
                  </div>
                </div>

                <div className="space-y-3">
                  <label className="text-[11px] font-bold uppercase tracking-widest text-text-muted">Missing Marker Behavior</label>
                  <div className="grid grid-cols-2 gap-2">
                    <Button 
                      variant={settings.missingMarkerBehavior === 'warn' ? 'primary' : 'outline'}
                      size="sm"
                      onClick={() => setSettings({ ...settings, missingMarkerBehavior: 'warn' })}
                      className={`border-border ${settings.missingMarkerBehavior === 'warn' ? 'bg-accent text-white' : 'bg-transparent text-text-secondary hover:bg-white/5'}`}
                    >
                      Warn
                    </Button>
                    <Button 
                      variant={settings.missingMarkerBehavior === 'append' ? 'primary' : 'outline'}
                      size="sm"
                      onClick={() => setSettings({ ...settings, missingMarkerBehavior: 'append' })}
                      className={`border-border ${settings.missingMarkerBehavior === 'append' ? 'bg-accent text-white' : 'bg-transparent text-text-secondary hover:bg-white/5'}`}
                    >
                      Append URL
                    </Button>
                  </div>
                </div>

                <div className="space-y-3">
                  <label className="text-[11px] font-bold uppercase tracking-widest text-text-muted">Data Management</label>
                  <div className="grid grid-cols-2 gap-2">
                    <Button variant="outline" size="sm" onClick={exportData} className="border-border bg-transparent text-text-secondary hover:bg-white/5">
                      Export JSON
                    </Button>
                    <div className="relative">
                      <input 
                        type="file" 
                        accept=".json" 
                        onChange={importData} 
                        className="absolute inset-0 opacity-0 cursor-pointer" 
                      />
                      <Button variant="outline" size="sm" className="w-full border-border bg-transparent text-text-secondary hover:bg-white/5">
                        Import JSON
                      </Button>
                    </div>
                  </div>
                </div>

                <div className="space-y-3 pt-4 border-t border-border">
                  <label className="text-[11px] font-bold uppercase tracking-widest text-red-500/80">Danger Zone</label>
                  <Button 
                    variant="outline" 
                    size="sm" 
                    className="w-full border-red-500/20 bg-red-500/5 text-red-400 hover:bg-red-500/10"
                    onClick={() => {
                      setConfirmModal({
                        title: 'Reset All Data',
                        message: 'This will delete ALL prompts, history, and reset settings to default. This cannot be undone.',
                        onConfirm: () => {
                          setPrompts([]);
                          setHistory([]);
                          setSettings({
                            theme: 'system',
                            missingMarkerBehavior: 'warn',
                            logOrder: 'newest-first'
                          });
                          localStorage.clear();
                          showToast('All data reset', 'info');
                          setConfirmModal(null);
                          setShowSettings(false);
                        }
                      });
                    }}
                  >
                    Reset All Data
                  </Button>
                </div>
              </div>
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>

      {/* --- Toast --- */}
      <AnimatePresence>
        {toast && (
          <motion.div 
            initial={{ opacity: 0, y: 20, scale: 0.9 }}
            animate={{ opacity: 1, y: 0, scale: 1 }}
            exit={{ opacity: 0, y: 20, scale: 0.9 }}
            className="fixed bottom-12 left-1/2 -translate-x-1/2 z-[100]"
          >
            <div className={`px-5 py-2.5 rounded-full shadow-2xl text-sm font-medium flex items-center gap-3 border ${
              toast.type === 'success' ? 'bg-emerald-500/10 text-emerald-400 border-emerald-500/20' : 
              toast.type === 'error' ? 'bg-red-500/10 text-red-400 border-red-500/20' : 
              'bg-surface text-text-primary border-border'
            }`}>
              {toast.type === 'success' && <CheckCircle2 className="w-4 h-4" />}
              {toast.type === 'error' && <AlertCircle className="w-4 h-4" />}
              {toast.message}
            </div>
          </motion.div>
        )}
      </AnimatePresence>

      {/* --- Confirmation Modal --- */}
      <AnimatePresence>
        {confirmModal && (
          <motion.div 
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="fixed inset-0 z-[110] flex items-center justify-center p-6 bg-black/60 backdrop-blur-sm"
          >
            <motion.div 
              initial={{ scale: 0.95, opacity: 0 }}
              animate={{ scale: 1, opacity: 1 }}
              exit={{ scale: 0.95, opacity: 0 }}
              className="bg-surface w-full max-w-sm rounded-xl border border-border shadow-2xl overflow-hidden p-6 space-y-4"
            >
              <h3 className="text-lg font-bold text-text-primary">{confirmModal.title}</h3>
              <p className="text-sm text-text-muted leading-relaxed">{confirmModal.message}</p>
              <div className="flex gap-3 justify-end pt-2">
                <Button variant="ghost" onClick={() => setConfirmModal(null)} className="text-text-muted hover:text-text-primary">Cancel</Button>
                <Button onClick={confirmModal.onConfirm} className="bg-accent hover:bg-accent/90 text-white px-6">Confirm</Button>
              </div>
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}
