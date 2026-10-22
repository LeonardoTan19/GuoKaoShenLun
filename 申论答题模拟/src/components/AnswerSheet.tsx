import { useCallback, useEffect, useLayoutEffect, useRef, useState } from 'react';
import type { CSSProperties, MouseEvent as ReactMouseEvent } from 'react';
import { cellSelected } from '../core/sourcemap';
import { resolveFontStack, resolveTargetWords } from '../core/presets';
import type { MappedCell } from '../core/types';
import type { SheetEditor } from '../hooks/useSheetEditor';

/** 挤格文字的横向压缩比下限；再扁就改缩字号，保住可读高度 */
const MIN_SCALE_X = 0.72;
/** 挤格文字的横向拉伸比上限；数字天生偏窄，适当拉开更接近印刷体 */
const MAX_SCALE_X = 1.2;
/** 挤格文字最多占格宽的比例 */
const FIT_RATIO = 0.9;
/** 行尾避头标点最多占格宽的比例 */
const EXTRA_PUNCT_FIT_RATIO = 0.35;
/** 卷面标线与字数标记的颜色 */
const MARKER_COLOR = '#f43f5e';
/** 每多少字打一个刻度 */
const MARK_INTERVAL = 100;
/** 100% 缩放（zoom = 1）时的格子边长 */
const CELL_SIZE_100 = 33.6;

/** 离屏 canvas，仅用于量文字自然宽度 */
let measureCtx: CanvasRenderingContext2D | null | undefined;

function getMeasureCtx(): CanvasRenderingContext2D | null {
  if (measureCtx === undefined) {
    measureCtx = document.createElement('canvas').getContext('2d');
  }
  return measureCtx;
}

interface Props {
  editor: SheetEditor;
  zoom: number;
}

/** 挤格文字的样式：只动横向 scaleX，挤不下时才由字号补差 */
function fitStyle(fit: { fontSize: number; scaleX: number } | null): CSSProperties | null {
  return fit ? { fontSize: fit.fontSize, transform: `scaleX(${fit.scaleX.toFixed(3)})` } : null;
}

/** 字数刻度：格下方居中、尖朝上的小三角 */
function triangleStyle(
  cellSize: number,
  rowGap: number,
  big: boolean,
  color: string,
): CSSProperties {
  const w = Math.round(cellSize * 0.1 * (big ? 1.5 : 1));
  const h = Math.round(cellSize * 0.16 * (big ? 1.5 : 1));
  return {
    position: 'absolute',
    top: '100%',
    left: '50%',
    marginLeft: -w,
    marginTop: Math.round((rowGap - h) / 2),
    width: 0,
    height: 0,
    borderLeft: `${w}px solid transparent`,
    borderRight: `${w}px solid transparent`,
    borderBottom: `${h}px solid ${color}`,
  };
}

/** 每 100 字的文字提示：紧贴三角右侧 */
function markLabelStyle(
  cellSize: number,
  rowGap: number,
  big: boolean,
  color: string,
): CSSProperties {
  const w = Math.round(cellSize * 0.1 * (big ? 1.5 : 1));
  return {
    position: 'absolute',
    top: '100%',
    left: '50%',
    marginLeft: w + 2,
    marginTop: Math.round(rowGap / 2),
    transform: 'translateY(-50%)',
    fontSize: Math.max(8, Math.round(rowGap * 0.7)),
    lineHeight: 1,
    color,
    whiteSpace: 'nowrap',
  };
}

export function AnswerSheet({ editor, zoom }: Props) {
  const { sheet, caret, selStart, selEnd, composing, focused, config } = editor;

  const scrollRef = useRef<HTMLDivElement | null>(null);
  const wrapRef = useRef<HTMLDivElement | null>(null);
  const draggingRef = useRef<number | null>(null);

  const cellSize = Math.round(CELL_SIZE_100 * zoom);
  const fontMain = Math.round(cellSize * 0.6);
  const fontSerial = Math.round(cellSize * 0.64);
  const fontDouble = Math.round(cellSize * 0.7);
  const rowGap = Math.round(cellSize * 0.4);
  const lineColor = config.showGrid ? MARKER_COLOR : 'transparent';
  const fontStack = resolveFontStack(config.font);

  const measureCache = useRef(new Map<string, number>());
  const [fontEpoch, setFontEpoch] = useState(0);

  useEffect(() => {
    let alive = true;
    void document.fonts?.ready.then(() => {
      if (!alive) return;
      measureCache.current.clear();
      setFontEpoch((n) => n + 1);
    });
    return () => {
      alive = false;
    };
  }, []);

  useEffect(() => {
    let alive = true;
    if (!document.fonts?.load) return;
    void document.fonts.load(`${fontMain}px ${fontStack}`).then(() => {
      if (!alive) return;
      measureCache.current.clear();
      setFontEpoch((n) => n + 1);
    });
    return () => {
      alive = false;
    };
  }, [fontStack, fontMain]);

  /** 量出 text 在给定字号下的自然宽度（带缓存） */
  const measureWidth = (text: string, fontPx: number): number => {
    const key = `${fontStack}\u0000${fontEpoch}\u0000${fontPx}\u0000${text}`;
    const cache = measureCache.current;
    const hit = cache.get(key);
    if (hit !== undefined) return hit;
    const ctx = getMeasureCtx();
    if (!ctx) return text.length * fontPx;
    ctx.font = `${fontPx}px ${fontStack}`;
    const width = ctx.measureText(text).width;
    cache.set(key, width);
    return width;
  };

  /** 把 text 塞进一格：先只横向缩放，实在挤不下才回缩字号（避免被压成一条细线） */
  const fitInsideCell = (text: string, fontPx: number, maxWidth: number) => {
    const natural = measureWidth(text, fontPx);
    if (natural <= 0) return { fontSize: fontPx, scaleX: 1 };
    let scaleX = maxWidth / natural;
    let fontSize = fontPx;
    if (scaleX < MIN_SCALE_X) {
      fontSize = Math.max(7, Math.round(fontPx * (scaleX / MIN_SCALE_X)));
      scaleX = MIN_SCALE_X;
    }
    return { fontSize, scaleX: Math.min(scaleX, MAX_SCALE_X) };
  };

  const cellBox: CSSProperties = {
    width: cellSize,
    height: cellSize,
    borderRight: `1px solid ${lineColor}`,
  };

  const gridBox: CSSProperties = {
    borderTop: `1px solid ${lineColor}`,
    borderLeft: `1px solid ${lineColor}`,
    borderBottom: `1px solid ${lineColor}`,
  };

  useLayoutEffect(() => {
    const ta = editor.textareaRef.current;
    const wrap = wrapRef.current;
    if (!ta || !wrap) return;
    const el = wrap.querySelector<HTMLElement>(`[data-cell="${caret.cellId}"]`);
    if (!el) return;

    const wr = wrap.getBoundingClientRect();
    const cr = el.getBoundingClientRect();
    ta.style.top = `${cr.top - wr.top}px`;
    ta.style.left = `${cr.left - wr.left + (caret.placement === 'right' ? cr.width - 2 : 0)}px`;
    ta.style.height = `${cr.height}px`;

    const scroller = scrollRef.current;
    if (scroller) {
      const sr = scroller.getBoundingClientRect();
      if (cr.top < sr.top) scroller.scrollTop -= sr.top - cr.top + cellSize;
      else if (cr.bottom > sr.bottom) scroller.scrollTop += cr.bottom - sr.bottom + cellSize;
      if (cr.left < sr.left) scroller.scrollLeft -= sr.left - cr.left + cellSize;
      else if (cr.right > sr.right) scroller.scrollLeft += cr.right - sr.right + cellSize;
    }
  }, [caret, editor.textareaRef, cellSize, sheet]);

  const offsetFromEvent = useCallback((e: ReactMouseEvent<HTMLElement>, cell: MappedCell) => {
    const rect = e.currentTarget.getBoundingClientRect();
    const rightHalf = e.clientX - rect.left > rect.width / 2;
    return rightHalf ? cell.rawEnd : cell.rawStart;
  }, []);

  const handleCellMouseDown = useCallback(
    (e: ReactMouseEvent<HTMLDivElement>, cell: MappedCell) => {
      if (e.button !== 0) return;
      e.preventDefault();
      const offset = offsetFromEvent(e, cell);
      if (e.shiftKey) {
        editor.pickOffset(offset, true);
        draggingRef.current = null;
        return;
      }
      editor.pickOffset(offset, false);
      draggingRef.current = offset;
    },
    [editor, offsetFromEvent],
  );

  const handleCellDoubleClick = useCallback(
    (e: ReactMouseEvent<HTMLDivElement>, cell: MappedCell) => {
      e.preventDefault();
      const offset = offsetFromEvent(e, cell);
      const unit = editor.units.find((u) => u.start <= offset && offset < u.end);
      if (unit && unit.end > unit.start) editor.setSelection(unit.start, unit.end);
    },
    [editor, offsetFromEvent],
  );

  useEffect(() => {
    const onMove = (e: MouseEvent) => {
      const anchor = draggingRef.current;
      if (anchor === null) return;
      const el = document.elementFromPoint(e.clientX, e.clientY);
      const cellEl = el?.closest<HTMLElement>('[data-raw-start]');
      if (!cellEl) return;
      const rawStart = Number(cellEl.dataset.rawStart);
      const rawEnd = Number(cellEl.dataset.rawEnd);
      if (Number.isNaN(rawStart) || Number.isNaN(rawEnd)) return;
      const rect = cellEl.getBoundingClientRect();
      const rightHalf = e.clientX - rect.left > rect.width / 2;
      editor.setSelection(anchor, rightHalf ? rawEnd : rawStart);
    };
    const onUp = () => {
      draggingRef.current = null;
    };
    window.addEventListener('mousemove', onMove);
    window.addEventListener('mouseup', onUp);
    return () => {
      window.removeEventListener('mousemove', onMove);
      window.removeEventListener('mouseup', onUp);
    };
  }, [editor.setSelection]);

  const cols = sheet.cols;
  // 字数刻度所在格（从 1 数起）：每 100 字一个，加上「字数要求」那一格
  const targetWords = resolveTargetWords(config.targetWords);
  const marks = new Set<number>();
  for (let n = MARK_INTERVAL; n <= cols * sheet.grid.length; n += MARK_INTERVAL) marks.add(n);
  marks.add(targetWords);

  return (
    <div
      ref={scrollRef}
      className={[
        'thin-scroll h-full select-none overflow-auto bg-stone-200/70 p-5',
        config.immersive ? 'pt-12' : '',
      ].join(' ')}
    >
      <div
        ref={wrapRef}
        className="relative mx-auto w-max bg-white px-8 py-6 shadow-[0_2px_16px_rgba(0,0,0,0.10)] ring-1 ring-stone-300"
        style={{ fontFamily: fontStack }}
      >
        <textarea
          ref={editor.textareaRef}
          defaultValue={editor.rawText}
          spellCheck={false}
          autoCapitalize="off"
          autoCorrect="off"
          aria-label="申论作答输入区"
          className="absolute z-30 resize-none overflow-hidden rounded-none border-0 bg-transparent p-0 text-transparent outline-none"
          style={{
            top: 0,
            left: 0,
            width: 2,
            height: cellSize,
            opacity: 0,
            pointerEvents: 'none',
            caretColor: 'transparent',
            fontSize: fontMain,
            lineHeight: 1,
          }}
          {...editor.handlers}
        />

        <div className="font-hei pointer-events-none mb-2 text-[11px] tracking-widest text-stone-400">
          申论答题纸
        </div>

        {sheet.grid.map((row, rIdx) => (
          <div key={`row-${rIdx}`} className="relative" style={{ marginBottom: rowGap }}>
            <div
              className="grid mx-auto w-max"
              style={{
                gridTemplateColumns: `repeat(${cols}, ${cellSize}px)`,
                ...gridBox,
              }}
            >
              {row.map((cell, cIdx) => {
                const index = rIdx * cols + cIdx + 1;
                const isTarget = index === targetWords;
                const mark = marks.has(index);
                const isCentury = index % MARK_INTERVAL === 0;
                const isCaret = caret.row === rIdx && caret.col === cIdx;
                const selected = cellSelected(cell, selStart, selEnd);
                const isSqueezed = cell.type === 'serial' || cell.type === 'punct-pair';
                const isDouble = cell.type === 'double-char';
                const isWide = cell.type === 'wide';
                const showExtra = Boolean(cell.extraPunct);

                const caretStyle: CSSProperties = {
                  width: 2,
                  top: Math.round(cellSize * 0.14),
                  bottom: Math.round(cellSize * 0.14),
                };
                if (caret.placement === 'right') caretStyle.right = 1;
                else caretStyle.left = 1;

                const maxFitWidth = cellSize * FIT_RATIO;
                const squeezeFit = isSqueezed
                  ? fitInsideCell(cell.text, fontSerial, maxFitWidth)
                  : null;
                const doubleFit = isDouble
                  ? fitInsideCell(cell.text, fontDouble, maxFitWidth)
                  : null;
                const fitted = fitStyle(squeezeFit ?? doubleFit);

                const extraBudget = cellSize * EXTRA_PUNCT_FIT_RATIO;
                const extraNatural = showExtra ? measureWidth(cell.extraPunct ?? '', fontMain) : 0;
                const extraScale = extraNatural > 0 ? Math.min(1, extraBudget / extraNatural) : 1;
                const extraWidth = Math.round(extraNatural * extraScale * 100) / 100;

                return (
                  <div
                    key={cell.id}
                    data-cell={cell.id}
                    data-raw-start={cell.rawStart}
                    data-raw-end={cell.rawEnd}
                    onMouseDown={(e) => handleCellMouseDown(e, cell)}
                    onDoubleClick={(e) => handleCellDoubleClick(e, cell)}
                    className={[
                      'relative flex cursor-text items-center justify-center transition-colors',
                      selected ? 'bg-sky-200/70' : 'hover:bg-rose-50',
                      isCaret && composing ? 'ring-1 ring-amber-400 ring-inset' : '',
                    ].join(' ')}
                    style={cellBox}
                  >
                    {cell.text && (
                      <span
                        className="whitespace-nowrap text-stone-900"
                        style={
                          fitted ??
                          { fontSize: fontMain, ...(isWide ? { transform: 'scaleX(1.05)' } : {}) }
                        }
                      >
                        {cell.text}
                      </span>
                    )}

                    {showExtra && (
                      <span
                        className="pointer-events-none whitespace-nowrap text-stone-700"
                        style={{
                          display: 'inline-block',
                          fontSize: fontMain,
                          width: extraWidth,
                          transform: `scaleX(${extraScale.toFixed(3)})`,
                          transformOrigin: 'left center',
                        }}
                      >
                        {cell.extraPunct}
                      </span>
                    )}

                    {isCaret && (
                      <span
                        className={`caret-blink pointer-events-none absolute bg-blue-600 ${
                          focused ? '' : 'caret-idle'
                        }`}
                        style={caretStyle}
                      />
                    )}

                    {isCaret && composing && (
                      <span
                        className="font-hei pointer-events-none absolute left-0 z-20 whitespace-nowrap rounded border border-amber-400 bg-amber-50 px-1.5 py-0.5 text-xs text-stone-800 shadow-sm"
                        style={{ top: -Math.round(cellSize * 0.95) }}
                      >
                        {composing}
                      </span>
                    )}

                    {mark && (
                      <>
                        <span
                          className="pointer-events-none"
                          style={triangleStyle(cellSize, rowGap, isTarget, lineColor)}
                        />
                        {isCentury && (
                          <span
                            className="font-hei pointer-events-none"
                            style={markLabelStyle(cellSize, rowGap, isTarget, lineColor)}
                          >
                            {index}字
                          </span>
                        )}
                      </>
                    )}
                  </div>
                );
              })}
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}
