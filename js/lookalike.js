// The choices of the hint (SPEC 2.0 §2.0.3; ED D-70, D-72 to D-74): the answer and 3 words of the
// same kind of form, the same length and the same first letter, at random, from the look-alike
// index (tools/build_lookalike.py). The page loads one letter's file of the index at a time.

// the kind of form of each form line of the meaning area (lang/blanks.js, formLineOf)
const KINDS = {
  noun: "n",
  "noun, plural": "ns",
  "verb, base form": "v",
  "verb, -s form (he, she, it)": "vs",
  "verb, -ing form": "ving",
  "verb, past tense": "ved",
  "verb, past participle": "ved",
  adjective: "a",
  "adjective, comparative (-er)": "aer",
  "adjective, superlative (-est)": "aest",
  adverb: "r",
  "adverb, comparative (-er)": "rer",
  "adverb, superlative (-est)": "rest",
};

const CHOICES = 4;

/** The kind of form named by a meaning area's form line, or null. */
export function kindOf(formLine) {
  return KINDS[formLine] || null;
}

/** The synonyms shown in the meaning area's `lines` (the words in brackets after each sense), in
 * lower case. */
export function synonymsIn(lines) {
  const shown = new Set();
  for (const line of lines.slice(1)) {
    const brackets = line.match(/\(([^()]*)\)$/);
    for (const synonym of brackets ? brackets[1].split(", ") : []) {
      shown.add(synonym.toLowerCase());
    }
  }
  return shown;
}

/**
 * The choices for a blank: { word (as written in the sentence), base, meaning (the meaning area's
 * lines, the form line first) }, from `letter`, the index's file of the word's first letter.
 * Returns the words to show, shuffled by `random`: the answer and up to 3 others; an empty list
 * when there is no other (D-74).
 */
export function choicesFrom(blank, letter, random) {
  const answer = blank.word.toLowerCase();
  const kind = kindOf(blank.meaning[0]);
  const lengths = (kind && letter[kind]) || {};
  const shown = synonymsIn(blank.meaning);
  const usable = (entry) => {
    const [word, base = word] = entry.split(":");
    return word !== answer && base !== blank.base && !shown.has(word) && !shown.has(base);
  };
  const others = [];
  const take = (entries) => {
    const pool = entries.filter(usable).map((entry) => entry.split(":")[0]);
    while (others.length < CHOICES - 1 && pool.length > 0) {
      const [word] = pool.splice(Math.floor(random() * pool.length), 1);
      if (!others.includes(word)) {
        others.push(word);
      }
    }
  };
  take(lengths[answer.length] || []);
  if (others.length < CHOICES - 1) {
    take([...(lengths[answer.length - 1] || []), ...(lengths[answer.length + 1] || [])]);
  }
  if (others.length === 0) {
    return [];
  }
  return shuffle([blank.word, ...others.map((word) => matchCase(word, blank.word))], random);
}

/** The choices for `blank` with the index loaded by `load(letter)` (a promise of its file). */
export async function choicesFor(blank, load, random) {
  const first = blank.word[0].toLowerCase();
  if (!/[a-z]/.test(first)) {
    return [];
  }
  return choicesFrom(blank, await load(first), random);
}

/** A word written with a capital first letter when the answer has one (a sentence's first word). */
function matchCase(word, model) {
  return model[0] === model[0].toUpperCase() ? word[0].toUpperCase() + word.slice(1) : word;
}

function shuffle(list, random) {
  const out = [...list];
  for (let i = out.length - 1; i > 0; i--) {
    const j = Math.floor(random() * (i + 1));
    [out[i], out[j]] = [out[j], out[i]];
  }
  return out;
}
