#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""申论试卷编译 —— 把 题目册/*.typ 批量编译为 PDF题目册/*.pdf。

职责边界：
  * 本脚本只负责**编译调度**（找根目录 → 选卷 → 调 typst → 汇总裁决）。
  * 不修改任何 .typ 内容；不解析题目语义（那是 记录答案.py 的事）。

用法：
  python .github/scripts/编译试卷.py                     # 编译全部
  python .github/scripts/编译试卷.py -p 2016副省         # 只编译匹配的卷
  python .github/scripts/编译试卷.py -p 2015 -p 2025     # 多卷（可重复 -p）
  python .github/scripts/编译试卷.py --watch             # 监视改动并自动重编
  python .github/scripts/编译试卷.py --list              # 只列出匹配到的试卷
  python .github/scripts/编译试卷.py --dry-run           # 只打印将执行的命令
  python .github/scripts/编译试卷.py --clean -p 2025     # 先删旧产物再编

选项：
  -p/--paper   年份+卷别（可重复），如 2016副省 / 2022行政执法 / 2005；缺省=全部
  -o/--output  输出目录（默认：工作区/PDF题目册）
  -j/--jobs    并行数（默认 CPU 核数，上限 8）
  --format     输出格式 pdf|png|svg（默认 pdf；png/svg 分页，形如 xxx-1.png）
  --ppi        PNG 分辨率（仅 --format png，默认 144）
  --watch      监视 题目册/ 改动并自动重编（Ctrl+C 退出）
  --clean      编译前删除对应输出文件
  --list       列出匹配到的试卷后退出
  --dry-run    只打印命令，不实际编译、不写文件
  -q/--quiet   静默模式（仅打印汇总与失败详情）
  --root       工作区根目录（默认向上查找含 题目册/ 的目录）
  --typst      typst 可执行文件（默认从 PATH 查找）
  --extra      透传给 typst 的额外参数（可重复，如 --extra --font-path --extra fonts）

退出码：0=全部成功；1=有编译失败；2=用法/环境错误。
"""

from __future__ import annotations

import argparse
import os
import re
import shutil
import subprocess
import sys
import threading
import time
from concurrent.futures import ThreadPoolExecutor, as_completed
from pathlib import Path
from typing import NoReturn

# ── 卷别归一化（与 记录答案.py 保持一致）────────────────────────────────────
VARIANT_ALIASES = {
    "副省": "副省级",
    "副省级": "副省级",
    "地市": "地市级",
    "地市级": "地市级",
    "行政执法": "行政执法卷",
    "行政执法卷": "行政执法卷",
    "执法": "行政执法卷",
}

TEMPLATE_NAME = "shenlun-template.typ"
PAPER_DIR = "题目册"
DEFAULT_OUT = "PDF题目册"

_print_lock = threading.Lock()


def die(msg: str) -> NoReturn:
    print(msg, file=sys.stderr)
    raise SystemExit(2)


def say(*args, quiet: bool = False, **kw) -> None:
    if quiet:
        return
    with _print_lock:
        print(*args, **kw)


# ── 定位：根目录 / typ / typst ─────────────────────────────────────────────
def find_root(start: Path) -> Path:
    for p in [start, *start.parents]:
        if (p / PAPER_DIR).is_dir():
            return p
    die("✗ 未找到工作区根目录（向上查找应包含 题目册/ 目录）")


def find_typst(explicit: str | None) -> str:
    if explicit:
        if Path(explicit).exists() or shutil.which(explicit):
            return explicit
        die(f"✗ 指定的 typst 不存在：{explicit}")
    found = shutil.which("typst")
    if not found:
        die(
            "✗ 未找到 typst。请先安装并加入 PATH：\n"
            "    winget install --id Typst.Typst\n"
            "  或显式指定：--typst <path-to-typst.exe>"
        )
    return found


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
    if not variant:
        die(f"✗ 未知卷别：{rest!r}（可用：副省/地市/行政执法）")
    return year, variant


def select_papers(paper_dir: Path, patterns: list[str]) -> list[Path]:
    """按 --paper 选择 typ 文件（排除模板）。patterns 为空则返回全部。"""
    all_typ = sorted(
        (f for f in paper_dir.glob("*.typ") if f.name != TEMPLATE_NAME),
        key=lambda p: p.name,
    )
    if not patterns:
        return all_typ

    picks: list[Path] = []
    for raw in patterns:
        year, variant = normalize_paper(raw)
        hit = [f for f in all_typ if f.name.startswith(f"{year}年")]
        if variant:
            hit = [f for f in hit if variant in f.name]
        if not hit:
            die(f"✗ 未匹配到试卷：{raw}（年份 {year}，卷别 {variant or '不分卷'}）")
        picks.extend(hit)
    # 去重且保持排序
    return sorted(set(picks), key=lambda p: p.name)


# ── 输出路径 ──────────────────────────────────────────────────────────────
def output_target(stem: str, out_dir: Path, fmt: str) -> str:
    """返回传给 typst 的输出参数；png/svg 用 {p} 占位分页。"""
    if fmt == "pdf":
        return str(out_dir / f"{stem}.pdf")
    return str(out_dir / f"{stem}-{{p}}.{fmt}")


def output_glob(stem: str, out_dir: Path, fmt: str) -> list[Path]:
    return sorted(out_dir.glob(f"{stem}*.{fmt}"))


# ── 编译 ──────────────────────────────────────────────────────────────────
def compile_one(
    typst: str,
    src: Path,
    dst_pattern: str,
    fmt: str,
    ppi: int,
    extra: list[str],
    cwd: Path,
) -> tuple[bool, str]:
    cmd = [typst, "compile", "--format", fmt]
    if fmt == "png":
        cmd += ["--ppi", str(ppi)]
    cmd += list(extra)
    cmd += [str(src), dst_pattern]

    proc = subprocess.run(
        cmd,
        cwd=str(cwd),
        capture_output=True,
        text=True,
        encoding="utf-8",
        errors="replace",
    )
    if proc.returncode == 0:
        return True, ""
    return False, (proc.stderr or proc.stdout or "").strip()


def run_batch(
    typst: str,
    papers: list[Path],
    out_dir: Path,
    fmt: str,
    ppi: int,
    extra: list[str],
    jobs: int,
    quiet: bool,
    dry_run: bool,
    cwd: Path,
) -> int:
    """编译一批试卷，返回失败数。"""
    out_dir.mkdir(parents=True, exist_ok=True)

    # 预生成 (源, 输出) 清单
    plan = [(src, output_target(src.stem, out_dir, fmt)) for src in papers]

    if dry_run:
        for src, dst in plan:
            say(f"typst compile --format {fmt} {src.name} → {Path(dst).name}", quiet=quiet)
        say(f"[dry-run] 共 {len(plan)} 份，未编译。", quiet=False)
        return 0

    ok, failures = 0, []
    t0 = time.perf_counter()

    def work(item):
        src, dst = item
        success, err = compile_one(typst, src, dst, fmt, ppi, extra, cwd)
        return src, success, err

    workers = max(1, min(jobs, 8))
    with ThreadPoolExecutor(max_workers=workers) as pool:
        futures = {pool.submit(work, it): it for it in plan}
        for fut in as_completed(futures):
            src, success, err = fut.result()
            if success:
                ok += 1
                say(f"  ✓ {src.stem}", quiet=quiet)
            else:
                failures.append((src, err))
                say(f"  ✗ {src.stem}", quiet=quiet)

    dt = time.perf_counter() - t0
    for src, err in failures:
        with _print_lock:
            print(f"\n── 失败：{src.name} ──")
            print(err if err else "(无错误输出)")

    say(
        f"\n=== 成功 {ok} / 失败 {len(failures)} / 共 {len(plan)} 份"
        f"（{dt:.2f}s，并行 {workers}）→ {out_dir} ===",
        quiet=False,
    )
    return len(failures)


def clean_outputs(papers: list[Path], out_dir: Path, fmt: str, quiet: bool) -> None:
    for src in papers:
        for f in output_glob(src.stem, out_dir, fmt):
            f.unlink()
            say(f"  ⌫ 删除 {f.name}", quiet=quiet)


# ── 监视模式 ──────────────────────────────────────────────────────────────
def watch_loop(
    typst: str,
    paper_dir: Path,
    out_dir: Path,
    fmt: str,
    ppi: int,
    extra: list[str],
    jobs: int,
    quiet: bool,
    cwd: Path,
) -> int:
    template = paper_dir / TEMPLATE_NAME
    say(f"👀 监视 {paper_dir} …（Ctrl+C 退出）", quiet=False)

    def snapshot() -> dict[Path, float]:
        snap = {}
        for f in paper_dir.glob("*.typ"):
            try:
                snap[f] = f.stat().st_mtime
            except OSError:
                pass
        return snap

    def mtime(p: Path) -> float:
        try:
            return p.stat().st_mtime
        except OSError:
            return -1.0

    prev = snapshot()
    prev_tpl = mtime(template)

    try:
        while True:
            time.sleep(0.4)
            cur = snapshot()
            cur_tpl = mtime(template)

            added = [f for f in cur if f not in prev]
            changed = [f for f in cur if f in prev and cur[f] != prev[f]]
            tpl_changed = cur_tpl != prev_tpl
            prev, prev_tpl = cur, cur_tpl

            if tpl_changed:
                targets = [f for f in cur if f.name != TEMPLATE_NAME]
                say("\n🔁 模板已更新，重编全部 …", quiet=False)
            else:
                targets = [f for f in (added + changed) if f.name != TEMPLATE_NAME]
                if targets:
                    say(f"\n🔁 检测到改动：{', '.join(f.stem for f in targets)}", quiet=False)
                else:
                    continue

            run_batch(
                typst, targets, out_dir, fmt, ppi, extra, jobs, quiet, False, cwd
            )
    except KeyboardInterrupt:
        say("\n👋 已退出监视。", quiet=False)
        return 0


# ── 主入口 ────────────────────────────────────────────────────────────────
def build_parser() -> argparse.ArgumentParser:
    ap = argparse.ArgumentParser(
        prog="编译试卷.py",
        description="批量编译 题目册/*.typ → PDF题目册/*.pdf",
        formatter_class=argparse.RawDescriptionHelpFormatter,
    )
    ap.add_argument("-p", "--paper", action="append", default=[],
                    help="年份+卷别（可重复），如 2016副省；缺省=全部")
    ap.add_argument("-o", "--output", default=None, help="输出目录（默认 工作区/PDF题目册）")
    ap.add_argument("-j", "--jobs", type=int, default=os.cpu_count() or 4, help="并行数")
    ap.add_argument("--format", choices=["pdf", "png", "svg"], default="pdf", help="输出格式")
    ap.add_argument("--ppi", type=int, default=144, help="PNG 分辨率（仅 --format png）")
    ap.add_argument("--watch", action="store_true", help="监视改动并自动重编")
    ap.add_argument("--clean", action="store_true", help="编译前删除对应输出文件")
    ap.add_argument("--list", action="store_true", help="只列出匹配到的试卷")
    ap.add_argument("--dry-run", action="store_true", help="只打印命令，不编译")
    ap.add_argument("-q", "--quiet", action="store_true", help="静默模式")
    ap.add_argument("--root", default=None, help="工作区根目录")
    ap.add_argument("--typst", default=None, help="typst 可执行文件")
    ap.add_argument("--extra", action="append", default=[],
                    help="透传给 typst 的额外参数（可重复）")
    return ap


def main(argv: list[str] | None = None) -> int:
    # Windows 控制台尽量用 UTF-8，避免中文/符号乱码
    for stream in (sys.stdout, sys.stderr):
        try:
            stream.reconfigure(encoding="utf-8")  # type: ignore[union-attr]
        except (AttributeError, ValueError):
            pass

    ap = build_parser()
    args = ap.parse_args(argv)

    root = Path(args.root).resolve() if args.root else find_root(Path.cwd().resolve())
    paper_dir = root / PAPER_DIR
    out_dir = Path(args.output).resolve() if args.output else root / DEFAULT_OUT
    cwd = paper_dir  # 以 题目册/ 为工作目录，保证 import "shenlun-template.typ" 可解析

    papers = select_papers(paper_dir, args.paper)

    if args.list:
        for f in papers:
            print(f.name)
        print(f"\n共 {len(papers)} 份。（输出目录：{out_dir}）")
        return 0

    if not papers:
        die("✗ 没有可编译的试卷")

    typst = find_typst(args.typst)

    if args.clean and not args.dry_run:
        clean_outputs(papers, out_dir, args.format, args.quiet)

    if args.watch:
        # 监视模式下首轮先全量编译，之后增量
        run_batch(typst, papers, out_dir, args.format, args.ppi, args.extra,
                  args.jobs, args.quiet, args.dry_run, cwd)
        return watch_loop(typst, paper_dir, out_dir, args.format, args.ppi,
                          args.extra, args.jobs, args.quiet, cwd)

    fails = run_batch(typst, papers, out_dir, args.format, args.ppi, args.extra,
                      args.jobs, args.quiet, args.dry_run, cwd)
    return 1 if fails else 0


if __name__ == "__main__":
    raise SystemExit(main())
