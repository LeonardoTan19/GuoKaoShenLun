#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""申论作答登记 —— 固化「定位」步骤，原样追加一遍作答。

职责边界：
  * 本脚本负责**定位**（纯确定性）：根目录 → 试卷 typ → 记录文件 → 题块 → 遍数。
  * 不负责语义解析：年份/卷别/题号/得分/遍数请由调用方（prompt）解析后传入。

用法：
  python .github/scripts/记录答案.py -p 2016副省 -q 1 -s 12/15 -f .github/.tmp/answer.txt
  python .github/scripts/记录答案.py -p 2016副省 --list          # 只列出该卷题目
  python .github/scripts/记录答案.py -p 2012副省 -q 3 --list     # 定位预览（不改文件）

选项：
  -p/--paper   年份+卷别，如 2016副省、2022行政执法、2005
  -q/--question 题号（拆分后的连续编号，从 1 开始）
  -s/--score   得分，如 12/15、13.5/20、优秀；缺省写 “—”
  -f/--file    答案正文文件（UTF-8）
  -t/--text    答案正文（命令行直传，短答案用）
    -r/--round   遍数（默认 = 现有最大遍数 + 1）
  -d/--date    日期 YYYY-MM-DD（默认今天）
  --stem       覆盖题干（多行，直接给出已去标记的题干文本）
  --points     覆盖标题里的分值/字数，如 “15分 · 不超过200字”
  --dry-run    只打印将写入的内容，不落盘
  --list       列出该卷解析出的题目后退出
  --root       工作区根目录（默认向上查找含 题目册/ 的目录）
"""

from __future__ import annotations

import argparse
import datetime as dt
import re
import sys
from pathlib import Path
from typing import NoReturn

# ── 卷别归一化 ────────────────────────────────────────────────────────────
VARIANT_ALIASES = {
    "副省": "副省级",
    "副省级": "副省级",
    "地市": "地市级",
    "地市级": "地市级",
    "行政执法": "行政执法卷",
    "行政执法卷": "行政执法卷",
    "执法": "行政执法卷",
}

CN_NUM = "一二三四五六七八九十"
# 大题标记：一、 二. 之类
BIG_MARK = re.compile(rf"^[{CN_NUM}]+\s*[、.]\s*")
# 子题标记：(1) / （1） / 1. / 1、 ；允许前置大题标记（如 “三、(1)”）
SUB_MARK = re.compile(rf"^(?:[{CN_NUM}]+\s*[、.]\s*)?(?:[（(](\d+)[）)]|(\d+)\s*[.、])")
# 分值： （15分） (满分20分) （10.5分）
POINTS_RE = re.compile(r"[（(]\s*(?:满分\s*)?(\d+(?:\.\d+)?)\s*分\s*[）)]")


def die(msg: str) -> NoReturn:
    print(msg, file=sys.stderr)
    raise SystemExit(1)


# ── 定位：根目录 / typ / 记录文件 ─────────────────────────────────────────
def find_root(start: Path) -> Path:
    for p in [start, *start.parents]:
        if (p / "题目册").is_dir():
            return p
    die("✗ 未找到工作区根目录（向上查找应包含 题目册/ 目录）")


def normalize_paper(raw: str) -> tuple[str, str]:
    """'2016副省' -> ('2016', '副省级')；'2005' -> ('2005', '')"""
    s = raw.strip().replace(" ", "")
    m = re.match(r"^(\d{4})\s*年?\s*(.*)$", s)
    if not m:
        die(f"✗ 无法识别的年份/卷别：{raw!r}（示例：2016副省、2022行政执法、2005）")
    year, rest = m.group(1), m.group(2).strip().strip("年")
    if not rest:
        return year, ""
    variant = VARIANT_ALIASES.get(rest)
    if variant is None:
        die(f"✗ 无法识别的卷别：{rest!r}（可用：副省 / 地市 / 行政执法）")
    return year, variant


def locate_typ(root: Path, year: str, variant: str) -> Path:
    folder = root / "题目册"
    cands = sorted(p for p in folder.glob(f"{year}年*.typ") if p.name != "shenlun-template.typ")
    if not cands:
        die(f"✗ 题目册/ 中没有 {year} 年的试卷")
    if variant:
        hits = [p for p in cands if f"（{variant}）" in p.name]
    else:
        hits = [p for p in cands if "（" not in p.name]
    if not hits:
        names = "、".join(p.name for p in cands)
        die(f"✗ 未匹配到 {year}年{variant or '（不分卷）'} 的试卷；候选：{names}")
    if len(hits) > 1:
        die("✗ 匹配到多份试卷：" + "、".join(p.name for p in hits))
    return hits[0]


def read_exam_meta(typ_path: Path) -> dict[str, str]:
    text = typ_path.read_text(encoding="utf-8")
    got = {}
    for key in ("title", "subject"):
        m = re.search(rf'{key}\s*:\s*"([^"]*)"', text)
        got[key] = m.group(1) if m else ""
    return got


def record_path(root: Path, year: str, variant: str) -> Path:
    return root / "答题记录" / f"{year}年{variant}.md"


def record_header(year: str, meta: dict[str, str], typ_path: Path, root: Path) -> str:
    title = meta.get("title") or typ_path.stem
    subject = meta.get("subject") or ""
    heading = f"# {year}年{title} {subject}".rstrip()
    rel = typ_path.relative_to(root).as_posix()
    return f"{heading}\n\n> 题目册：`{rel}`\n"


# ── 定位：题干（从 typ 的 “= 作答要求” 区解析）────────────────────────────
def slice_answer_section(typ_text: str) -> str:
    lines = typ_text.splitlines()
    start = None
    for i, ln in enumerate(lines):
        if re.match(r"^=\s*作答要求\s*$", ln):
            start = i + 1
            break
    if start is None:
        die("✗ 该 typ 中未找到 `= 作答要求` 区")
    out = []
    for ln in lines[start:]:
        if re.match(r"^=\s+\S", ln):  # 下一个一级标题
            break
        out.append(ln)
    return "\n".join(out)


def split_blocks(section: str) -> list[list[str]]:
    """按空行切块，块内保留原始行。"""
    blocks, cur = [], []
    for ln in section.splitlines():
        if ln.strip():
            cur.append(ln.rstrip())
        elif cur:
            blocks.append(cur)
            cur = []
    if cur:
        blocks.append(cur)
    return blocks


def clean_text(s: str) -> str:
    s = BIG_MARK.sub("", s)
    s = SUB_MARK.sub("", s)
    s = POINTS_RE.sub("", s)
    return s.strip()


def extract_points(block: list[str]) -> str | None:
    m = POINTS_RE.search(block[0])
    if not m:
        return None
    num = m.group(1)
    return f"{num}分"


def extract_limit(blocks: list[list[str]]) -> str | None:
    text = "".join("".join(b) for b in blocks)
    m = re.search(r"不超过\s*(\d+)\s*字", text) or re.search(r"(\d+)\s*字以内", text)
    if m:
        return f"不超过{m.group(1)}字"
    m = re.search(r"(?:总)?字数\s*(\d+)\s*[～~\-—至]\s*(\d+)\s*字", text)
    if m:
        return f"{m.group(1)}～{m.group(2)}字"
    m = re.search(r"(\d+)\s*[～~\-—至]\s*(\d+)\s*字", text)
    if m:
        return f"{m.group(1)}～{m.group(2)}字"
    m = re.search(r"不少于\s*(\d+)\s*字", text)
    if m:
        return f"不少于{m.group(1)}字"
    return None


def parse_questions(typ_path: Path) -> list[dict]:
    """返回 [{'no':1,'points':'15分','limit':'不超过200字','blocks':[[...],...]}]"""
    section = slice_answer_section(typ_path.read_text(encoding="utf-8"))
    blocks = split_blocks(section)

    # 1) 先按大题标记归组
    groups: list[dict] = []
    for b in blocks:
        if BIG_MARK.match(b[0]):
            groups.append({"head": b, "rest": []})
        elif groups:
            groups[-1]["rest"].append(b)

    # 2) 组内判断拆分
    questions: list[dict] = []
    for g in groups:
        members = [g["head"], *g["rest"]]
        subs: list[list[list[str]]] = []
        for b in members:
            is_sub = bool(SUB_MARK.match(b[0]) and POINTS_RE.search(b[0]))
            if is_sub:
                subs.append([b])
            elif subs:
                subs[-1].append(b)
        if subs:
            questions.extend({"points_block": s} for s in subs)
        else:
            questions.append({"points_block": members})

    # 3) 编号 + 抽分值/字数
    for idx, q in enumerate(questions, start=1):
        q["no"] = idx
        q["points"] = extract_points(q["points_block"][0])
        q["limit"] = extract_limit(q["points_block"])
    return questions


def question_heading(q: dict, points_override: str | None) -> str:
    if points_override:
        inner = points_override
    else:
        inner = " · ".join(x for x in (q["points"], q["limit"]) if x)
    return f"## 第{q['no']}题" + (f"（{inner}）" if inner else "")


def question_quote(q: dict, stem_override: str | None) -> list[str]:
    if stem_override is not None:
        body = [ln.strip() for ln in stem_override.strip().splitlines()]
        return [f"> {ln}" if ln else ">" for ln in body]
    out = []
    for bi, block in enumerate(q["points_block"]):
        for li, ln in enumerate(block):
            text = clean_text(ln) if (bi == 0 and li == 0) else ln.strip()
            out.append(f"> {text}" if text else ">")
    return out


# ── 定位：记录文件中的题块与遍数 ──────────────────────────────────────────
Q_HEAD = re.compile(r"^##\s*第\s*(\d+)\s*题")
R_HEAD = re.compile(r"^###\s*第\s*(\d+)\s*遍")
H2 = re.compile(r"^##\s")


def read_lines(path: Path) -> tuple[list[str], str, bool]:
    if path.exists():
        with path.open(encoding="utf-8-sig", newline="") as stream:
            text = stream.read()
    else:
        text = ""
    nl = "\r\n" if "\r\n" in text else "\n"
    lines = text.split(nl)
    trailing = bool(lines) and lines[-1] == ""
    if trailing:
        lines = lines[:-1]
    return lines, nl, trailing


def find_question_span(lines: list[str], qno: int) -> tuple[int, int] | None:
    start = None
    for i, ln in enumerate(lines):
        m = Q_HEAD.match(ln)
        if m and int(m.group(1)) == qno:
            start = i
            break
    if start is None:
        return None
    end = len(lines)
    for j in range(start + 1, len(lines)):
        if H2.match(lines[j]):
            end = j
            break
    return start, end


def count_rounds(lines: list[str], span: tuple[int, int]) -> int:
    return sum(1 for ln in lines[span[0]:span[1]] if R_HEAD.match(ln))


def round_numbers(lines: list[str], span: tuple[int, int]) -> set[int]:
    return {int(match.group(1)) for line in lines[span[0]:span[1]]
            if (match := R_HEAD.match(line))}


def find_question_insert_index(lines: list[str], qno: int) -> int | None:
    """新建题块的插入位置：首个题号 > qno 的 `## 第N题` 行号；都没有则 None（追加末尾）。"""
    for i, ln in enumerate(lines):
        m = Q_HEAD.match(ln)
        if m and int(m.group(1)) > qno:
            return i
    return None


# ── 主流程 ────────────────────────────────────────────────────────────────
def main(argv: list[str] | None = None) -> int:
    ap = argparse.ArgumentParser(add_help=True, description="申论作答登记（定位固化）")
    ap.add_argument("-p", "--paper", required=True, help="年份+卷别，如 2016副省 / 2022行政执法 / 2005")
    ap.add_argument("-q", "--question", type=int, help="题号（拆分后连续编号）")
    ap.add_argument("-s", "--score", default=None, help="得分，如 12/15；缺省写 —")
    source = ap.add_mutually_exclusive_group()
    source.add_argument("-f", "--file", type=Path, help="答案正文文件（UTF-8）")
    source.add_argument("-t", "--text", default=None, help="答案正文直传")
    ap.add_argument("-r", "--round", type=int, default=None, dest="round_no", help="遍数")
    ap.add_argument("-d", "--date", default=None, help="日期 YYYY-MM-DD")
    ap.add_argument("--stem", default=None, help="覆盖题干（多行文本）")
    ap.add_argument("--points", default=None, help="覆盖标题分值/字数，如 '15分 · 不超过200字'")
    ap.add_argument("--dry-run", action="store_true", help="只打印不落盘")
    ap.add_argument("--list", action="store_true", help="列出该卷题目后退出")
    ap.add_argument("--root", type=Path, default=None, help="工作区根目录")
    args = ap.parse_args(argv)

    if args.question is not None and args.question <= 0:
        ap.error("题号必须是正整数")
    if args.round_no is not None and args.round_no <= 0:
        ap.error("遍数必须是正整数")
    if args.date is not None:
        try:
            if not re.fullmatch(r"[0-9]{4}-[0-9]{2}-[0-9]{2}", args.date):
                raise ValueError
            dt.date.fromisoformat(args.date)
        except ValueError:
            ap.error("日期必须是有效的 YYYY-MM-DD 日期")
    for name, value in (("得分", args.score), ("分值/字数", args.points)):
        if value is not None and len(value.splitlines()) > 1:
            ap.error(f"{name}必须是单行文本")

    root = args.root.resolve() if args.root else find_root(Path.cwd().resolve())
    year, variant = normalize_paper(args.paper)
    typ_path = locate_typ(root, year, variant)
    questions = parse_questions(typ_path)

    if args.list:
        rel = typ_path.relative_to(root).as_posix()
        print(f"{year}年{variant}  →  {rel}")
        for q in questions:
            head = question_heading(q, None)
            first = clean_text(q["points_block"][0][0])[:40]
            print(f"  {head}  {first}")
        print(f"记录文件：{record_path(root, year, variant).relative_to(root).as_posix()}")
        return 0

    if args.question is None:
        die("✗ 缺少 -q/--question（或用 --list 预览题目）")

    target = next((q for q in questions if q["no"] == args.question), None)
    if target is None and args.stem is None:
        nums = "、".join(str(q["no"]) for q in questions)
        die(f"✗ 该卷只解析出 {len(questions)} 题（编号 {nums}），无第 {args.question} 题；"
            f"如确有此题，请用 --stem 手动传题干")
    if target is None:
        target = {"no": args.question, "points": None, "limit": None, "points_block": []}

    # 答案正文
    if args.text is not None:
        answer = args.text
    elif args.file is not None:
        if not args.file.is_file():
            die(f"✗ 答案文件不存在：{args.file}")
        answer = args.file.read_text(encoding="utf-8-sig")
    else:
        answer = ""
    answer_lines = answer.strip("\n").splitlines() if answer.strip() else ["（未提供答案正文）"]

    date = args.date or dt.date.today().isoformat()
    score = args.score if args.score else "—"

    # 记录文件
    rec = record_path(root, year, variant)
    lines, nl, _ = read_lines(rec)
    rel_rec = rec.relative_to(root).as_posix()

    span = find_question_span(lines, args.question)
    created_question = span is None

    if created_question:
        if not lines:
            header = record_header(year, read_exam_meta(typ_path), typ_path, root)
            lines.extend(header.strip("\n").split("\n"))
            lines.append("")
        block = [question_heading(target, args.points), "", *question_quote(target, args.stem)]
        at = find_question_insert_index(lines, args.question)
        if at is None:                          # 题号最大 → 追加末尾
            if lines and lines[-1].strip():
                lines.append("")
            lines.extend(block)
            lines.append("")
        else:                                   # 插到首个更大题号的题块之前
            if at > 0 and lines[at - 1].strip():
                lines.insert(at, "")
                at += 1
            lines[at:at] = [*block, ""]
        span = find_question_span(lines, args.question)
        assert span is not None

    existing_rounds = round_numbers(lines, span)
    round_no = args.round_no if args.round_no is not None else max(existing_rounds, default=0) + 1
    if round_no <= 0:
        die("✗ 遍数必须是正整数")
    if round_no in existing_rounds:
        die(f"✗ 第{args.question}题已存在第 {round_no} 遍，请使用其他遍数")

    # 追加遍数块
    start, end = span
    insert_at = end
    while insert_at > start and lines[insert_at - 1].strip() == "":
        insert_at -= 1
    block = ["", f"### 第 {round_no} 遍 · {date} ｜ 得分：{score}", "", *answer_lines]
    lines[insert_at:insert_at] = block

    preview = nl.join(lines[insert_at:insert_at + len(block)])

    if args.dry_run:
        print(f"[dry-run] 目标：{rel_rec}")
        print(f"[dry-run] 题块：第{args.question}题" + ("（新建）" if created_question else "（已存在，追加）"))
        print(f"[dry-run] 遍数：第 {round_no} 遍 · {date} · 得分：{score}")
        print("-" * 40)
        if created_question:
            qspan = find_question_span(lines, args.question)
            assert qspan is not None
            print(nl.join(lines[qspan[0]:qspan[1]]).replace(nl, "\n"))
        else:
            print(preview.replace(nl, "\n"))
        return 0

    rec.parent.mkdir(parents=True, exist_ok=True)
    with rec.open("w", encoding="utf-8", newline="") as stream:
        stream.write(nl.join(lines) + nl)

    print(f"✅ 已记录：{rel_rec} · 第{args.question}题 · 第 {round_no} 遍 · 得分：{score}")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
