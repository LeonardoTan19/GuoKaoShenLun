import { clamp, resolveColsPerRow, resolveTargetWords } from './presets';
import type { CellType, MappedCell, StyleConfig } from './types';

/** 序号挤格：1、 2. （3） 等；ASCII 句点后跟数字视为小数点，不算序号 */
const SERIAL_RE = /^(\d{1,2}[、．]|\d{1,2}\.(?!\d)|[（(]\d{1,2}[）)])/;
/** 两位数字挤一格 */
const DOUBLE_DIGIT_RE = /^\d{2}/;
/** 破折号 / 省略号（成对的两个字符） */
const WIDE_PAIR_RE = /^(——|――|……|\.\.\.\.)/;
/** 相邻双标点合占一格：冒号 + 开引号、句末标点 + 闭引号 */
const PUNCT_PAIR_RE = /^(：['“‘「『]|[。！？]['”’」』])/;
/** 禁止出现在行首的标点（避头） */
const FORBIDDEN_LINE_START_RE = /^[，。、；：？！）〕】》」”’…—％%]/;

/** 「源码多字符挤进一格」的合并规则，按优先级排列 */
const MERGE_RULES: { flag: keyof StyleConfig; re: RegExp; type: CellType }[] = [
  { flag: 'mergeSerialNumber', re: SERIAL_RE, type: 'serial' },
  { flag: 'mergePunctPair', re: PUNCT_PAIR_RE, type: 'punct-pair' },
  { flag: 'mergeDoubleDigits', re: DOUBLE_DIGIT_RE, type: 'double-char' },
];

/** 排版过程中的中间态格子（还没有行列坐标） */
interface Draft {
  text: string;
  type: CellType;
  rawStart: number;
  rawEnd: number;
  unitId?: string;
  extraPunct?: string;
  extraPunctRange?: [number, number];
}

export interface Sheet {
  grid: MappedCell[][];
  flat: MappedCell[];
  cols: number;
}

/** 取 text 中第 i 个「字位」的 UTF-16 长度（正确处理代理对） */
function charLenAt(text: string, i: number): number {
  const code = text.charCodeAt(i);
  if (code >= 0xd800 && code <= 0xdbff && i + 1 < text.length) return 2;
  return 1;
}

/** 把一个段落切成 token，每个 token 恰好占 1 格 */
function tokenize(text: string, base: number, config: StyleConfig, unitPrefix: string): Draft[] {
  const out: Draft[] = [];
  let i = 0;
  let seq = 0;
  const emit = (match: RegExpMatchArray, type: CellType) => {
    out.push({ text: match[0], type, rawStart: base + i, rawEnd: base + i + match[0].length });
    i += match[0].length;
  };

  while (i < text.length) {
    const rest = text.slice(i);
    const wide = config.keepWidePairs ? rest.match(WIDE_PAIR_RE) : null;
    if (wide && wide[0].length === 2) {
      const unitId = `${unitPrefix}-w${seq++}`;
      out.push({ text: wide[0][0], type: 'wide', rawStart: base + i, rawEnd: base + i + 1, unitId });
      out.push({
        text: wide[0][1],
        type: 'wide',
        rawStart: base + i + 1,
        rawEnd: base + i + 2,
        unitId,
      });
      i += 2;
      continue;
    }

    const rule = MERGE_RULES.find((r) => config[r.flag] && r.re.test(rest));
    if (rule) {
      emit(rest.match(rule.re)!, rule.type);
      continue;
    }

    const len = charLenAt(text, i);
    out.push({
      text: text.slice(i, i + len),
      type: 'normal',
      rawStart: base + i,
      rawEnd: base + i + len,
    });
    i += len;
  }

  return out;
}

/** 生成带源码映射的方格矩阵 */
export function buildSheet(rawText: string, config: StyleConfig): Sheet {
  const cols = clamp(resolveColsPerRow(config.colsPerRow), 1, 60);
  const draftRows: Draft[][] = [];

  let row: Draft[] = [];
  const blank = (at: number, type: CellType): Draft => ({ text: '', type, rawStart: at, rawEnd: at });
  /** 收掉当前行 */
  const endRow = () => {
    draftRows.push(row);
    row = [];
  };
  /** 补齐到 cols 格后落盘；空行也会占满一整行（padType 决定补白格的类型） */
  const flush = (padType: CellType, at: number) => {
    while (row.length < cols) row.push(blank(at, padType));
    endRow();
  };
  /** 追加一格；满 cols 自动收行。所有入格都必须走这里，避免行内格数溢出 */
  const push = (d: Draft) => {
    row.push(d);
    if (row.length >= cols) endRow();
  };

  const lines = rawText.split('\n');
  let base = 0;

  lines.forEach((lineText, pIdx) => {
    const start = base;
    const end = base + lineText.length;
    base = end + 1;

    const tokens = tokenize(lineText, start, config, `p${pIdx}`);
    const occupied = tokens.length;
    const isTitleLine = pIdx === 0 && config.centerTitle && lineText.trim().length > 0;

    if (isTitleLine && occupied < cols) {
      const pad = Math.floor((cols - occupied) / 2);
      for (let k = 0; k < pad; k++) {
        push(blank(start, 'indent'));
      }
    } else if (config.indentTwoCells) {
      // 最多缩进到「本行还剩一格放字」，1~2 格的小卷面也不会把缩进格挤到下一行
      const indent = Math.min(2, Math.max(cols - 1, 0));
      for (let k = 0; k < indent; k++) {
        push(blank(start, 'indent'));
      }
    }

    for (const t of tokens) {
      if (
        config.avoidLineStartPunct &&
        row.length === 0 &&
        draftRows.length > 0 &&
        FORBIDDEN_LINE_START_RE.test(t.text)
      ) {
        const prevRow = draftRows[draftRows.length - 1];
        const last = prevRow[prevRow.length - 1];
        if (last) {
          last.extraPunct = (last.extraPunct ?? '') + t.text;
          last.extraPunctRange = [t.rawStart, t.rawEnd];
          last.rawEnd = Math.max(last.rawEnd, t.rawEnd);
          continue;
        }
      }

      if (t.type === 'wide' && row.length === cols - 1) {
        push(blank(t.rawStart, 'filler'));
      }

      push(t);
    }

    if (row.length > 0 || tokens.length === 0) {
      flush('para-empty', end);
    }
  });

  const totalLen = rawText.length;
  const targetWords = resolveTargetWords(config.targetWords);
  const minRows = clamp(Math.ceil(targetWords / cols) || 1, 1, 400);
  while (draftRows.length < minRows) {
    draftRows.push(
      Array.from({ length: cols }, (): Draft => ({
        text: '',
        type: 'sheet-empty',
        rawStart: totalLen,
        rawEnd: totalLen,
      })),
    );
  }

  const grid: MappedCell[][] = draftRows.map((r, ri) =>
    r.map((d, ci) => ({ ...d, id: `${ri}-${ci}`, row: ri, col: ci })),
  );

  return { grid, flat: grid.flat(), cols };
}

/** 该格是否落在 [s, e) 选区内 */
export function cellSelected(cell: MappedCell, s: number, e: number): boolean {
  if (s === e) return false;
  if (cell.rawEnd <= cell.rawStart) return cell.rawStart > s && cell.rawStart < e;
  return cell.rawStart < e && cell.rawEnd > s;
}
