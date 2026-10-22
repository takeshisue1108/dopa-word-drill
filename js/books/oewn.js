// The dictionary's book (SPEC §5.3; ED D-41, D-42, D-44, D-52, D-59): the example sentences of
// Open English WordNet, as data/dict/examples.json holds them most used first, made into a book of
// the reader app's model (model.js), with the format "oewn" of its own. The drill's blank is
// chosen in these sentences as in any book's. Each example is one text block of one English
// sentence, shown and sung exactly as written; every 100 examples make a chapter 「第{n}章」.

const KEY = "oewn-2025";
const TITLE = "Open English WordNet";
const AUTHOR = "英英辞書の例文";
const EXAMPLES_PER_CHAPTER = 100;

/** The book of `rows`, the rows of examples.json: [text, lemma, part of speech, count]. */
export function dictionaryBook(rows) {
  const chapters = [];
  const blocks = rows.map(([text], index) => {
    const chapter = Math.floor(index / EXAMPLES_PER_CHAPTER);
    if (index % EXAMPLES_PER_CHAPTER === 0) {
      chapters.push({ title: `第${chapter + 1}章`, firstBlock: index });
    }

    // no reading map (the text is sung as it is written), no page and no figure (model.js)
    const sentence = { display: text, speech: text, map: null, ends: null };
    return { kind: "text", chapter, page: null, lang: "en", sentences: [sentence], figure: null };
  });

  return { key: KEY, title: TITLE, author: AUTHOR, format: "oewn", chapters, blocks, endNotes: [] };
}
