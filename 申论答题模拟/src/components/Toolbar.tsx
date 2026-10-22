import { useRef, useState } from 'react';
import type { ChangeEvent } from 'react';
import {
  Copy,
  Download,
  Printer,
  Redo2,
  SlidersHorizontal,
  Trash,
  Undo2,
  Upload,
  ZoomIn,
  ZoomOut,
} from 'lucide-react';
import type { LucideIcon } from 'lucide-react';
import type { StyleConfig } from '../core/types';
import { SettingsPanel } from './SettingsPanel';

interface Props {
  config: StyleConfig;
  zoom: number;
  onConfig: (updater: (c: StyleConfig) => StyleConfig) => void;
  onZoom: (zoom: number) => void;
  onCopy: () => void;
  onExport: () => void;
  onPrint: () => void;
  onImport: (file: File) => void;
  onClear: () => void;
  onUndo: () => void;
  onRedo: () => void;
  hasText: boolean;
  canUndo: boolean;
  canRedo: boolean;
}

const BTN_BASE =
  'inline-flex size-7 items-center justify-center rounded-md border border-stone-300 bg-white transition';
const BTN = `${BTN_BASE} text-stone-600 hover:border-rose-300 hover:bg-rose-50 hover:text-rose-700 active:translate-y-px disabled:opacity-40 disabled:hover:border-stone-300 disabled:hover:bg-white disabled:hover:text-stone-600`;
const BTN_DANGER = `${BTN_BASE} text-rose-600 hover:border-rose-300 hover:bg-rose-50 active:translate-y-px`;

/** 本项目的 GitHub 仓库地址 */
const REPO_URL = 'https://github.com/LeonardoTan19/GuoKaoShenLun';

/** GitHub mark 图标（Octicons，随字色着色） */
function GitHubMark() {
  return (
    <svg viewBox="0 0 16 16" className="size-4" fill="currentColor" aria-hidden="true">
      <path d="M8 0C3.58 0 0 3.58 0 8c0 3.54 2.29 6.53 5.47 7.59.4.07.55-.17.55-.38 0-.19-.01-.82-.01-1.49-2.01.37-2.53-.49-2.69-.94-.09-.23-.48-.94-.82-1.13-.28-.15-.68-.52-.01-.53.63-.01 1.08.58 1.23.82.72 1.21 1.87.87 2.33.66.07-.52.28-.87.51-1.07-1.78-.2-3.64-.89-3.64-3.95 0-.87.31-1.59.82-2.15-.08-.2-.36-1.02.08-2.12 0 0 .67-.21 2.2.82.64-.18 1.32-.27 2-.27.68 0 1.36.09 2 .27 1.53-1.04 2.2-.82 2.2-.82.44 1.1.16 1.92.08 2.12.51.56.82 1.27.82 2.15 0 3.07-1.87 3.75-3.65 3.95.29.25.54.73.54 1.48 0 1.07-.01 1.93-.01 2.2 0 .21.15.46.55.38A8.012 8.012 0 0 0 16 8c0-4.42-3.58-8-8-8Z" />
    </svg>
  );
}

interface IconButtonProps {
  icon: LucideIcon;
  label: string;
  shortcut?: string;
  onClick: () => void;
  disabled?: boolean;
  danger?: boolean;
  expanded?: boolean;
}

function IconButton({
  icon: Icon,
  label,
  shortcut,
  onClick,
  disabled,
  danger,
  expanded,
}: IconButtonProps) {
  return (
    <button
      type="button"
      className={danger ? BTN_DANGER : BTN}
      onClick={onClick}
      disabled={disabled}
      title={shortcut ? `${label}（${shortcut}）` : label}
      aria-label={label}
      aria-expanded={expanded}
    >
      <Icon className="size-4" strokeWidth={1.75} aria-hidden="true" />
    </button>
  );
}

export function Toolbar({
  config,
  zoom,
  onConfig,
  onZoom,
  onCopy,
  onExport,
  onPrint,
  onImport,
  onClear,
  onUndo,
  onRedo,
  hasText,
  canUndo,
  canRedo,
}: Props) {
  const fileRef = useRef<HTMLInputElement | null>(null);
  const [settingsOpen, setSettingsOpen] = useState(false);

  const handleFile = (e: ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (file) onImport(file);
    e.target.value = '';
  };

  const stepZoom = (delta: number) =>
    onZoom(Math.min(1.8, Math.max(0.7, Math.round((zoom + delta) * 10) / 10)));

  return (
    <header className="relative z-40 shrink-0 border-b border-stone-300 bg-white">
      <div className="flex flex-wrap items-center gap-x-4 gap-y-2 px-6 py-2">
        <div className="mr-auto flex items-center gap-2">
          <h1 className="text-sm font-semibold tracking-wide text-stone-800">申论答题模拟</h1>
          <a
            href={REPO_URL}
            target="_blank"
            rel="noreferrer"
            title="GitHub 仓库"
            aria-label="GitHub 仓库"
            className={BTN}
          >
            <GitHubMark />
          </a>
        </div>

        <div className="flex flex-wrap items-center gap-1.5">
          <IconButton
            icon={Undo2}
            label="撤销"
            shortcut="Ctrl + Z"
            onClick={onUndo}
            disabled={!canUndo}
          />
          <IconButton
            icon={Redo2}
            label="重做"
            shortcut="Ctrl + Y"
            onClick={onRedo}
            disabled={!canRedo}
          />

          <span className="mx-0.5 h-4 w-px bg-stone-200" />

          <IconButton icon={Copy} label="复制全文" onClick={onCopy} disabled={!hasText} />
          <IconButton icon={Download} label="导出 .txt" onClick={onExport} disabled={!hasText} />
          <IconButton icon={Printer} label="导出 PDF" shortcut="Ctrl + P" onClick={onPrint} />
          <IconButton icon={Upload} label="导入文本" onClick={() => fileRef.current?.click()} />
          <IconButton icon={Trash} label="清空卷面" onClick={onClear} danger />
          <input
            ref={fileRef}
            type="file"
            accept=".txt,text/plain"
            className="hidden"
            onChange={handleFile}
          />

          <span className="mx-0.5 h-4 w-px bg-stone-200" />

          <IconButton
            icon={SlidersHorizontal}
            label="设置"
            onClick={() => setSettingsOpen(true)}
            expanded={settingsOpen}
          />
        </div>

        <div className="flex items-center gap-1.5">
          <IconButton icon={ZoomOut} label="缩小" onClick={() => stepZoom(-0.1)} />
          <span className="w-10 text-center text-xs text-stone-600 tabular-nums">
            {Math.round(zoom * 100)}%
          </span>
          <IconButton icon={ZoomIn} label="放大" onClick={() => stepZoom(0.1)} />
        </div>
      </div>

      <SettingsPanel
        open={settingsOpen}
        config={config}
        onConfig={onConfig}
        onClose={() => setSettingsOpen(false)}
      />
    </header>
  );
}
