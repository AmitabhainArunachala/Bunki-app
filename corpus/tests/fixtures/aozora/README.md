# Aozora fixture files

Raw card text files (Shift_JIS, ruby edition), byte-identical as fetched from
the aozorabunko GitHub mirror at pinned commit
`109139b8844b29fc5c86caf81db5275b9eaa3386` (the `upstream_pin` in
`corpus/src/corpus/sources/aozora/PROVENANCE.yml`). All three are public
domain (作品著作権フラグ「なし」) and 新字新仮名.

| file | work | author | 作品ID | 図書カード |
|---|---|---|---|---|
| `nobara.txt` | 野ばら | 小川未明 | 051034 | https://www.aozora.gr.jp/cards/001475/card51034.html |
| `gongitsune.txt` | ごん狐 | 新美南吉 | 000628 | https://www.aozora.gr.jp/cards/000121/card628.html |
| `yamanashi.txt` | やまなし | 宮沢賢治 | 046605 | https://www.aozora.gr.jp/cards/000081/card46605.html |

Chosen for parser coverage: 野ばら has ｜-form ruby and near-total furigana
(小川未明 anchor); ごん狐 carries 傍点 and 中見出し 注記; やまなし is the
新字新仮名 edition of a 宮沢賢治 work (the 文字遣い trap author) with both
｜ ruby and 注記.
