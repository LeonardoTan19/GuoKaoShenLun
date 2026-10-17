import { useEffect } from 'react';
import { createPortal } from 'react-dom';
import { FONT_OPTIONS } from '../core/presets';
import type { FontKey, StyleConfig } from '../core/types';

type FlagKey = Exclude<keyof StyleConfig, 'colsPerRow' | 'targetWords' | 'font' | 'immersive'>;

/** 排版规则开关（与 StyleConfig 的布尔字段一一对应） */
const FLAGS: { key: FlagKey; label: string; title?: string }[] = [
  { key: 'indentTwoCells', label: '首行缩进' },
  { key: 'mergeSerialNumber', label: '编号合并', title: '1、2. （3） 等序号整体占一格' },
  { key: 'mergePunctPair', label: '标点合并', title: '：“ 。” ！” ？” 等相邻双标点合占一格' },
  { key: 'mergeDoubleDigits', label: '数字合并', title: '如 2026 占两格（20 / 26）' },
  { key: 'avoidLineStartPunct', label: '标点避头', title: '行首禁排标点挤压到上一行最后一格' },
  { key: 'keepWidePairs', label: '破折号占两格', title: '—— / …… 占两格且不拆行' },
  { key: 'centerTitle', label: '第一行为标题', title: '首行作为标题自动居中' },
  { key: 'showGrid', label: '显示格线' },
];

function Switch({
  label,
  title,
  checked,
  onChange,
}: {
  label: string;
  title?: string;
  checked: boolean;
  onChange: (value: boolean) => void;
}) {
  return (
    <label
      title={title}
      className="flex cursor-pointer items-center gap-2 rounded-md px-2 py-1.5 text-xs text-stone-700 hover:bg-stone-100"
    >
      <input
        type="checkbox"
        checked={checked}
        onChange={(e) => onChange(e.target.checked)}
        className="size-3.5 accent-rose-600"
      />
      {label}
    </label>
  );
}

interface Props {
  open: boolean;
  config: StyleConfig;
  onConfig: (updater: (c: StyleConfig) => StyleConfig) => void;
  onClose: () => void;
}

export function SettingsPanel({ open, config, onConfig, onClose }: Props) {
  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose();
    };
    document.addEventListener('keydown', onKey);
    return () => document.removeEventListener('keydown', onKey);
  }, [open, onClose]);

  if (!open) return null;

  const activeFlags = FLAGS.filter((f) => config[f.key]).length;
  const font: FontKey = FONT_OPTIONS.some((o) => o.key === config.font)
    ? config.font
    : FONT_OPTIONS[0].key;

  return createPortal(
    <>
      <div className="fixed inset-0 z-40 bg-stone-900/20" onMouseDown={onClose} />

      <aside className="settings-drawer fixed inset-y-0 left-0 z-50 flex w-72 flex-col border-r border-stone-200 bg-white shadow-2xl">
        <div className="flex shrink-0 items-center justify-between border-b border-stone-200 px-4 py-3">
          <h2 className="text-sm font-semibold text-stone-800">设置</h2>
          <button
            type="button"
            onClick={onClose}
            aria-label="关闭设置"
            className="rounded-md px-2 py-0.5 text-stone-400 transition hover:bg-stone-100 hover:text-stone-700"
          >
            ✕
          </button>
        </div>

        <div className="thin-scroll min-h-0 flex-1 overflow-y-auto px-3 py-4">
          <section>
            <h3 className="mb-1 flex items-center gap-1.5 px-2 text-[11px] font-medium tracking-wide text-stone-500">
              排版规则
              <span className="tabular-nums text-stone-400">
                {activeFlags}/{FLAGS.length}
              </span>
            </h3>
            <div className="grid gap-0.5">
              {FLAGS.map(({ key, label, title }) => (
                <Switch
                  key={key}
                  label={label}
                  title={title}
                  checked={config[key]}
                  onChange={(v) => onConfig((c) => ({ ...c, [key]: v }))}
                />
              ))}
            </div>
          </section>

          <section className="mt-5 border-t border-stone-200 pt-4">
            <h3 className="mb-1 px-2 text-[11px] font-medium tracking-wide text-stone-500">
              答案字体
            </h3>
            <div className="grid gap-0.5">
              {FONT_OPTIONS.map((option) => {
                const checked = option.key === font;
                return (
                  <label
                    key={option.key}
                    className={[
                      'flex cursor-pointer items-center gap-2 rounded-md px-2 py-2 text-xs transition',
                      checked ? 'bg-rose-50 text-rose-700' : 'text-stone-700 hover:bg-stone-100',
                    ].join(' ')}
                  >
                    <input
                      type="radio"
                      name="sheet-font"
                      checked={checked}
                      onChange={() => onConfig((c) => ({ ...c, font: option.key }))}
                      className="size-3.5 accent-rose-600"
                    />
                    <span className="text-base leading-none" style={{ fontFamily: option.stack }}>
                      申论作答
                    </span>
                    <span className="ml-auto shrink-0">
                      {option.label}
                      {option.hint && <span className="ml-1 text-stone-400">{option.hint}</span>}
                    </span>
                  </label>
                );
              })}
            </div>
          </section>

          <section className="mt-5 border-t border-stone-200 pt-4">
            <h3 className="mb-1 px-2 text-[11px] font-medium tracking-wide text-stone-500">界面</h3>
            <div className="grid gap-0.5">
              <Switch
                label="沉浸式答题"
                title="顶部工具栏与底部状态栏自动收起，鼠标移到屏幕上下边缘时浮出"
                checked={Boolean(config.immersive)}
                onChange={(v) => onConfig((c) => ({ ...c, immersive: v }))}
              />
            </div>
          </section>
        </div>
      </aside>
    </>,
    document.body,
  );
}
