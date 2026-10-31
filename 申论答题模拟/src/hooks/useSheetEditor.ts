/**
 * 方格原位输入：真实数据只是一个纯字符串 + 选区偏移量，页面只挂一个跟随光标的透明 textarea
 */
import { useCallback, useLayoutEffect, useMemo, useRef, useState } from "react";
import type {
  ClipboardEvent,
  CompositionEvent,
  FormEvent,
  KeyboardEvent,
  RefObject,
} from "react";
import {
  buildUnits,
  findCaretVisualPosition,
  GAP_TYPES,
  nextStop,
  prevStop,
  rowBounds,
} from "../core/navigate";
import { clamp } from "../core/presets";
import { buildSheet } from "../core/sourcemap";
import type { CaretVisualPos, Selection, StyleConfig } from "../core/types";

interface Snapshot {
  text: string;
  anchor: number;
  focus: number;
}

const HISTORY_LIMIT = 400;
const COALESCE_MS = 400;

export function useSheetEditor(
  initialText: string,
  initialConfig: StyleConfig,
) {
  const [rawText, setRawText] = useState(initialText);
  const [config, setConfigState] = useState(initialConfig);
  const [selection, setSelectionState] = useState<Selection>(() => ({
    anchor: initialText.length,
    focus: initialText.length,
  }));
  const [composing, setComposing] = useState("");
  const [focused, setFocused] = useState(false);
  const [histState, setHistState] = useState({
    canUndo: false,
    canRedo: false,
  });

  const textareaRef: RefObject<HTMLTextAreaElement | null> = useRef(null);
  const composingRef = useRef(false);
  const textRef = useRef(rawText);
  const selRef = useRef<Selection>({
    anchor: initialText.length,
    focus: initialText.length,
  });
  const past = useRef<Snapshot[]>([]);
  const future = useRef<Snapshot[]>([]);
  const lastPushAt = useRef(0);

  const writeNative = useCallback((text: string, sel: Selection) => {
    const ta = textareaRef.current;
    if (!ta || composingRef.current) return;
    const tail = text.slice(Math.max(sel.anchor, sel.focus));
    if (ta.value !== tail) ta.value = tail;
    ta.setSelectionRange(0, 0);
  }, []);

  const apply = useCallback(
    (text: string, anchor: number, focus: number) => {
      const len = text.length;
      const sel: Selection = {
        anchor: clamp(anchor, 0, len),
        focus: clamp(focus, 0, len),
      };
      textRef.current = text;
      selRef.current = sel;
      setRawText(text);
      setSelectionState(sel);
      const ta = textareaRef.current;
      if (!ta) return;
      if (document.activeElement !== ta) ta.focus();
      writeNative(text, sel);
    },
    [writeNative],
  );

  useLayoutEffect(() => {
    writeNative(rawText, selRef.current);
  }, [rawText, selection, writeNative]);

  const sheet = useMemo(() => buildSheet(rawText, config), [rawText, config]);
  const units = useMemo(() => buildUnits(sheet.flat), [sheet]);
  const caret = useMemo(
    () => findCaretVisualPosition(sheet.grid, selection.focus),
    [sheet, selection.focus],
  );
  const composingCaret = useMemo<CaretVisualPos | null>(() => {
    const next =
      composing && caret.placement === "right"
        ? sheet.grid[caret.row]?.[caret.col + 1]
        : null;
    return next
      ? { ...caret, col: caret.col + 1, placement: "left", cellId: next.id }
      : null;
  }, [caret, composing, sheet.grid]);

  const syncHistState = useCallback(() => {
    setHistState({
      canUndo: past.current.length > 0,
      canRedo: future.current.length > 0,
    });
  }, []);

  const snapshot = useCallback(
    (): Snapshot => ({ text: textRef.current, ...selRef.current }),
    [],
  );

  const pushHistory = useCallback(
    (coalesce: boolean) => {
      const now = Date.now();
      const merge =
        coalesce &&
        now - lastPushAt.current < COALESCE_MS &&
        past.current.length > 0;
      future.current = [];
      if (!merge) {
        past.current.push(snapshot());
        if (past.current.length > HISTORY_LIMIT) past.current.shift();
        lastPushAt.current = now;
      }
      syncHistState();
    },
    [snapshot, syncHistState],
  );

  const commit = useCallback(
    (text: string, anchor: number, focus: number, coalesce = false) => {
      pushHistory(coalesce);
      apply(text, anchor, focus);
    },
    [apply, pushHistory],
  );

  const setSelection = useCallback(
    (anchor: number, focus: number) => apply(textRef.current, anchor, focus),
    [apply],
  );

  const moveTo = useCallback(
    (offset: number, extend: boolean) => {
      setSelection(extend ? selRef.current.anchor : offset, offset);
    },
    [setSelection],
  );

  const setConfig = useCallback((updater: (c: StyleConfig) => StyleConfig) => {
    setConfigState((c) => updater(c));
  }, []);

  /** 载入新全文 */
  const loadText = useCallback(
    (text: string) => commit(text, text.length, text.length),
    [commit],
  );

  const travel = useCallback(
    (from: RefObject<Snapshot[]>, to: RefObject<Snapshot[]>) => {
      const snap = from.current.pop();
      if (!snap) return;
      to.current.push(snapshot());
      lastPushAt.current = 0;
      syncHistState();
      apply(snap.text, snap.anchor, snap.focus);
    },
    [apply, snapshot, syncHistState],
  );

  const undo = useCallback(() => travel(past, future), [travel]);

  const redo = useCallback(() => travel(future, past), [travel]);

  const moveVertical = useCallback(
    (dir: number, extend: boolean) => {
      const grid = sheet.grid;
      const rowIdx = clamp(caret.row + dir, 0, grid.length - 1);
      const row = grid[rowIdx];
      if (!row) return;

      const targetCol = Math.min(caret.col, row.length - 1);
      let idx = -1;
      for (let c = targetCol; c >= 0; c--) {
        if (row[c].rawEnd > row[c].rawStart) {
          idx = c;
          break;
        }
      }

      let offset: number;
      if (idx < 0) {
        const gap = row.find((c) => GAP_TYPES.has(c.type));
        offset = gap ? gap.rawStart : row[0].rawStart;
      } else if (idx === caret.col) {
        offset =
          caret.placement === "right" ? row[idx].rawEnd : row[idx].rawStart;
      } else {
        offset = row[idx].rawEnd;
      }

      moveTo(offset, extend);
    },
    [caret, moveTo, sheet.grid],
  );

  const goRowEdge = useCallback(
    (side: "start" | "end", extend: boolean) => {
      const row = sheet.grid[caret.row];
      if (!row) return;
      const b = rowBounds(row);
      moveTo(side === "start" ? b.start : b.end, extend);
    },
    [caret.row, moveTo, sheet.grid],
  );

  const handleKeyDown = useCallback(
    (e: KeyboardEvent<HTMLTextAreaElement>) => {
      if (composingRef.current || e.nativeEvent.isComposing) return;

      const { anchor, focus } = selRef.current;
      const s = Math.min(anchor, focus);
      const en = Math.max(anchor, focus);
      const text = textRef.current;
      const len = text.length;
      const mod = e.ctrlKey || e.metaKey;
      const extend = e.shiftKey;

      if (mod && !e.altKey) {
        const k = e.key.toLowerCase();
        if (k === "a") {
          e.preventDefault();
          setSelection(0, len);
          return;
        }
        if (k === "z") {
          e.preventDefault();
          if (extend) redo();
          else undo();
          return;
        }
        if (k === "y") {
          e.preventDefault();
          redo();
          return;
        }
        writeNative(text, selRef.current);
        return;
      }

      switch (e.key) {
        case "ArrowLeft": {
          e.preventDefault();
          if (extend) moveTo(prevStop(units, focus), true);
          else moveTo(s !== en ? s : prevStop(units, s), false);
          return;
        }
        case "ArrowRight": {
          e.preventDefault();
          if (extend) moveTo(nextStop(units, focus, len), true);
          else moveTo(s !== en ? en : nextStop(units, s, len), false);
          return;
        }
        case "ArrowUp":
          e.preventDefault();
          moveVertical(-1, extend);
          return;
        case "ArrowDown":
          e.preventDefault();
          moveVertical(1, extend);
          return;
        case "Home":
          e.preventDefault();
          goRowEdge("start", extend);
          return;
        case "End":
          e.preventDefault();
          goRowEdge("end", extend);
          return;
        case "Backspace": {
          e.preventDefault();
          if (s !== en) {
            commit(text.slice(0, s) + text.slice(en), s, s);
            return;
          }
          const from = prevStop(units, s);
          if (from >= s) return;
          commit(text.slice(0, from) + text.slice(s), from, from);
          return;
        }
        case "Delete": {
          e.preventDefault();
          if (s !== en) {
            commit(text.slice(0, s) + text.slice(en), s, s);
            return;
          }
          const to = nextStop(units, s, len);
          if (to <= s) return;
          commit(text.slice(0, s) + text.slice(to), s, s);
          return;
        }
        default:
          return;
      }
    },
    [
      commit,
      goRowEdge,
      moveTo,
      moveVertical,
      redo,
      setSelection,
      undo,
      units,
      writeNative,
    ],
  );

  const commitTyped = useCallback(
    (ta: HTMLTextAreaElement) => {
      const text = textRef.current;
      const { anchor, focus } = selRef.current;
      const start = Math.min(anchor, focus);
      const end = Math.max(anchor, focus);
      const tail = text.slice(end);
      const value = ta.value;

      let next: string;
      let caret: number;
      if (value.endsWith(tail)) {
        const typed = value.slice(0, value.length - tail.length);
        next = text.slice(0, start) + typed + tail;
        caret = start + typed.length;
      } else if (tail.endsWith(value)) {
        next = text.slice(0, end) + value;
        caret = start;
      } else {
        writeNative(text, selRef.current);
        return;
      }

      if (next === text) {
        writeNative(text, selRef.current);
        return;
      }
      pushHistory(true);
      apply(next, caret, caret);
    },
    [apply, pushHistory, writeNative],
  );

  const handleInput = useCallback(
    (e: FormEvent<HTMLTextAreaElement>) => {
      if (!composingRef.current) commitTyped(e.currentTarget);
    },
    [commitTyped],
  );

  const copySelection = useCallback(
    (e: ClipboardEvent<HTMLTextAreaElement>, cut: boolean) => {
      const { anchor, focus } = selRef.current;
      const start = Math.min(anchor, focus);
      const end = Math.max(anchor, focus);
      if (start === end) return;
      const text = textRef.current;
      e.preventDefault();
      e.clipboardData.setData("text/plain", text.slice(start, end));
      if (cut) commit(text.slice(0, start) + text.slice(end), start, start);
    },
    [commit],
  );

  const handleCompositionStart = useCallback(() => {
    composingRef.current = true;
    pushHistory(false);
  }, [pushHistory]);

  const handleCompositionUpdate = useCallback(
    (e: CompositionEvent<HTMLTextAreaElement>) => {
      setComposing(e.data ?? "");
    },
    [],
  );

  const handleCompositionEnd = useCallback(
    (e: CompositionEvent<HTMLTextAreaElement>) => {
      composingRef.current = false;
      setComposing("");
      commitTyped(e.currentTarget);
    },
    [commitTyped],
  );

  const selStart = Math.min(selection.anchor, selection.focus);
  const selEnd = Math.max(selection.anchor, selection.focus);

  return {
    rawText,
    config,
    setConfig,
    sheet,
    units,
    caret,
    composingCaret,
    selStart,
    selEnd,
    composing,
    focused,
    canUndo: histState.canUndo,
    canRedo: histState.canRedo,
    textareaRef,
    loadText,
    setSelection,
    pickOffset: moveTo,
    undo,
    redo,
    handlers: {
      onInput: handleInput,
      onKeyDown: handleKeyDown,
      onCopy: (e: ClipboardEvent<HTMLTextAreaElement>) =>
        copySelection(e, false),
      onCut: (e: ClipboardEvent<HTMLTextAreaElement>) => copySelection(e, true),
      onCompositionStart: handleCompositionStart,
      onCompositionUpdate: handleCompositionUpdate,
      onCompositionEnd: handleCompositionEnd,
      onFocus: () => setFocused(true),
      onBlur: () => setFocused(false),
    },
  };
}

export type SheetEditor = ReturnType<typeof useSheetEditor>;
