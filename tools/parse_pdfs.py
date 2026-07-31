# 解析考選部試題/答案 PDF，輸出結構化題庫 data/bank.json
import json
import re
from collections import Counter
from pathlib import Path

import pdfplumber

ROOT = Path(__file__).resolve().parent.parent
PDF_DIR = ROOT / "data" / "pdf"
MANIFEST = json.loads((ROOT / "data" / "manifest.json").read_text(encoding="utf-8"))

PUA = "[-]"
CJK_NUM = "一二三四五六七八九十"

# 科目短代號（跨年份統一 key）
SUBJECT_KEY = {
    "火災學": "fire", "火災學概要": "fire",
    "消防法規": "law", "消防法規概要": "law",
    "警報系統消防安全設備": "alarm", "避難系統消防安全設備": "escape",
    "水系統消防安全設備": "water", "化學系統消防安全設備": "chem",
    "警報與避難系統消防安全設備概要": "alarm_escape",
    "水與化學系統消防安全設備概要": "water_chem",
}

LAW_PATTERNS = [
    ("各類場所消防安全設備設置標準", "std"),
    ("消防法施行細則", "act_detail"),
    ("消防法", "act"),
    ("公共危險物品及可燃性高壓氣體", "hazmat"),
    ("消防機關辦理建築物消防安全設備審查及查驗作業基準", "review"),
    ("消防安全設備及必要檢修項目檢修基準", "inspect_std"),
    ("消防安全設備檢修及申報作業基準", "inspect"),
    ("液化石油氣", "lpg"),
    ("防火管理", "fm"),
    ("燃氣熱水器", "gas_heater"),
]


def full_text(pdf_path: Path) -> str:
    """整份 PDF 文字，過濾每頁頁首（代號/頁次），頁間以換行連接。"""
    parts = []
    with pdfplumber.open(pdf_path) as pdf:
        for page in pdf.pages:
            t = page.extract_text() or ""
            lines = []
            for ln in t.split("\n"):
                s = ln.strip()
                if re.match(r"^(代號[：:]|頁次[：:])", s):
                    continue
                lines.append(ln)
            parts.append("\n".join(lines))
    return "\n".join(parts)


def parse_answers(pdf_path: Path) -> tuple[dict, str]:
    """答案 PDF -> ({題號: 答案字串}, 備註)。"""
    ans = {}
    note = ""
    with pdfplumber.open(pdf_path) as pdf:
        for page in pdf.pages:
            t = page.extract_text() or ""
            m = re.search(r"備\s*註[：:]?\s*(.*)", t, re.S)
            if m:
                nt = re.sub(r"\s+", " ", m.group(1)).strip()
                if nt:
                    note = nt
            rows = []
            for tb in page.extract_tables():
                rows.extend(tb)
            header = None
            for row in rows:
                if not row:
                    continue
                cells = [c or "" for c in row]
                if cells[0] and "題號" in cells[0]:
                    header = [re.sub(r"\D", "", c) for c in cells[1:]]
                elif cells[0] and "答案" in cells[0] and header:
                    for no_s, a in zip(header, cells[1:]):
                        a = (a or "").strip().replace(" ", "")
                        if no_s and a:
                            ans[int(no_s)] = a
                    header = None
    return ans, note


def detect_choice_markers(text: str) -> list[str]:
    """出現次數最多的 4 個私用區碼位 = 選項標記，依碼位排序（A→D 順序遞增）。"""
    counts = Counter(re.findall(PUA, text))
    if len(counts) < 4:
        return []
    top = [c for c, _ in counts.most_common(4)]
    return sorted(top)


def find_mc_section(text: str) -> str | None:
    """回傳測驗題部分的文字，找不到則 None。"""
    m = re.search(r"[乙甲]、測驗題部分[^\n]*\n", text)
    if m:
        return text[m.end():]
    if re.search(r"單一選擇題", text):
        # 純測驗卷：從「※注意」區塊後、第 1 題開始
        m2 = re.search(r"\n1\s", text)
        if m2:
            return text[m2.start() + 1:]
    return None


def parse_mc(section: str, markers: list[str]) -> list[dict]:
    """解析測驗題：題號、題幹、四選項。"""
    if not markers:
        return []
    mk = {c: i for i, c in enumerate(markers)}
    lines = section.split("\n")
    # 題目起始行：行首為預期題號
    starts = []
    expect = 1
    for i, ln in enumerate(lines):
        m = re.match(r"^(\d{1,3})\s", ln)
        if m and int(m.group(1)) == expect:
            starts.append(i)
            expect += 1
    blocks = []
    for k, st in enumerate(starts):
        end = starts[k + 1] if k + 1 < len(starts) else len(lines)
        blk = "\n".join(lines[st:end])
        blk = re.sub(r"^\d{1,3}\s", "", blk)
        blocks.append(blk)
    out = []
    for no, blk in enumerate(blocks, start=1):
        pos = [(m.start(), mk[m.group(0)]) for m in re.finditer(PUA, blk) if m.group(0) in mk]
        if len(pos) != 4 or [p[1] for p in pos] != [0, 1, 2, 3]:
            out.append({"no": no, "stem": clean(blk), "choices": [], "bad": True})
            continue
        stem = blk[: pos[0][0]]
        chs = []
        for j in range(4):
            a = pos[j][0] + 1
            b = pos[j + 1][0] if j < 3 else len(blk)
            chs.append(clean(blk[a:b]))
        out.append({"no": no, "stem": clean(stem), "choices": chs})
    return out


def clean(s: str) -> str:
    s = re.sub(PUA, "", s)
    s = re.sub(r"[ \t]+", " ", s)
    s = re.sub(r"\n+", "\n", s)
    return s.strip()


def parse_essays(text: str) -> list[dict]:
    """解析申論題（一、二、…開頭），至下一題或測驗題部分為止。"""
    m = re.search(r"[乙甲]、測驗題部分", text)
    scope = text[: m.start()] if m else text
    lines = scope.split("\n")
    starts = []
    for i, ln in enumerate(lines):
        mm = re.match(rf"^([{CJK_NUM}]{{1,2}})、", ln.strip())
        if mm:
            starts.append((i, mm.group(1)))
    out = []
    for k, (st, num) in enumerate(starts):
        end = starts[k + 1][0] if k + 1 < len(starts) else len(lines)
        body = clean("\n".join(lines[st:end]))
        body = re.sub(rf"^[{CJK_NUM}]{{1,2}}、", "", body).strip()
        pts = None
        mp = re.search(r"[（(](\d+)\s*分[）)]", body)
        if mp:
            pts = int(mp.group(1))
        out.append({"no": num, "text": body, "points": pts})
    return out


def tag_laws(stem: str) -> list[dict]:
    tags = []
    seen = set()
    for pat, key in LAW_PATTERNS:
        if pat in stem:
            arts = re.findall(
                re.escape(pat) + r"[^。]{0,12}?第\s*(\d+)\s*條(?:之\s*(\d+))?", stem
            )
            if arts:
                for a, sub in arts:
                    art = a + ("-" + sub if sub else "")
                    if (key, art) not in seen:
                        seen.add((key, art))
                        tags.append({"law": key, "art": art})
            elif key not in {t["law"] for t in tags}:
                tags.append({"law": key})
    return tags


def main():
    # 依 (year, c, s) 分組 manifest
    groups = {}
    for e in MANIFEST:
        groups.setdefault((e["year"], e["c"], e["s"]), {})[e["t"]] = e
    questions, essays, report = [], [], []
    for (year, c, s), files in sorted(groups.items(), reverse=True):
        name = files["Q"]["name"]
        skey = SUBJECT_KEY[name]
        cls = "師" if c in ("401", "501") else "士"
        text = full_text(PDF_DIR / files["Q"]["file"])
        ans, note = ({}, "")
        if "S" in files:
            ans, note = parse_answers(PDF_DIR / files["S"]["file"])
        if "M" in files:
            m_ans, m_note = parse_answers(PDF_DIR / files["M"]["file"])
            ans.update(m_ans)
            if m_note:
                note = m_note
        # 申論
        for e in parse_essays(text):
            essays.append({
                "id": f"{year}-{cls}-{skey}-e{e['no']}", "year": year, "cls": cls,
                "subject": name, "skey": skey, **e,
            })
        # 測驗
        mc_sec = find_mc_section(text)
        n_parsed = n_bad = 0
        if mc_sec:
            markers = detect_choice_markers(mc_sec)
            qs = parse_mc(mc_sec, markers)
            for q in qs:
                n_parsed += 1
                if q.get("bad"):
                    n_bad += 1
                item = {
                    "id": f"{year}-{cls}-{skey}-{q['no']}", "year": year, "cls": cls,
                    "subject": name, "skey": skey, "no": q["no"],
                    "stem": q["stem"], "choices": q["choices"],
                    "answer": ans.get(q["no"], ""),
                    "laws": tag_laws(q["stem"]),
                }
                if q.get("bad"):
                    item["bad"] = True
                questions.append(item)
        n_ans = len(ans)
        status = "OK" if (n_parsed == n_ans and n_bad == 0) else "CHECK"
        report.append(f"{status} {year} {cls} {name}: 題目{n_parsed} 答案{n_ans} 異常{n_bad}"
                      + (f" 備註:{note[:40]}" if note else ""))

    (ROOT / "data" / "bank.json").write_text(
        json.dumps({"questions": questions, "essays": essays}, ensure_ascii=False),
        encoding="utf-8")
    print("\n".join(report))
    print(f"\n測驗題 {len(questions)} 題（異常 {sum(1 for q in questions if q.get('bad'))}）"
          f"、申論題 {len(essays)} 題")


if __name__ == "__main__":
    main()
