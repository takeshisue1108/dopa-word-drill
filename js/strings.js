// The strings that the scripts show to the user (SPEC §6.9; the reader app's SPEC_dopa v3 §6.10
// for the ones it had). `{name}` is filled by fill(). The page's own HTML holds its texts by
// itself, and the parsers have their own messages: some of the keys here are read by no script.

export const S = {
  site: "ドパドパWordドリル",
  selectBook: "SELECT A BOOK",
  doujin: "同人作品",
  recent: "続きから",
  bundled: "収録の本",
  fromFile: "ファイルから",
  chooseFile: "ファイルを選ぶ",
  dropHere: "ここにファイルを置く",
  forget: "一覧から消す",
  loading: "読み込み中 {n}%",
  badFormat: "この形式は読めません（.txt・.md・.pdf）",
  badEncoding: "文字コードを判別できませんでした",
  noText: "読める本文がありませんでした",
  noEnglish: "英語がないじゃないか！",
  pdfNoText: "この PDF には文字が入っていません",
  songLoading: "読み込み中",
  songFailed: "歌の素材を読み込めませんでした",
  launch: "M.E.O.W、発進！",
  shout: "{word}ミサイル！",
  next: "Enter か 発射で次へ",
  noBlank: "空欄なし。楽勝！",
  // the mark of a review (ED D-61), beside its icon
  review: "復習",
  blank: "空欄",
  sentenceOf: "文 {n}/{total}",
  // the answer field's accessible name (SPEC §6.4): {n} letters, from {first}
  blankName: "空欄（{n} 文字、{first} から）",
  done: "{title} 読了！",
  contents: "目次",
  chooseBook: "本をえらぶ",
  settings: "設定",
  speed: "速さ",
  voice: "歌",
  sfx: "効果音",
  fire: "発射",
  // the lines of the credits, under the book list and in the settings (ED PR-01): the two voices
  // and the dictionary; no accompaniment, so no line for its instruments (ED D-47)
  credits: [
    "歌声：VOICEVOX:No.7",
    "英語の歌声：Kokoro-82M（Apache-2.0）",
    "辞書：Open English WordNet（CC BY 4.0）",
  ],
  licenses: "使用ライブラリと権利表記",
  // the phone version (ED draft 3)
  answer: "答える",
  nextSentence: "次へ",
  nextReview: "次：復習",
  noChoices: "この語には選択肢がありません",
  back: "戻る",
  credits_: "クレジット",
  fontCredits: ["文字：Atkinson Hyperlegible、BIZ UDPゴシック（SIL Open Font License）"],
  melodyMode: "歌のモード",
  melodyFragments: "メロディ断片",
  melodyScore: "オケの音",
};

/** A string with its `{name}` places filled. */
export function fill(text, values = {}) {
  return text.replace(/\{(\w+)\}/g, (whole, name) => {
    if (name in values) {
      return String(values[name]);
    }

    // a place with no value stays as it is written
    return whole;
  });
}
