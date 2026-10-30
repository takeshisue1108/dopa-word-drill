// The drill's English dictionary in the browser (SPEC §5.3, §5.6, SD-05): the word files built by
// tools/build_dict.py from Open English WordNet, and its exception lists. makeDictionary is pure:
// the files are passed in once loaded, so the rules are tested with node on a dictionary written by
// hand.

// WordNet's morphy: the suffixes taken off a form, and what is put back, by part of speech
// (Princeton WordNet's morph.c). Adverbs have none.
const SUFFIX_RULES = {
  n: [
    ["s", ""],
    ["ses", "s"],
    ["xes", "x"],
    ["zes", "z"],
    ["ches", "ch"],
    ["shes", "sh"],
    ["men", "man"],
    ["ies", "y"],
  ],
  v: [
    ["s", ""],
    ["ies", "y"],
    ["es", "e"],
    ["es", ""],
    ["ed", "e"],
    ["ed", ""],
    ["ing", "e"],
    ["ing", ""],
  ],
  a: [
    ["er", ""],
    ["est", ""],
    ["er", "e"],
    ["est", "e"],
  ],
  r: [],
};
// the exception lists are filed by part of speech under these names (tools/build_dict.py)
const EXCEPTION_LIST_NAME = { n: "noun", v: "verb", a: "adj", r: "adv" };

/**
 * A dictionary over `words` ({"lemma|pos": [[definition, [synonyms], count], ...]}, the word files
 * merged) and `exceptions` ({verb|noun|adj|adv: {form: [base forms]}}). Parts of speech are
 * n, v, a and r.
 */
export function makeDictionary(words, exceptions) {
  return dictionaryOver((key) => words[key], exceptions);
}

/** The word file that holds `lemma`: words_<its first letter, a to z, in lower case>.json, or
 * words__.json when it starts with anything else (tools/build_dict.py, file_letter). */
export function fileOf(lemma) {
  const first = lemma.slice(0, 1).toLowerCase();
  const letter = first >= "a" && first <= "z" ? first : "_";
  return `words_${letter}.json`;
}

/**
 * A loader of the dictionary's files (SPEC SD-05): `fetchJson(name)` gives the content of a file
 * of data/dict. Each file is fetched once and kept. `dictionaryFor(lemmas)` fetches the word files
 * that hold `lemmas` (and the exception lists) and gives a dictionary over every file loaded so
 * far; a lemma whose file is not loaded is not found.
 */
export function createDictionaryLoader(fetchJson) {
  const fetches = new Map();
  const contents = {};
  const get = (name) => {
    if (!fetches.has(name)) {
      const fetching = fetchJson(name).then(
        (content) => (contents[name] = content),
        (error) => {
          // a failed fetch is forgotten, so that the next sentence that needs the file asks again
          fetches.delete(name);
          throw error;
        },
      );
      fetches.set(name, fetching);
    }
    return fetches.get(name);
  };

  return {
    exceptions: () => get("exceptions.json"),
    async dictionaryFor(lemmas) {
      const exceptions = await get("exceptions.json");
      const names = [...new Set(lemmas.map(fileOf))];
      await Promise.all(names.map(get));
      const find = (key) => contents[fileOf(key.slice(0, key.lastIndexOf("|")))]?.[key];
      return dictionaryOver(find, exceptions);
    },
  };
}

/** The dictionary whose word `key` ("lemma|pos") has the senses `find(key)` (undefined if none). */
function dictionaryOver(find, exceptions) {
  return {
    /** Whether `lemma` is a word of the dictionary as `pos`. */
    has(lemma, pos) {
      return find(`${lemma}|${pos}`) !== undefined;
    },
    /** The senses of `lemma` as `pos`, or [] when it has none. */
    senses(lemma, pos) {
      return find(`${lemma}|${pos}`) || [];
    },
    exceptions,
    /** The exception list of kind `pos` (n, v, a or r): {form: [base forms]}. */
    exceptionsOf(pos) {
      return exceptions[EXCEPTION_LIST_NAME[pos]];
    },
    /** The base forms of `form` as a word of kind `pos` by WordNet's morphy: the exception list,
     * then the suffix rules; only those the dictionary has, the most used first (the sum of their
     * senses' SemCor counts), so that "hoping" gives "hope" before "hop". */
    morphy(form, pos) {
      const fromExceptions = this.exceptionsOf(pos)[form] || [];
      const fromSuffixes = SUFFIX_RULES[pos]
        .filter(([suffix]) => form.endsWith(suffix) && form.length > suffix.length)
        .map(([suffix, ending]) => form.slice(0, form.length - suffix.length) + ending);
      const inDictionary = [...new Set([...fromExceptions, ...fromSuffixes])].filter((base) =>
        this.has(base, pos),
      );
      const timesUsed = (base) => this.senses(base, pos).reduce((sum, sense) => sum + sense[2], 0);
      return inDictionary.sort((one, other) => timesUsed(other) - timesUsed(one));
    },
  };
}
