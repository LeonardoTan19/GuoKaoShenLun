import type { FontKey, StyleConfig } from './types';

/** 国考申论答题卡默认风格 */
export const DEFAULT_CONFIG: StyleConfig = {
  colsPerRow: 25,
  targetWords: 300,
  font: 'xingshu',
  indentTwoCells: true,
  mergeSerialNumber: true,
  mergePunctPair: true,
  mergeDoubleDigits: true,
  avoidLineStartPunct: true,
  keepWidePairs: true,
  centerTitle: false,
  showGrid: true,
  immersive: false,
};

/** 把 value 夹到 [min, max] */
export function clamp(value: number, min: number, max: number): number {
  return Math.min(Math.max(value, min), max);
}

/** 一种可选字体：stack 直接作为 CSS font-family 使用 */
export interface FontOption {
  key: FontKey;
  label: string;
  /** 字体列表里的小注释 */
  hint?: string;
  stack: string;
}

/** 答案字体选项（首个为默认） */
export const FONT_OPTIONS: FontOption[] = [
  {
    key: 'xingshu',
    label: '张清平硬笔行书',
    hint: '内置',
    stack:
      "'Ruimei Xingshu', '瑞美加张清平硬笔行书', 'Ruimei Kaishu', '瑞美加张清平硬笔楷书', " +
      "'KaiTi', 'STKaiti', '楷体', 'Kaiti SC', 'FangSong', '仿宋', 'Songti SC', SimSun, serif",
  },
  {
    key: 'kaiti',
    label: '张清平硬笔楷书',
    hint: '内置',
    stack:
      "'Ruimei Kaishu', '瑞美加张清平硬笔楷书', 'KaiTi', 'STKaiti', '楷体', 'Kaiti SC', " +
      "'FangSong', '仿宋', 'Songti SC', SimSun, serif",
  },
  {
    key: 'fangsong',
    label: '仿宋',
    stack: "'FangSong', '仿宋', 'FangSong_GB2312', 'STFangsong', 'Songti SC', SimSun, serif",
  },
  {
    key: 'songti',
    label: '宋体',
    stack: "'SimSun', '宋体', 'Songti SC', 'STSong', 'Noto Serif SC', serif",
  },
  {
    key: 'heiti',
    label: '黑体',
    stack:
      "'Heiti SC', 'STHeiti', 'SimHei', '黑体', 'Microsoft YaHei UI', 'Microsoft YaHei', " +
      "'PingFang SC', sans-serif",
  },
];

/** 解析生效的字体栈：未知 / 缺省时回退到第一个选项 */
export function resolveFontStack(key: FontKey | undefined): string {
  return (FONT_OPTIONS.find((o) => o.key === key) ?? FONT_OPTIONS[0]).stack;
}

/** 输入框留空（≤ 0）时统一回退到 fallback */
function resolvePositive(value: number, fallback: number): number {
  const n = Math.floor(value);
  return Number.isFinite(n) && n > 0 ? n : fallback;
}

/** 解析生效的每行格数：输入框留空（0）时按 25 算 */
export function resolveColsPerRow(value: number): number {
  return resolvePositive(value, 25);
}

/** 解析生效的字数要求：输入框留空（0）时按 200 算 */
export function resolveTargetWords(value: number): number {
  return resolvePositive(value, 200);
}

