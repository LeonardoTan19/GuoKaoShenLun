/** 方格纸编辑器类型：底层只维护「一个纯字符串 + 字符偏移量」，方格是它的渲染索引视图 */

/** 单元格类型：决定点击落点、光标吸合位置与方向键导航行为 */
export type CellType =
  /** 单个汉字 / 标点 */
  | 'normal'
  /** 「1、」「2.」「（3）」挤在一格（源码 2~4 字符） */
  | 'serial'
  /** 相邻双标点合占一格（源码 2 字符） */
  | 'punct-pair'
  /** 两位数字挤在一格（源码 2 字符） */
  | 'double-char'
  /** 破折号 / 省略号的其中一格（两格一组，原子不可分） */
  | 'wide'
  /** 段首缩进、标题居中填充（零宽） */
  | 'indent'
  /** 段末补齐（零宽） */
  | 'para-empty'
  /** 为避免拆断宽单元留下的空位（零宽） */
  | 'filler'
  /** 卷面底部纯空行（零宽） */
  | 'sheet-empty';

/** 卷面可选的作答字体 */
export type FontKey = 'xingshu' | 'kaiti' | 'fangsong' | 'songti' | 'heiti';

/** 排版风格开关 */
export interface StyleConfig {
  /** 每行格数，国考答题卡为 25 */
  colsPerRow: number;
  /** 字数要求：卷面最少行数 = 字数要求 ÷ 每行格数（向上取整） */
  targetWords: number;
  /** 卷面字体 */
  font: FontKey;
  /** 每段首行缩进 2 格 */
  indentTwoCells: boolean;
  /** 编号（1、/ 1.）挤占一格 */
  mergeSerialNumber: boolean;
  /** 相邻双标点合占一格 */
  mergePunctPair: boolean;
  /** 两位数字同格 */
  mergeDoubleDigits: boolean;
  /** 标点避头：行首禁排标点挤到上一行末格 */
  avoidLineStartPunct: boolean;
  /** 破折号 / 省略号占两格且不断行 */
  keepWidePairs: boolean;
  /** 首段（标题）自动居中 */
  centerTitle: boolean;
  /** 显示格线 */
  showGrid: boolean;
  /** 沉浸式答题：顶部/底部信息栏默认收起，鼠标靠近屏幕边缘时浮出 */
  immersive: boolean;
}

/** 一个方格：携带它在 rawText 中的源码区间 */
export interface MappedCell {
  /** 唯一 ID，形如 `3-17`（行-列） */
  id: string;
  row: number;
  col: number;
  /** 格子里显示的文字 */
  text: string;
  type: CellType;
  /** 对应 rawText 的起始下标 */
  rawStart: number;
  /** 对应 rawText 的结束下标（不含） */
  rawEnd: number;
  /** 与其它格共享的原子单元 ID（仅破折号 / 省略号） */
  unitId?: string;
  /** 被挤压到本格的标点 */
  extraPunct?: string;
  /** 被挤压标点的源码区间 */
  extraPunctRange?: [number, number];
}

/** 光标画在某格的左边缘还是右边缘 */
export type CaretPlacement = 'left' | 'right';

/** 光标的视觉位置（由字符偏移量反查得到） */
export interface CaretVisualPos {
  row: number;
  col: number;
  placement: CaretPlacement;
  cellId: string;
}

/** 选区：anchor / focus 语义同原生 textarea */
export interface Selection {
  anchor: number;
  focus: number;
}
