import type { MappedCell } from './types';

/** 字数统计（申论口径：不含换行符，标点计入） */
export interface SheetStats {
  /** 卷面已占用的格子数（含缩进格、合并编号格、换行补齐格） */
  cells: number;
  /** 全部字符数（含标点、数字，不含换行符） */
  chars: number;
}

/** 最后一个被真实字符占据的格下标（无内容时为 -1） */
function lastOccupiedIndex(flat: MappedCell[]): number {
  for (let i = flat.length - 1; i >= 0; i--) {
    if (flat[i].rawEnd > flat[i].rawStart) return i;
  }
  return -1;
}

export function countStats(flat: MappedCell[], text: string): SheetStats {
  return {
    cells: lastOccupiedIndex(flat) + 1,
    chars: Array.from(text.replace(/\n/g, '')).length,
  };
}
