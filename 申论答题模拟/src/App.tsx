import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { AnswerSheet } from './components/AnswerSheet';
import { StatusBar } from './components/StatusBar';
import { Toolbar } from './components/Toolbar';
import { DEFAULT_CONFIG } from './core/presets';
import type { StyleConfig } from './core/types';
import { useImmersiveBars } from './hooks/useImmersiveBars';
import { useSheetEditor } from './hooks/useSheetEditor';

const STORAGE_KEY = 'shenlun-answer-simulator/v1';

function loadSaved(): { text: string; config: StyleConfig } | null {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return null;
    const parsed = JSON.parse(raw) as { text?: unknown; config?: Partial<StyleConfig> };
    if (typeof parsed.text !== 'string') return null;
    return { text: parsed.text, config: { ...DEFAULT_CONFIG, ...(parsed.config ?? {}) } };
  } catch {
    return null;
  }
}

export default function App() {
  const saved = useMemo(loadSaved, []);
  const editor = useSheetEditor(saved?.text ?? '', saved?.config ?? DEFAULT_CONFIG);
  const [zoom, setZoom] = useState(1);
  const [toast, setToast] = useState<string | null>(null);
  const toastTimer = useRef<number | null>(null);
  const headerRef = useRef<HTMLDivElement | null>(null);
  const footerRef = useRef<HTMLDivElement | null>(null);

  const immersive = editor.config.immersive;
  const { topVisible, bottomVisible } = useImmersiveBars(immersive, headerRef, footerRef);

  /** 沉浸模式下信息栏悬浮在卷面上方，鼠标靠近屏幕边缘时浮出 */
  const barClass = (visible: boolean, edge: 'top' | 'bottom') => {
    if (!immersive) return 'shrink-0';
    const offset = edge === 'top' ? '-translate-y-full' : 'translate-y-full';
    return [
      'absolute inset-x-0 z-40 transition-transform duration-250 ease-out',
      edge === 'top' ? 'top-0' : 'bottom-0',
      visible ? 'translate-y-0 shadow-[0_6px_14px_rgba(0,0,0,0.12)]' : offset,
    ].join(' ');
  };

  const notify = useCallback((message: string) => {
    setToast(message);
    if (toastTimer.current !== null) window.clearTimeout(toastTimer.current);
    toastTimer.current = window.setTimeout(() => setToast(null), 1800);
  }, []);

  // 本地自动存稿
  useEffect(() => {
    const id = window.setTimeout(() => {
      try {
        localStorage.setItem(
          STORAGE_KEY,
          JSON.stringify({ text: editor.rawText, config: editor.config }),
        );
      } catch {
        // 隐私模式下不可写，忽略
      }
    }, 500);
    return () => window.clearTimeout(id);
  }, [editor.rawText, editor.config]);

  const handleCopy = useCallback(async () => {
    try {
      await navigator.clipboard.writeText(editor.rawText);
      notify('已复制全文');
    } catch {
      notify('复制失败，请手动框选');
    }
  }, [editor.rawText, notify]);

  const handleExport = useCallback(() => {
    const blob = new Blob([editor.rawText], { type: 'text/plain;charset=utf-8' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `申论作答_${new Date().toISOString().slice(0, 10)}.txt`;
    a.click();
    URL.revokeObjectURL(url);
    notify('已导出文本');
  }, [editor.rawText, notify]);

  const handleImport = useCallback(
    (file: File) => {
      void file
        .text()
        .then((text) => {
          editor.loadText(text.replace(/\r\n?/g, '\n').replace(/\n+$/, ''));
          notify(`已导入 ${file.name}`);
        })
        .catch(() => notify('导入失败'));
    },
    [editor, notify],
  );

  const handleClear = useCallback(() => {
    if (editor.rawText.length > 0 && !window.confirm('确定清空当前卷面吗？（可 Ctrl+Z 撤销）')) return;
    editor.loadText('');
    notify('已清空卷面');
  }, [editor, notify]);

  return (
    <div className="relative flex h-screen flex-col overflow-hidden bg-stone-100">
      <div ref={headerRef} className={barClass(topVisible, 'top')}>
        <Toolbar
          config={editor.config}
          zoom={zoom}
          onConfig={editor.setConfig}
          onZoom={setZoom}
          onCopy={handleCopy}
          onExport={handleExport}
          onImport={handleImport}
          onClear={handleClear}
          onUndo={editor.undo}
          onRedo={editor.redo}
          hasText={editor.rawText.length > 0}
          canUndo={editor.canUndo}
          canRedo={editor.canRedo}
        />
      </div>

      <main className="min-h-0 flex-1">
        <AnswerSheet editor={editor} zoom={zoom} />
      </main>

      <div ref={footerRef} className={barClass(bottomVisible, 'bottom')}>
        <StatusBar editor={editor} />
      </div>

      {toast && (
        <div className="fixed bottom-6 left-1/2 z-50 -translate-x-1/2 rounded-full bg-stone-800/90 px-4 py-1.5 text-xs text-white shadow-lg">
          {toast}
        </div>
      )}
    </div>
  );
}
