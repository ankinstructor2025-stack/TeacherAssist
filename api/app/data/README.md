# 公立小学校データ

出典：文部科学省「学校コード一覧」令和8年5月1日時点（暫定版）。2026年11月7日取得。
https://www.mext.go.jp/b_menu/toukei/mext_01087.html

元CSV：
- https://www.mext.go.jp/content/20260825-mxt_chousa01-000011635_2-1.csv
- https://www.mext.go.jp/content/20260825-mxt_chousa01-000011635_2-2.csv
- https://www.mext.go.jp/content/20260825-mxt_chousa01-000011635_4.csv

学校種B1（小学校）、設置区分2（公立）のうち、廃止日なし・廃校区分以外の18,069校を収録。
国立・私立、義務教育学校、特別支援学校は含めません。本校・分校は含みます。
市区町村は学校名の「○市立・○区立・○町立・○村立」から抽出し、それ以外は学校所在地から抽出しています。
都道府県・市区町村・学校名・学校コードを保持した加工データです。
学校一覧の更新時は、同じ条件で再抽出し件数・地域名を確認してください。

## 学校の採択情報

`textbook_adoptions.json` は栃木県「小学校用教科用図書地区採択一覧（令和6〜9年度使用）」の小山市採択地区の出版社情報を収録。2026年11月8日確認。
https://www.pref.tochigi.lg.jp/m03/education/gakkoukyouiku/shouchuu/documents/r6syogakko-kyokasyoitiran.pdf

適用対象は学校一覧に登録されている栃木県小山市の「小山市立」で始まる小学校。一般の各教科の採択であり、特別支援学級用の一般図書は対象外。
学年は各科目の使用学年に対応する。書名の網羅ではなく、学校が採択している出版社を表示するためのデータ。
更新時は公開元・適用期間・対象自治体と設置者を確認して収録し、適用期間を推測で延長しない。

## 教科書の目次

`textbook_contents.json` は、出版社の公開単元・教材一覧から教材名・単元名を収録する。本文や指導内容の転載はしない。
令和6年度版5年国語（光村図書）の公開教材一覧と、5年算数（東京書籍・上下巻）の公開単元一覧に対応。2026年11月8日確認。

- 光村図書：https://assets.mitsumura-tosho.co.jp/9117/1506/7608/06k_ichiran_05.pdf
- 東京書籍5上：https://ten.tokyo-shoseki.co.jp/tangenl/chu/10645/
- 東京書籍5下：https://ten.tokyo-shoseki.co.jp/tangenl/chu/11155/
- 東京書籍の版・単元対照確認：https://ten.tokyo-shoseki.co.jp/text/shou/sansu/data/sansu_shuisho_5.pdf

出版社・学年・科目・適用年度が一致した場合のみ表示する。公開一覧の教材名を単元選択用に整理したもので、教科書紙面の目次・ページ番号の完全な再現ではない。
