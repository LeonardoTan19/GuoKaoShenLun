import { resolveTargetWords } from '../core/presets';
import { countStats } from '../core/stats';
import type { SheetEditor } from '../hooks/useSheetEditor';

interface Props {
  editor: SheetEditor;
}

export function StatusBar({ editor }: Props) {
  const stats = countStats(editor.sheet.flat, editor.rawText);
  const target = resolveTargetWords(editor.config.targetWords);
  const over = stats.cells > target;

  return (
    <div
      className={[
        'flex shrink-0 flex-wrap items-center gap-x-4 gap-y-1 border-t bg-white px-6 py-2 text-xs print:hidden',
        over ? 'border-rose-400 text-rose-600' : 'border-stone-300 text-stone-600',
      ].join(' ')}
    >
      <span>
        字数{' '}
        <b className={['tabular-nums', over ? 'text-rose-600' : 'text-stone-900'].join(' ')}>
          {stats.cells}
        </b>
        <span className="text-stone-400"> / {target}</span>
      </span>
      <span>
        实际字数 <b className="tabular-nums text-stone-900">{stats.chars}</b>
      </span>

      {over && (
        <span className="rounded-full bg-rose-100 px-2 py-0.5 font-medium">
          ⚠ 已超出 {stats.cells - target} 字
        </span>
      )}
    </div>
  );
}
