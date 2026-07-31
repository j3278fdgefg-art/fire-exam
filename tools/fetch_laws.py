# 從全國法規資料庫抓取消防法規全文，解析為逐條 JSON
import json
import re
import time
import urllib.request
from html import unescape
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent

LAWS = [
    ("act", "D0120001", "消防法"),
    ("act_detail", "D0120002", "消防法施行細則"),
    ("std", "D0120029", "各類場所消防安全設備設置標準"),
    ("hazmat", "D0120025", "公共危險物品及可燃性高壓氣體製造儲存處理場所設置標準暨安全管理辦法"),
]


def strip_tags(html: str) -> str:
    html = re.sub(r"<br\s*/?>", "\n", html, flags=re.I)
    html = re.sub(r"<[^>]+>", "", html)
    return unescape(html)


def fetch_law(pcode: str) -> list[dict]:
    url = f"https://law.moj.gov.tw/LawClass/LawAll.aspx?pcode={pcode}"
    req = urllib.request.Request(url, headers={"User-Agent": "Mozilla/5.0"})
    html = urllib.request.urlopen(req, timeout=30).read().decode("utf-8", "ignore")
    body = html.split('class="law-reg-content"', 1)[-1]
    articles = []
    chapter = ""
    # 章節標題與條文列交錯出現
    pat = re.compile(
        r'<div class="(?:h3 char-2|h3 char-3)[^"]*">(.*?)</div>'
        r'|<div class="col-no">\s*<a[^>]*>(.*?)</a>\s*</div>\s*<div class="col-data">(.*?)</div>\s*</div>',
        re.S,
    )
    for m in pat.finditer(body):
        if m.group(1) is not None:
            chapter = strip_tags(m.group(1)).strip().replace("\n", " ")
            continue
        no_raw = strip_tags(m.group(2)).strip()      # 例：第 15-2 條
        text = strip_tags(m.group(3))
        text = "\n".join(ln.strip() for ln in text.split("\n")).strip()
        mm = re.search(r"第\s*([\d-]+)\s*條", no_raw)
        if not mm:
            continue
        articles.append({"no": mm.group(1), "chapter": chapter, "text": text})
    return articles


def main():
    out = []
    for key, pcode, name in LAWS:
        arts = fetch_law(pcode)
        out.append({"key": key, "pcode": pcode, "name": name, "articles": arts})
        print(f"{name}: {len(arts)} 條")
        time.sleep(0.5)
    (ROOT / "data" / "laws.json").write_text(
        json.dumps({"laws": out}, ensure_ascii=False), encoding="utf-8")


if __name__ == "__main__":
    main()
