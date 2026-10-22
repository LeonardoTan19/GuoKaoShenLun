/**
 * 方格原位输入：真实数据只是一个纯字符串 + 选区偏移量，页面只挂一个跟随光标的透明 textarea
 */
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import type { CompositionEvent, FormEvent, KeyboardEvent, RefObject } from 'react';
import {
  buildUnits,
  findCaretVisualPosition,
  GAP_TYPES,
  nextStop,
  prevStop,
  rowBounds,
} from '../core/navigate';
import { clamp } from '../core/presets';
import { buildSheet } from '../core/sourcemap';
import type { Selection, StyleConfig } from '../core/types';

interface Snapshot {
  text: string;
  anchor: number;
  focus: number;
}

const HISTORY_LIMIT = 400;
const COALESCE_MS = 400;

function getAF(ta: HTMLTextAreaElement): { anchor: number; focus: number } {
  const backward = ta.selectionDirection === 'backward';
  return {
    anchor: backward ? ta.selectionEnd : ta.selectionStart,
    focus: backward ? ta.selectionStart : ta.selectionEnd,
  };
}

export function useSheetEditor(initialText: string, initialConfig: StyleConfig) {
  const [rawText, setRawText] = useState(initialText);
  const [config, setConfigState] = useState(initialConfig);
  const [selection, setSelectionState] = useState<Selection>(() => ({
    anchor: initialText.length,
    focus: initialText.length,
  }));
  const [composing, setComposing] = useState('');
  const [focused, setFocused] = useState(false);
  const [histState, setHistState] = useState({ canUndo: false, canRedo: false });

  const textareaRef: RefObject<HTMLTextAreaElement | null> = useRef(null);
  const composingRef = useRef(false);
  const skipNextInputRef = useRef(false);
  const textRef = useRef(rawText);
  const past = useRef<Snapshot[]>([]);
  const future = useRef<Snapshot[]>([]);
  const lastPushAt = useRef(0);

  useEffect(() => {
    textRef.current = rawText;
  }, [rawText]);

  const sheet = useMemo(() => buildSheet(rawText, config), [rawText, config]);
  const units = useMemo(() => buildUnits(sheet.flat), [sheet]);
  const caret = useMemo(
    () => findCaretVisualPosition(sheet.grid, selection.focus),
    [sheet, selection.focus],
  );

  const syncHistState = useCallback(() => {
    setHistState({ canUndo: past.current.length > 0, canRedo: future.current.length > 0 });
  }, []);

  const snapFromTA = useCallback((): Snapshot => {
    const ta = textareaRef.current;
    const { anchor, focus } = ta ? getAF(ta) : { anchor: 0, focus: 0 };
    return { text: textRef.current, anchor, focus };
  }, []);

  const pushHistory = useCallback((coalesce: boolean) => {
    const now = Date.now();
    if (coalesce && now - lastPushAt.current < COALESCE_MS && past.current.length > 0) {
      future.current = [];
      syncHistState();
      return;
    }
    past.current.push(snapFromTA());
    if (past.current.length > HISTORY_LIMIT) past.current.shift();
    future.current = [];
    lastPushAt.current = now;
    syncHistState();
  }, [snapFromTA, syncHistState]);

  const applySnapshot = useCallback((snap: Snapshot) => {
    const ta = textareaRef.current;
    if (ta) ta.value = snap.text;
    setRawText(snap.text);
    setSelectionState({ anchor: snap.anchor, focus: snap.focus });
    requestAnimationFrame(() => {
      const el = textareaRef.current;
      if (!el) return;
      if (document.activeElement !== el) el.focus();
      el.setSelectionRange(snap.anchor, snap.focus);
    });
  }, []);

  const commit = useCallback(
    (text: string, anchor: number, focus: number, coalesce = false) => {
      pushHistory(coalesce);
      applySnapshot({
        text,
        anchor: clamp(anchor, 0, text.length),
        focus: clamp(focus, 0, text.length),
      });
    },
    [applySnapshot, pushHistory],
  );

  const setSelection = useCallback((anchor: number, focus: number) => {
    const len = textRef.current.length;
    const a = clamp(anchor, 0, len);
    const f = clamp(focus, 0, len);
    const ta = textareaRef.current;
    if (ta) {
      if (document.activeElement !== ta) ta.focus();
      ta.setSelectionRange(Math.min(a, f), Math.max(a, f), a <= f ? 'forward' : 'backward');
    }
    setSelectionState({ anchor: a, focus: f });
  }, []);

  const setConfig = useCallback((updater: (c: StyleConfig) => StyleConfig) => {
    setConfigState((c) => updater(c));
  }, []);

  /** 载入新全文 */
  const loadText = useCallback(
    (text: string) => {
      commit(text, text.length, text.length);
    },
    [commit],
  );

  const undo = useCallback(() => {
    const snap = past.current.pop();
    if (!snap) return;
    future.current.push(snapFromTA());
    lastPushAt.current = 0;
    syncHistState();
    applySnapshot(snap);
  }, [applySnapshot, snapFromTA, syncHistState]);

  const redo = useCallback(() => {
    const snap = future.current.pop();
    if (!snap) return;
    past.current.push(snapFromTA());
    lastPushAt.current = 0;
    syncHistState();
    applySnapshot(snap);
  }, [applySnapshot, snapFromTA, syncHistState]);

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
        offset = caret.placement === 'right' ? row[idx].rawEnd : row[idx].rawStart;
      } else {
        offset = row[idx].rawEnd;
      }

      const ta = textareaRef.current;
      const anchor = extend && ta ? getAF(ta).anchor : offset;
      setSelection(anchor, offset);
    },
    [caret, setSelection, sheet.grid],
  );

  const goRowEdge = useCallback(
    (side: 'start' | 'end', extend: boolean) => {
      const row = sheet.grid[caret.row];
      if (!row) return;
      const b = rowBounds(row);
      const offset = side === 'start' ? b.start : b.end;
      const ta = textareaRef.current;
      const anchor = extend && ta ? getAF(ta).anchor : offset;
      setSelection(anchor, offset);
    },
    [caret.row, setSelection, sheet.grid],
  );

  const pickOffset = useCallback(
    (offset: number, extend: boolean) => {
      if (extend) {
        const ta = textareaRef.current;
        const anchor = ta ? getAF(ta).anchor : offset;
        setSelection(anchor, offset);
        return;
      }
      setSelection(offset, offset);
    },
    [setSelection],
  );

  const handleKeyDown = useCallback(
    (e: KeyboardEvent<HTMLTextAreaElement>) => {
      if (composingRef.current || e.nativeEvent.isComposing) return;

      const ta = e.currentTarget;
      const s = Math.min(ta.selectionStart, ta.selectionEnd);
      const en = Math.max(ta.selectionStart, ta.selectionEnd);
      const len = textRef.current.length;
      const text = textRef.current;
      const mod = e.ctrlKey || e.metaKey;
      const extend = e.shiftKey;

      if (mod && !e.altKey) {
        const k = e.key.toLowerCase();
        if (k === 'a') {
          e.preventDefault();
          setSelection(0, len);
          return;
        }
        if (k === 'z') {
          e.preventDefault();
          if (extend) redo();
          else undo();
          return;
        }
        if (k === 'y') {
          e.preventDefault();
          redo();
          return;
        }
        return;
      }

      switch (e.key) {
        case 'ArrowLeft': {
          e.preventDefault();
          if (extend) {
            const { anchor, focus } = getAF(ta);
            setSelection(anchor, prevStop(units, focus));
          } else {
            const t = s !== en ? s : prevStop(units, s);
            setSelection(t, t);
          }
          return;
        }
        case 'ArrowRight': {
          e.preventDefault();
          if (extend) {
            const { anchor, focus } = getAF(ta);
            setSelection(anchor, nextStop(units, focus, len));
          } else {
            const t = s !== en ? en : nextStop(units, s, len);
            setSelection(t, t);
          }
          return;
        }
        case 'ArrowUp':
          e.preventDefault();
          moveVertical(-1, extend);
          return;
        case 'ArrowDown':
          e.preventDefault();
          moveVertical(1, extend);
          return;
        case 'Home':
          e.preventDefault();
          goRowEdge('start', extend);
          return;
        case 'End':
          e.preventDefault();
          goRowEdge('end', extend);
          return;
        case 'Backspace': {
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
        case 'Delete': {
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
    [commit, goRowEdge, moveVertical, redo, setSelection, undo, units],
  );

  const handleInput = useCallback(
    (e: FormEvent<HTMLTextAreaElement>) => {
      const ta = e.currentTarget;
      if (composingRef.current) return;
      if (skipNextInputRef.current) {
        skipNextInputRef.current = false;
        if (ta.value === textRef.current) return;
        setRawText(ta.value);
        setSelectionState({ anchor: ta.selectionStart, focus: ta.selectionEnd });
        return;
      }
      pushHistory(true);
      setRawText(ta.value);
      setSelectionState({ anchor: ta.selectionStart, focus: ta.selectionEnd });
    },
    [pushHistory],
  );

  const handleSelect = useCallback(() => {
    const ta = textareaRef.current;
    if (!ta || composingRef.current) return;
    setSelectionState(getAF(ta));
  }, []);

  const handleCompositionStart = useCallback(() => {
    composingRef.current = true;
    pushHistory(false);
  }, [pushHistory]);

  const handleCompositionUpdate = useCallback((e: CompositionEvent<HTMLTextAreaElement>) => {
    setComposing(e.data ?? '');
  }, []);

  const handleCompositionEnd = useCallback((e: CompositionEvent<HTMLTextAreaElement>) => {
    composingRef.current = false;
    skipNextInputRef.current = true;
    setComposing('');
    const ta = e.currentTarget;
    setRawText(ta.value);
    setSelectionState({ anchor: ta.selectionStart, focus: ta.selectionEnd });
  }, []);

  const selStart = Math.min(selection.anchor, selection.focus);
  const selEnd = Math.max(selection.anchor, selection.focus);

  return {
    rawText,
    config,
    setConfig,
    sheet,
    units,
    caret,
    selStart,
    selEnd,
    composing,
    focused,
    canUndo: histState.canUndo,
    canRedo: histState.canRedo,
    textareaRef,
    loadText,
    setSelection,
    pickOffset,
    undo,
    redo,
    handlers: {
      onInput: handleInput,
      onKeyDown: handleKeyDown,
      onSelect: handleSelect,
      onCompositionStart: handleCompositionStart,
      onCompositionUpdate: handleCompositionUpdate,
      onCompositionEnd: handleCompositionEnd,
      onFocus: () => setFocused(true),
      onBlur: () => setFocused(false),
    },
  };
}

export type SheetEditor = ReturnType<typeof useSheetEditor>;
