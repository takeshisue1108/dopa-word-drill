# ドパドパWordドリル — 使用ライブラリと権利表記

## 歌声
- VOICEVOX:No.7 — VOICEVOX および No.7 の利用規約に従って使用しています（非商用）。

## 辞書
- Open English WordNet 2025（The Open English WordNet Team）— Creative Commons Attribution 4.0 International（CC BY 4.0）。語の意味・類語・例文（data/dict/）と、Hint の選択肢の語の表（data/lookalike/）は、この辞書から作りました。原文は data/dict/LICENSE_OEWN.md。
- Princeton WordNet 3.0（Princeton University）— WordNet License。Open English WordNet はこれを元にしています。例文を「よく使われる順」に並べるのに、WordNet 3.0 の語義の使用回数（cntlist.rev）を使いました。WordNet 3.0 Copyright 2006 by Princeton University. All rights reserved. 原文は data/dict/LICENSE_WordNet-3.0.txt。

## ライブラリとフォント
- kuromoji.js — Apache License 2.0（vendor/kuromoji/LICENSE-2.0.txt）。辞書は IPADIC（NAIST の利用条件に従います。原文は vendor/kuromoji/NOTICE.md）。
- pdf.js — Apache License 2.0。
- compromise（Spencer Kelly、英語の品詞を見分けるために使用）— MIT License（vendor/compromise/LICENSE）。
- CMUdict（Carnegie Mellon University の発音辞書、Copyright (C) 1993-2015 Carnegie Mellon University）— BSD 形式のライセンス（原文は data/lang/LICENSE_cmudict.txt）。英単語の発音の表（data/lang/en_ipa.json、IPA 表記）は、この発音から作りました。
- Kokoro-82M（hexgrad）— Apache License 2.0。英語の歌声（data/sing/bank/en/）は、このモデルの声 af_heart に音の長さと高さを与えて歌わせ、子音・音節の前半・後半・母音に切り出したものです。
- g2p_en（Kyubyong Park・Jongseok Kim）— Apache License 2.0。辞書に無い英単語の発音を綴りから作るモデル（data/lang/en_g2p.bin）と、品詞で発音の変わる語の一覧（data/lang/en_homographs.json）に使っています。
- Atkinson Hyperlegible（Braille Institute of America）— SIL Open Font License 1.1（vendor/fonts/OFL_AtkinsonHyperlegible.txt）。画面の英字に使っています。
- BIZ UDPゴシック（The BIZ UDGothic Project Authors、モリサワ）— SIL Open Font License 1.1（vendor/fonts/OFL_BIZUDPGothic.txt）。画面の日本語に使っています。
