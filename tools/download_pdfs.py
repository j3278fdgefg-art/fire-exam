# 批次下載考選部消防設備師/士歷屆試題 PDF（106-115 年）
import json
import time
import urllib.request
from pathlib import Path

BASE = "https://wwwq.moex.gov.tw/exam/wHandExamQandA_File.ashx"
OUT = Path(__file__).resolve().parent.parent / "data" / "pdf"
OUT.mkdir(parents=True, exist_ok=True)

# 年 -> 考試代碼
EXAM_CODES = {
    115: "115050", 114: "114050", 113: "113050",
    112: "112060", 111: "111060", 110: "110060",
    109: "109060", 108: "108060", 107: "107060", 106: "106060",
}

# 110-115 年：c=401/402、s=08xx；106-109 年：c=501/502、s=09xx（科目順序相同）
SHI_NAMES = ["火災學", "消防法規", "警報系統消防安全設備", "避難系統消防安全設備",
             "水系統消防安全設備", "化學系統消防安全設備"]
SHIH_NAMES = ["火災學概要", "消防法規概要", "警報與避難系統消防安全設備概要",
              "水與化學系統消防安全設備概要"]

def subjects_for(year: int) -> dict:
    base = 8 if year >= 110 else 9
    c_shi, c_shih = ("401", "402") if year >= 110 else ("501", "502")
    subs = {c_shi: {}, c_shih: {}}
    for i, name in enumerate(SHI_NAMES, start=1):
        subs[c_shi][f"{base:02d}{i:02d}"] = name
    for i, name in enumerate(SHIH_NAMES, start=7):
        subs[c_shih][f"{base:02d}{i:02d}"] = name
    return subs

def fetch(url: str) -> bytes | None:
    req = urllib.request.Request(url, headers={"User-Agent": "Mozilla/5.0"})
    try:
        with urllib.request.urlopen(req, timeout=30) as r:
            data = r.read()
        return data if data[:4] == b"%PDF" else None
    except Exception:
        return None

manifest = []
for year, code in EXAM_CODES.items():
    for c, subs in subjects_for(year).items():
        for s, name in subs.items():
            for t in ("Q", "S", "M"):
                fname = f"{year}_{c}_{s}_{t}.pdf"
                fpath = OUT / fname
                if fpath.exists():
                    manifest.append({"year": year, "c": c, "s": s, "t": t, "name": name, "file": fname})
                    continue
                url = f"{BASE}?t={t}&code={code}&c={c}&s={s}&q=1"
                data = fetch(url)
                if data:
                    fpath.write_bytes(data)
                    manifest.append({"year": year, "c": c, "s": s, "t": t, "name": name, "file": fname})
                    print(f"OK  {fname} {len(data)//1024}KB {name}")
                time.sleep(0.3)

(OUT.parent / "manifest.json").write_text(
    json.dumps(manifest, ensure_ascii=False, indent=1), encoding="utf-8"
)
print(f"\n共 {len(manifest)} 檔")
