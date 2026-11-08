"""Reviewed summaries of public teaching material; never fetch user-supplied URLs."""

SOURCES = [
    {"id": "minamiaizu-202603-lesson-v1", "title": "学習過程のポイントを押さえた授業案作成", "organization": "福島県教育庁南会津教育事務所", "url": "https://www.pref.fukushima.lg.jp/uploaded/attachment/739509.pdf", "location": "1ページ：課題に対する見通し・指導上の留意点", "scope": "授業づくりの共通参考（単元固有の実例ではありません）", "checked_at": "2026-11-08", "grades": [1, 2, 3, 4, 5, 6], "subject": None, "keywords": [],
     "summary": "結果の予想と、解決する方法の見通しを分けて児童の反応を考える。支援は具体的な手立てと目指す児童の姿を対応させる。理解が不十分な児童と、さらに学びを深める児童への手立てを準備する。"},
    {"id": "nier-2025-decimal-v1", "title": "令和7年度 全国学力・学習状況調査 小学校算数：小数と分数", "organization": "国立教育政策研究所", "url": "https://www.nier.go.jp/25chousakekkahoukoku/report/data/25pmath_idea_03.pdf#page=3", "location": "冊子66〜67ページ（PDF3〜4ページ）", "scope": "小数の位・共通する単位の理解（4年の内容／5年の既習事項）", "checked_at": "2026-11-08", "grades": [4, 5], "subject": "算数", "keywords": ["整数と小数", "小数", "整数のしくみ"],
     "summary": "小数の加法で、二つの数を同じ単位の幾つ分として見られない誤りが分析されている。0.01を共通の単位として数え直し、整数の計算につなげる指導が示されている。単なる位の操作と、単位の意味の理解を区別して確かめる。"},
    {"id": "nier-2025-fraction-v1", "title": "令和7年度 全国学力・学習状況調査 小学校算数：分数の加法", "organization": "国立教育政策研究所", "url": "https://www.nier.go.jp/25chousakekkahoukoku/report/data/25pmath_idea_03.pdf#page=5", "location": "冊子68〜70ページ（PDF5〜7ページ）", "scope": "5年：異分母分数の加法・共通する単位分数", "checked_at": "2026-11-08", "grades": [5], "subject": "算数", "keywords": ["分数のたし算", "分数の加法", "通分", "分数のたし算とひき算"],
     "summary": "通分の手続きは書けても、共通する単位分数とその幾つ分かを説明できない反応が分析されている。分母・分子に掛けた倍率を、単位分数の個数と混同する誤りもある。単位をそろえる必要と、それぞれの個数を言葉や図で確認する。"},
    {"id": "tochigi-202510-air-v1", "title": "令和7年度 理科の調査結果から考える指導の工夫", "organization": "栃木県教育委員会事務局 安足教育事務所", "url": "https://www.pref.tochigi.lg.jp/m57/system/desaki/desaki/documents/20250930134835.pdf#page=2", "location": "PDF2ページ：温めた空気と体積の変化", "scope": "4年：空気の温度と体積（調査は5年で実施）", "checked_at": "2026-11-08", "grades": [4], "subject": "理科", "keywords": ["温度と体積", "あたため", "温め", "ものの温度", "物の温度"],
     "summary": "温めたびんの上の硬貨が動く現象を、空気の体積変化と結び付けて説明する課題を扱う。予想には既習事項や生活経験から根拠を添える。観察した結果と、結果から考えたことを分けて記述する支援が示されている。"},
]


def question_sources(grade, subject, unit):
    # Ignore textbook title so unrelated units do not match words in its title.
    unit_name = unit.rsplit("／", 1)[-1].strip()
    return [public_source(item) for item in SOURCES if grade in item["grades"]
            and item["subject"] in (None, subject)
            and (not item["keywords"] or any(word in unit_name for word in item["keywords"]))]


def public_source(item):
    return {key: value for key, value in item.items() if key not in ("grades", "subject", "keywords")}


def resolve_source_ids(ids):
    from fastapi import HTTPException
    catalog = {item["id"]: public_source(item) for item in SOURCES}
    if any(key not in catalog for key in ids):
        raise HTTPException(422, "参考資料が変更されました。AI提案をやり直してください。")
    return [catalog[key] for key in dict.fromkeys(ids)]
