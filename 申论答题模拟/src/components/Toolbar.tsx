import { useRef, useState } from 'react';
import type { ChangeEvent } from 'react';
import { resolveColsPerRow, resolveTargetWords } from '../core/presets';
import type { StyleConfig } from '../core/types';
import { SettingsPanel } from './SettingsPanel';

interface Props {
  config: StyleConfig;
  zoom: number;
  onConfig: (updater: (c: StyleConfig) => StyleConfig) => void;
  onZoom: (zoom: number) => void;
  onCopy: () => void;
  onExport: () => void;
  onImport: (file: File) => void;
  onClear: () => void;
  onUndo: () => void;
  onRedo: () => void;
  hasText: boolean;
  canUndo: boolean;
  canRedo: boolean;
}

const BTN_BASE = 'rounded-md border border-stone-300 bg-white px-2.5 py-1 text-xs transition';
const BTN = `${BTN_BASE} text-stone-700 hover:border-rose-300 hover:bg-rose-50 hover:text-rose-700 active:translate-y-px disabled:opacity-40 disabled:hover:border-stone-300 disabled:hover:bg-white disabled:hover:text-stone-700`;
const BTN_DANGER = `${BTN_BASE} text-rose-600 hover:bg-rose-50`;

/** 本项目的 GitHub 仓库地址 */
const REPO_URL = 'https://github.com/LeonardoTan19/GuoKaoShenLun';

/** GitHub mark 图标（Octicons，随字色着色） */
function GitHubMark() {
  return (
    <svg viewBox="0 0 16 16" className="size-3.5" fill="currentColor" aria-hidden="true">
      <path d="M8 0C3.58 0 0 3.58 0 8c0 3.54 2.29 6.53 5.47 7.59.4.07.55-.17.55-.38 0-.19-.01-.82-.01-1.49-2.01.37-2.53-.49-2.69-.94-.09-.23-.48-.94-.82-1.13-.28-.15-.68-.52-.01-.53.63-.01 1.08.58 1.23.82.72 1.21 1.87.87 2.33.66.07-.52.28-.87.51-1.07-1.78-.2-3.64-.89-3.64-3.95 0-.87.31-1.59.82-2.15-.08-.2-.36-1.02.08-2.12 0 0 .67-.21 2.2.82.64-.18 1.32-.27 2-.27.68 0 1.36.09 2 .27 1.53-1.04 2.2-.82 2.2-.82.44 1.1.16 1.92.08 2.12.51.56.82 1.27.82 2.15 0 3.07-1.87 3.75-3.65 3.95.29.25.54.73.54 1.48 0 1.07-.01 1.93-.01 2.2 0 .21.15.46.55.38A8.012 8.012 0 0 0 16 8c0-4.42-3.58-8-8-8Z" />
    </svg>
  );
}

/** 数字输入框：留空 / 非法值一律按 0 存，由 resolve 系列函数回退到默认值 */
const toCount = (value: string) => Math.max(0, Math.floor(Number(value) || 0));

export function Toolbar({
  config,
  zoom,
  onConfig,
  onZoom,
  onCopy,
  onExport,
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

  const cols = resolveColsPerRow(config.colsPerRow);
  const rows = Math.ceil(resolveTargetWords(config.targetWords) / cols) || 1;

  return (
    <header className="relative z-40 shrink-0 border-b border-stone-300 bg-white">
      <div className="flex flex-wrap items-center justify-between gap-3 px-6 py-2.5">
        <div className="flex items-center gap-2">
          <h1 className="text-sm font-semibold tracking-wide text-stone-800">申论答题模拟</h1>
          <a
            href={REPO_URL}
            target="_blank"
            rel="noreferrer"
            title="GitHub 仓库"
            aria-label="GitHub 仓库"
            className={`${BTN} inline-flex items-center px-1.5`}
          >
            <GitHubMark />
          </a>
        </div>

        <div className="flex flex-wrap items-center gap-1.5">
          <button type="button" className={BTN} onClick={onUndo} disabled={!canUndo} title="Ctrl + Z">
            撤销
          </button>
          <button type="button" className={BTN} onClick={onRedo} disabled={!canRedo} title="Ctrl + Y">
            重做
          </button>

          <span className="mx-0.5 h-4 w-px bg-stone-200" />

          <button type="button" className={BTN} onClick={onCopy} disabled={!hasText}>
            复制全文
          </button>
          <button type="button" className={BTN} onClick={onExport} disabled={!hasText}>
            导出 .txt
          </button>
          <button type="button" className={BTN} onClick={() => fileRef.current?.click()}>
            导入文本
          </button>
          <button type="button" className={BTN_DANGER} onClick={onClear}>
            清空卷面
          </button>
          <input
            ref={fileRef}
            type="file"
            accept=".txt,text/plain"
            className="hidden"
            onChange={handleFile}
          />
        </div>
      </div>

      <div className="flex flex-wrap items-center justify-between gap-3 border-t border-stone-200 px-6 py-2">
        <button
          type="button"
          className={BTN}
          onClick={() => setSettingsOpen(true)}
          aria-expanded={settingsOpen}
        >
          设置
        </button>

        <div className="flex flex-wrap items-center gap-x-5 gap-y-2">
          <label
            className="flex items-center gap-1.5 text-xs text-stone-600"
            title="留空按 25 格计算"
          >
            每行
            <input
              type="number"
              min={10}
              max={40}
              value={config.colsPerRow || ''}
              placeholder="25"
              onChange={(e) => onConfig((c) => ({ ...c, colsPerRow: toCount(e.target.value) }))}
              className="w-14 rounded border border-stone-300 px-1.5 py-0.5 text-xs placeholder:text-stone-300 focus:border-rose-400 focus:outline-none"
            />
            格
          </label>

          <label
            className="flex items-center gap-1.5 text-xs text-stone-600"
            title="留空按 300 字计算"
          >
            字数要求
            <input
              type="number"
              min={0}
              max={2000}
              step={50}
              value={config.targetWords || ''}
              placeholder="300"
              onChange={(e) => onConfig((c) => ({ ...c, targetWords: toCount(e.target.value) }))}
              className="w-16 rounded border border-stone-300 px-1.5 py-0.5 text-xs placeholder:text-stone-300 focus:border-rose-400 focus:outline-none"
            />
            字
            <span className="text-stone-400 tabular-nums">≈ {rows} 行</span>
          </label>

          <div className="flex items-center gap-1.5 text-xs text-stone-600">
            缩放
            <button type="button" className={BTN} onClick={() => stepZoom(-0.1)}>
              −
            </button>
            <span className="w-10 text-center tabular-nums">{Math.round(zoom * 100)}%</span>
            <button type="button" className={BTN} onClick={() => stepZoom(0.1)}>
              +
            </button>
          </div>
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
