import type { CaretVisualPos, CellType, MappedCell } from './types';

/** 最小不可分整体：方向键 / 退格按它移动、删除 */
export interface Unit {
  start: number;
  end: number;
}

/** 可作为光标落点的零宽格类型 */
export const GAP_TYPES = new Set<CellType>(['para-empty', 'sheet-empty']);

/** 从全量格子中抽取排序去重后的原子单元表 */
export function buildUnits(flat: MappedCell[]): Unit[] {
  const groups = new Map<string, Unit>();
  const units: Unit[] = [];

  for (const cell of flat) {
    if (cell.rawEnd <= cell.rawStart) continue;

    if (cell.unitId) {
      const g = groups.get(cell.unitId);
      if (g) {
        g.start = Math.min(g.start, cell.rawStart);
        g.end = Math.max(g.end, cell.rawEnd);
      } else {
        const unit: Unit = { start: cell.rawStart, end: cell.rawEnd };
        groups.set(cell.unitId, unit);
        units.push(unit);
      }
      continue;
    }

    if (cell.extraPunctRange) {
      const [ps, pe] = cell.extraPunctRange;
      units.push({ start: cell.rawStart, end: ps }, { start: ps, end: pe });
      continue;
    }

    units.push({ start: cell.rawStart, end: cell.rawEnd });
  }

  units.sort((a, b) => a.start - b.start || a.end - b.end);

  return units.filter(
    (u, i) => i === 0 || u.start !== units[i - 1].start || u.end !== units[i - 1].end,
  );
}

/** 光标左移一格，返回目标偏移量 */
export function prevStop(units: Unit[], offset: number): number {
  let fallback = 0;
  for (const u of units) {
    if (u.start < offset && offset <= u.end) return u.start;
    if (u.end < offset) fallback = u.end;
  }
  return fallback;
}

/** 光标右移一格，返回目标偏移量 */
export function nextStop(units: Unit[], offset: number, textLength: number): number {
  let fallback = textLength;
  for (const u of units) {
    if (u.start <= offset && offset < u.end) return u.end;
    if (u.start > offset) fallback = Math.min(fallback, u.start);
  }
  return fallback;
}

/** 文本索引 → 光标渲染坐标 */
export function findCaretVisualPosition(grid: MappedCell[][], offset: number): CaretVisualPos {
  for (let r = 0; r < grid.length; r++) {
    const row = grid[r];
    let gapSeen = false;

    for (let c = 0; c < row.length; c++) {
      const cell = row[c];

      if (cell.rawEnd > cell.rawStart) {
        if (cell.rawStart === offset) return { row: r, col: c, placement: 'left', cellId: cell.id };
        if (offset > cell.rawStart && offset <= cell.rawEnd) {
          return { row: r, col: c, placement: 'right', cellId: cell.id };
        }
      } else if (GAP_TYPES.has(cell.type) && cell.rawStart === offset && !gapSeen) {
        return { row: r, col: c, placement: 'left', cellId: cell.id };
      }

      if (GAP_TYPES.has(cell.type)) gapSeen = true;
    }
  }

  const first = grid[0]?.[0];
  return { row: 0, col: 0, placement: 'left', cellId: first ? first.id : '0-0' };
}

/** 某一行里真实内容的起止偏移量 */
export function rowBounds(row: MappedCell[]): { start: number; end: number } {
  let start = -1;
  let end = -1;
  for (const cell of row) {
    if (cell.rawEnd <= cell.rawStart) continue;
    if (start < 0) start = cell.rawStart;
    end = Math.max(end, cell.rawEnd);
  }
  if (start < 0) {
    const raw = row[0]?.rawStart ?? 0;
    return { start: raw, end: raw };
  }
  return { start, end };
}
