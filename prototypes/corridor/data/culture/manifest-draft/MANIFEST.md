# Culture inventory manifest — draft

S3-R10 does not enumerate the inventory, so this draft proposes six units. MF6R reviews structure, prerequisites and coverage only. Japanese and cultural truth remain with the native reviewers at L3B.5 (X4); the sources are evidence leads, not a single cultural authority. Mnemonic units are memory aids rather than historical claims, and uncertain-etymology units keep competing explanations open.

The author family is `moonshot`. A structural verdict must come from `zhipu`, `deepseek`, or `openai`, never the author family, and must record `reviewer_family` and `model_id`. The header states the stratified-sample rule. This draft is `frozen:false`, has `freeze_date:null`, and deliberately has no manifest hash: MF6 alone freezes it under S13.8 before content fans out.

The following block is the freeze input. Its parsed value is identical to `units.json`.

```json manifest
{
  "manifest": "culture",
  "version": 1,
  "draft_date": "2026-11-07",
  "frozen": false,
  "freeze_date": null,
  "author_family": "moonshot",
  "unit_count": 6,
  "stratified_sample_rule": "MF6R's structural sample includes every topic and every evidence_status stratum: all uncertain-etymology units plus at least one attested-history and one mnemonic unit per topic when present. X4 native-review obligations remain on every unit.",
  "reviewer_provenance_fields": [
    "reviewer_family",
    "model_id"
  ],
  "reviewer_family_rule": {
    "allowed_families": [
      "zhipu",
      "deepseek",
      "openai"
    ],
    "must_differ_from_author_family": true,
    "verdict_scope": [
      "structure",
      "prerequisites",
      "coverage"
    ],
    "certifies_japanese_truth": false
  },
  "units": [
    {
      "id": "culture:unit:seasonal-calendar",
      "title": "歳時記で季語と行事を調べる",
      "outcomes": [
        "歳時記で「時雨」を調べ、季節を示す語と日常の天気の説明を区別できる。",
        "一つの季語について、資料の記述と自分の観察を比較する問いを立て、調査結果を説明できる。"
      ],
      "prerequisites": [],
      "review_obligations": [
        {
          "actor_class": "native-reviewer",
          "check": "X4: 「時雨」の季語としての説明と例文の自然さを確認し、地域や資料による差と native-true の判定を記録する。"
        },
        {
          "actor_class": "structural-reviewer",
          "check": "出典、学習成果、評価項目の対応を確認し、季節区分の史料と学習用の分類を混同していないか点検する。"
        }
      ],
      "assessments": [
        {
          "check_type": "source-comparison-and-inquiry",
          "item_ids": [
            "culture:item:seasonal-calendar:01",
            "culture:item:seasonal-calendar:02"
          ]
        }
      ],
      "evidence_status": "attested-history",
      "sources": [
        {
          "name": "KADOKAWA『日本の歳時記』",
          "citation": "「時雨」と冬の季語に関する項目"
        },
        {
          "name": "国立国会図書館デジタルコレクション",
          "citation": "歳時記・暦関係資料に掲載された季語と行事の記述"
        }
      ],
      "review_rubric_id": "culture:rubric:native-review-v1"
    },
    {
      "id": "culture:unit:new-year-cards",
      "title": "年賀状と新年のあいさつ",
      "outcomes": [
        "年賀状の「謹賀新年」と「あけましておめでとうございます」について、書きことばと話しことばの場面を比較して説明できる。",
        "年賀状を出す時期と返信する時期を史料で確認し、自分の宛先に合う新年のメッセージを作成できる。"
      ],
      "prerequisites": [
        "culture:unit:seasonal-calendar"
      ],
      "review_obligations": [
        {
          "actor_class": "native-reviewer",
          "check": "X4: 新年のあいさつの読み方、敬語、文例の自然さを確認し、家庭や地域による差を一様な規則にしていないか判定する。"
        },
        {
          "actor_class": "structural-reviewer",
          "check": "年賀状の歴史史料と現代の練習課題を区別し、前提単元と評価項目が成果を支えているか確認する。"
        }
      ],
      "assessments": [
        {
          "check_type": "register-selection-and-message-production",
          "item_ids": [
            "culture:item:new-year-cards:01",
            "culture:item:new-year-cards:02"
          ]
        }
      ],
      "evidence_status": "attested-history",
      "sources": [
        {
          "name": "郵政博物館",
          "citation": "年賀状と郵便の歴史に関する常設展示解説"
        },
        {
          "name": "国立国会図書館デジタルコレクション",
          "citation": "年賀状と年始広告に関する近代史料"
        }
      ],
      "review_rubric_id": "culture:rubric:native-review-v1"
    },
    {
      "id": "culture:unit:gift-seasons",
      "title": "お中元とお歳暮の贈答時期",
      "outcomes": [
        "お中元とお歳暮について、贈る時期、贈り先、礼状に書く内容を比較表にまとめて説明できる。",
        "地域や関係によって贈答の時期が変わる事例を資料から一つ調べ、自分が確認すべき点を提示できる。"
      ],
      "prerequisites": [
        "culture:unit:seasonal-calendar"
      ],
      "review_obligations": [
        {
          "actor_class": "native-reviewer",
          "check": "X4: 贈答に関する語の意味、礼状の自然さ、地域差と世代差を確認し、特定の習慣を全国共通とする記述を修正する。"
        },
        {
          "actor_class": "structural-reviewer",
          "check": "民俗資料の記述と学習者の比較表を照合し、評価が時期・対象・確認質問の三点を覆うか確認する。"
        }
      ],
      "assessments": [
        {
          "check_type": "comparison-table-and-contextual-inquiry",
          "item_ids": [
            "culture:item:gift-seasons:01",
            "culture:item:gift-seasons:02"
          ]
        }
      ],
      "evidence_status": "attested-history",
      "sources": [
        {
          "name": "吉川弘文館『日本民俗大辞典』",
          "citation": "「中元」と「歳暮」の項目"
        },
        {
          "name": "国立歴史民俗博物館",
          "citation": "贈答と歳時に関する展示資料の解説"
        }
      ],
      "review_rubric_id": "culture:rubric:native-review-v1"
    },
    {
      "id": "culture:unit:gift-season-mnemonic",
      "title": "「歳は年末、中は夏」で贈答時期を整理する",
      "outcomes": [
        "記憶補助「歳は年末、中は夏」を使って、お歳暮とお中元の学習用カードを正しく並べ替えて説明できる。",
        "この記憶補助が語源や全国共通の習慣を示さないことを断り、地域差を調べる問いを提示できる。"
      ],
      "prerequisites": [
        "culture:unit:gift-seasons"
      ],
      "review_obligations": [
        {
          "actor_class": "native-reviewer",
          "check": "X4: 記憶補助の日本語が自然で誤解を招かないか確認し、歴史や語源の主張として読めないことを明示する。"
        },
        {
          "actor_class": "structural-reviewer",
          "check": "記憶補助が前提単元の史料とは別の学習用具として扱われ、評価も歴史知識ではなく分類と限定説明を採点するか確認する。"
        }
      ],
      "assessments": [
        {
          "check_type": "mnemonic-use-and-evidence-boundary",
          "item_ids": [
            "culture:item:gift-season-mnemonic:01",
            "culture:item:gift-season-mnemonic:02"
          ]
        }
      ],
      "evidence_status": "mnemonic",
      "sources": [
        {
          "name": "文化庁『日本語教育の参照枠』",
          "citation": "Can-do による学習目標と振り返りの設計"
        },
        {
          "name": "吉川弘文館『日本民俗大辞典』",
          "citation": "記憶補助の対象となる「中元」と「歳暮」の基本項目"
        }
      ],
      "review_rubric_id": "culture:rubric:native-review-v1"
    },
    {
      "id": "culture:unit:teruteru-bozu-name",
      "title": "てるてる坊主の呼称と由来仮説を比較する",
      "outcomes": [
        "「てるてる坊主」の名称について、辞書と民俗資料が示す由来仮説を確定説と未確定説に分けて説明できる。",
        "由来を一つに断定せず、追加で確認すべき史料と質問を提示できる。"
      ],
      "prerequisites": [
        "culture:unit:seasonal-calendar"
      ],
      "review_obligations": [
        {
          "actor_class": "native-reviewer",
          "check": "X4: 名称の読み、語感、仮説の要約を確認し、未確定の語源を確定した由来として提示していないか判定する。"
        },
        {
          "actor_class": "structural-reviewer",
          "check": "複数の由来仮説が出典ごとに対応づけられ、評価が断定ではなく証拠の強さの区別を測るか確認する。"
        }
      ],
      "assessments": [
        {
          "check_type": "hypothesis-classification-and-source-plan",
          "item_ids": [
            "culture:item:teruteru-bozu-name:01",
            "culture:item:teruteru-bozu-name:02"
          ]
        }
      ],
      "evidence_status": "uncertain-etymology",
      "sources": [
        {
          "name": "小学館『日本国語大辞典』",
          "citation": "「てるてる坊主」の語義と語源に関する項目"
        },
        {
          "name": "吉川弘文館『日本民俗大辞典』",
          "citation": "てるてる坊主と祈雨・止雨の習俗に関する項目"
        }
      ],
      "review_rubric_id": "culture:rubric:native-review-v1"
    },
    {
      "id": "culture:unit:bowing-three-scenes",
      "title": "三場面で立ち礼を振り返る",
      "outcomes": [
        "学習用の三場面「入退室・あいさつ・深い感謝」を手がかりに、立ち礼の練習場面を選び、動作を振り返って説明できる。",
        "三場面分類を文化の一律規則ではなく練習用の記憶補助だと説明し、場面による違いを質問できる。"
      ],
      "prerequisites": [],
      "review_obligations": [
        {
          "actor_class": "native-reviewer",
          "check": "X4: 場面名、あいさつ文、動作説明の自然さを確認し、三場面分類を礼法の普遍的な権威として扱っていないか判定する。"
        },
        {
          "actor_class": "structural-reviewer",
          "check": "三場面分類が mnemonic として一貫し、史料上の礼法分類と結合されず、評価も限定説明と質問を含むか確認する。"
        }
      ],
      "assessments": [
        {
          "check_type": "scenario-recall-and-reflective-question",
          "item_ids": [
            "culture:item:bowing-three-scenes:01",
            "culture:item:bowing-three-scenes:02"
          ]
        }
      ],
      "evidence_status": "mnemonic",
      "sources": [
        {
          "name": "文化庁『日本語教育の参照枠』",
          "citation": "場面設定、Can-do、自己評価を組み合わせる学習設計"
        },
        {
          "name": "国立国語研究所『日本語教育通信』",
          "citation": "あいさつと場面に着目した日本語教育の解説記事"
        }
      ],
      "review_rubric_id": "culture:rubric:native-review-v1"
    }
  ]
}
```
