import { isEnglishSentence } from "./analyze.js";

// The words of an English sentence that can be the blank (SPEC §5.5; ED D-02, D-03, D-26), with
// their base forms (SPEC §5.6; ED D-23), their form lines and their meanings. compromise (the
// English part-of-speech tagger, 14.17.0) and the dictionary are passed in, so the rules are tested
// with node. "kind" in the comments and `pos` in the code are the same thing: n, v, a or r.

// compromise's tags of the four kinds of word a blank can be, and the dictionary's part of speech
// of each, in the order a word with several tags is looked up (SPEC §5.5)
const KINDS = [
  ["Noun", "n"],
  ["Verb", "v"],
  ["Adjective", "a"],
  ["Adverb", "r"],
];

// compromise's tags that keep a word from being the blank however else it is tagged (SPEC §5.5;
// ED D-03, D-26). Value is a number ("three", "3d"); Expression an interjection ("oh"); Copula a
// form of be; Possessive "her", "John's". Particle is the second word of a phrasal verb: in "ran
// away", compromise tags "away" both Verb and Particle, and as a Verb it would otherwise be looked
// up. Hyphenated: compromise cuts "mother-in-law" into three words and tags each Hyphenated; a
// word with a hyphen is never the blank, and neither are its parts.
const EXCLUDED_TAGS = [
  "Pronoun",
  "Preposition",
  "Determiner",
  "Conjunction",
  "Auxiliary",
  "Modal",
  "Copula",
  "Value",
  "ProperNoun",
  "Expression",
  "Possessive",
  "Particle",
  "Hyphenated",
];

// a word the blank can be is written in the letters a to z alone: no hyphen, apostrophe, digit or
// accent (ED D-26)
const LETTERS_ONLY = /^[A-Za-z]+$/;

// every form of have and be: a past tense after one of them is a past participle (formLineOf)
const HAVE_OR_BE = new Set("be am is are was were been being have has had having".split(" "));
// every form of be, have and do: never the blank, as a main verb either (ED D-26). compromise gives
// the copula the root "is", a main-verb "have" no root, and may tag "done" as an adjective, so the
// word and its root are both looked for (entryOf).
const BE_HAVE_DO = new Set([...HAVE_OR_BE, ..."do does did done doing".split(" ")]);

/**
 * The words of `speech` as compromise tags them: [{ start, end, text, tags, root }], `start` and
 * `end` being the word's place in `speech`, `root` compromise's base form or "" when it gives
 * none (it gives none for a word that is already a base form). A term of no length is left out.
 */
export function wordsOf(nlp, speech) {
  const tagged = nlp(speech);
  tagged.compute("root");
  const terms = tagged.json({ offset: true }).flatMap((sentence) => sentence.terms);

  return terms
    .filter((term) => term.offset.length > 0)
    .map((term) => {
      const start = term.offset.start;
      const end = start + term.offset.length;
      return { start, end, text: speech.slice(start, end), tags: term.tags, root: term.root || "" };
    });
}

/** The candidates among `words` (from wordsOf): [{ start, end, text, pos, base, formLine }]. */
export function candidatesOf(words, dictionary) {
  const candidates = [];
  words.forEach((word, index) => {
    const entry = entryOf(word, dictionary);
    if (entry) {
      const formLine = formLineOf(word, entry, words.slice(Math.max(0, index - 3), index));
      candidates.push({ start: word.start, end: word.end, text: word.text, ...entry, formLine });
    }
  });
  return candidates;
}

/**
 * The first line of the meaning area: the kind of word and its form (SPEC §5.6 table; ED D-13),
 * from compromise's tags. `before` is up to three words before it: a past tense whose nearest verb
 * among them is a form of have or be ("would have opened") is a past participle, since compromise
 * tags it PastTense. compromise gives no tag for the third person, so an -s form is a present
 * tense written otherwise than its base form and ending in s.
 */
function formLineOf(word, { pos, base }, before) {
  const has = (tag) => word.tags.includes(tag);
  const text = word.text.toLowerCase();
  if (pos === "n") {
    return has("Plural") ? "noun, plural" : "noun";
  }
  if (pos === "v") {
    if (has("Gerund")) {
      return "verb, -ing form";
    }
    if (has("Participle") || (has("PastTense") && afterHaveOrBe(before))) {
      return "verb, past participle";
    }
    if (has("PastTense")) {
      return "verb, past tense";
    }
    if (has("PresentTense") && text !== base && text.endsWith("s")) {
      return "verb, -s form (he, she, it)";
    }
    return "verb, base form";
  }
  const kind = pos === "a" ? "adjective" : "adverb";
  // a comparative or a superlative is never written as its base form; compromise tags some base
  // forms Comparative all the same ("rich", seen in the drill)
  if (text === base) {
    return kind;
  }
  if (has("Comparative")) {
    return `${kind}, comparative (-er)`;
  }
  if (has("Superlative")) {
    return `${kind}, superlative (-est)`;
  }
  return kind;
}

/** Whether the nearest verb among `before` is a form of have or be with no pronoun after it: a
 * pronoun between them is the subject of a new clause ("it was what we wanted"), so the verb is a
 * past tense; a possessive one is not ("to have his slave made"). Tried against the 450 sentences
 * of the record "blanks": passing over adverbs only, instead, read 11 of 14 changed cases wrong
 * ("have not, however, found"). */
function afterHaveOrBe(before) {
  const verbAt = before.findLastIndex((word) => word.tags.includes("Verb"));
  if (verbAt === -1 || !HAVE_OR_BE.has(before[verbAt].text.toLowerCase())) {
    return false;
  }
  const isSubject = (word) => word.tags.includes("Pronoun") && !word.tags.includes("Possessive");
  return !before.slice(verbAt + 1).some(isSubject);
}

/** { pos, base } of the dictionary's word that `word` is a form of, or null when `word` cannot be
 * the blank: an excluded tag, a form of be, have or do, a letter other than a to z, no kind of word
 * that a blank can be, or no such word in the dictionary. A word with several kinds takes the first
 * found, in the order of KINDS. */
function entryOf(word, dictionary) {
  if (EXCLUDED_TAGS.some((tag) => word.tags.includes(tag))) {
    return null;
  }
  if (BE_HAVE_DO.has(word.text.toLowerCase()) || BE_HAVE_DO.has(word.root.toLowerCase())) {
    return null;
  }
  if (!LETTERS_ONLY.test(word.text)) {
    return null;
  }
  for (const [tag, pos] of KINDS) {
    if (!word.tags.includes(tag)) {
      continue;
    }
    const base = baseOf(word, pos, dictionary);
    if (base) {
      return { pos, base };
    }
  }
  return null;
}

/** The base form of `word` as a word of kind `pos` that the dictionary has, or undefined. */
function baseOf(word, pos, dictionary) {
  // Step 1 of SPEC §5.6: compromise's root, then the word itself. Step 2: the first of those that
  // the dictionary has. For an adverb the word itself comes first, since
  // compromise gives an adverb the root of its adjective ("quickly" → "quick"), and the dictionary
  // has some of those as adverbs too ("come quick"), which would take the place of "quickly"
  // (SPEC §5.6)
  const order = pos === "r" ? [word.text, word.root] : [word.root, word.text];
  const forms = order.filter(Boolean).map((form) => form.toLowerCase());
  const found = forms.find((form) => dictionary.has(form, pos));
  if (found) {
    return found;
  }
  // steps 3 and 4: WordNet's morphy on the word itself, the most used base first
  return dictionary.morphy(word.text.toLowerCase(), pos)[0];
}

const MAX_SENSES_SHOWN = 3;
const MAX_SYNONYMS_SHOWN = 3;
const HIDDEN = "___";

/**
 * The lines of the meaning area for `blank` (a candidate): its form line, then up to three senses
 * "{n}. {definition} ({synonym}, …)" (SPEC §5.7; ED D-27, D-28). Every whole word of a definition
 * that is the answer or another form of its base becomes ___, and a synonym holding such a word
 * is dropped, so that the meaning never gives the answer away.
 */
export function meaningOf(blank, dictionary, nlp) {
  const forms = formsOf(blank, dictionary, nlp);
  const isForm = (word) => forms.has(word.toLowerCase());
  const hide = (text) => text.replace(/[A-Za-z]+/g, (word) => (isForm(word) ? HIDDEN : word));
  const holdsForm = (text) => (text.match(/[A-Za-z]+/g) || []).some(isForm);

  const senses = dictionary.senses(blank.base, blank.pos).slice(0, MAX_SENSES_SHOWN);
  const lines = senses.map(([definition, synonyms], index) => {
    const shown = synonyms.filter((synonym) => !holdsForm(synonym)).slice(0, MAX_SYNONYMS_SHOWN);
    const brackets = shown.length > 0 ? ` (${shown.join(", ")})` : "";
    return `${index + 1}. ${hide(definition)}${brackets}`;
  });
  return [blank.formLine, ...lines];
}

/** The forms of the blank's base in lower case: the base, the word as written, the forms that
 * the exception lists give for the base, and those compromise makes from it (SPEC §5.6). */
function formsOf(blank, dictionary, nlp) {
  const forms = new Set([blank.base, blank.text.toLowerCase()]);
  for (const [form, bases] of Object.entries(dictionary.exceptionsOf(blank.pos))) {
    if (bases.includes(blank.base)) {
      forms.add(form);
    }
  }
  // compromise's own inflection of a base form (conjugate, toPlural, toComparative, toSuperlative),
  // which its "two" build keeps under methods().two.transform with the word lists of its model()
  const transform = nlp.methods().two.transform;
  const model = nlp.model();
  const made = [];
  if (blank.pos === "v") {
    made.push(...Object.values(transform.verb.conjugate(blank.base, model)));
  } else if (blank.pos === "n") {
    made.push(transform.noun.toPlural(blank.base, model));
  } else if (blank.pos === "a") {
    made.push(transform.adjective.toComparative(blank.base, model));
    made.push(transform.adjective.toSuperlative(blank.base, model));
  }
  for (const form of made) {
    // a made form of one word only ("will run" is not a form to hide word by word)
    if (form && !form.includes(" ")) {
      forms.add(form.toLowerCase());
    }
  }
  return forms;
}

/**
 * The blanks of `speech` with their meanings, as the analysis worker answers them (SPEC §3): the
 * candidates of candidatesOf, each with `meaning`, the lines of meaningOf. `loader` is a
 * dictionary loader (dict.js); only the word files of the words of `speech`, their roots and the
 * base forms their exception lists give are fetched. A sentence that is not English has none and
 * fetches nothing (ED D-40).
 */
export async function blanksOf(nlp, speech, loader) {
  if (!isEnglishSentence(speech)) {
    return [];
  }
  const words = wordsOf(nlp, speech);
  const exceptions = await loader.exceptions();
  const dictionary = await loader.dictionaryFor(formsToLoad(words, exceptions));
  return candidatesOf(words, dictionary).map((blank) => ({
    ...blank,
    meaning: meaningOf(blank, dictionary, nlp),
  }));
}

/**
 * The forms whose word files a sentence needs: each word as written, its root, and the base forms
 * the exception lists give for it ("went" → "go", in another file). The word files are split by
 * first letter, and the suffix rules of morphy only take letters off the end, so the bases they
 * give are in the file of the word itself.
 */
function formsToLoad(words, exceptions) {
  const forms = [];
  for (const word of words) {
    const text = word.text.toLowerCase();
    forms.push(text, word.root.toLowerCase());
    for (const list of Object.values(exceptions)) {
      forms.push(...(list[text] || []));
    }
  }
  return forms.filter(Boolean);
}
