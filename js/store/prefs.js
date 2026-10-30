// What the site remembers in the user's own browser: settings, the place in each book, and the
// drill's words to bring back and its reviews (SPEC §5.4, §5.8, §5.11; ED D-48, D-61). One localStorage key, dwd.v1; a
// browser that refuses storage still reads, it only forgets.

const KEY = "dwd.v1";
// melody: the song's mode, "fragments" or "score" (SPEC_dopa v3.21 §6.12; "score" when the user
// has chosen none, ED D-166)
// the reader app also keeps an accompaniment level; the drill plays no accompaniment and keeps
// none (this project's ED D-47, SPEC §5.4)
// song: the song is on (ED D-71; no longer read since D-86); review: the checkbox 「復習あり」 (ED
// D-88, D-89)
const DEFAULTS = { speed: 1.0, voice: 1.0, sfx: 0.8, melody: "score", song: true, review: true };

// what is kept, read once: { settings, positions, lastBook, missed, reviews }; lastBook is the reader's
// field, written by setPosition and read by nothing in the drill
let state = null;

/** What is kept, read from the browser's storage at the first call: a missing or unreadable text
 * is all defaults, and a field missing from it is its default (only the song's mode is checked
 * for a value of its own). */
function load() {
  if (state) {
    return state;
  }

  let saved = null;
  try {
    const text = localStorage.getItem(KEY) || "null";
    saved = JSON.parse(text);
  } catch {
    saved = null;
  }

  const kept = saved || {};
  state = {
    settings: { ...DEFAULTS, ...kept.settings },
    positions: kept.positions || {},
    lastBook: kept.lastBook || null,
    // the drill's words to bring back: { base form: count left } (SPEC §5.4, §5.8)
    missed: kept.missed || {},
    // the drill's reviews: { shown (the sentences that have come down), due } (SPEC §5.11)
    reviews: kept.reviews || { shown: 0, due: [] },
  };

  // a mode that is neither of the two (a damaged entry) is the default
  const modeIsKnown = ["fragments", "score"].includes(state.settings.melody);
  if (!modeIsKnown) {
    state.settings.melody = DEFAULTS.melody;
  }

  return state;
}

/** Write everything to the browser's storage; a browser that refuses is ignored. */
function save() {
  try {
    const text = JSON.stringify(state);
    localStorage.setItem(KEY, text);
  } catch {
    // private browsing or a full disk: reading goes on, nothing is kept (§5.4)
  }
}

/** The settings: { speed, voice, sfx, melody }. */
export function settings() {
  const kept = load();
  return kept.settings;
}

/** Change one setting and write it at once. */
export function setSetting(name, value) {
  const kept = load();
  kept.settings[name] = value;

  save();
}

/** The drill's words to bring back, { base form: count left }, kept across books and closed tabs
 * (ED D-48). The object is the kept one: change it, then call saveMissed. */
export function missed() {
  const kept = load();
  return kept.missed;
}

/** Write the words to bring back at once. */
export function saveMissed() {
  load(); // read first, so that save() never writes a state that was never read
  save();
}

/** The drill's reviews, { shown, due }, kept across books and closed tabs (ED D-61). The object
 * is the kept one: change it, then call saveReviews. */
export function reviews() {
  const kept = load();
  return kept.reviews;
}

/** Write the reviews at once. */
export function saveReviews() {
  load(); // read first, so that save() never writes a state that was never read
  save();
}

/** The place in a book: { block, sentence, title, at } or null. setPosition merges what it is
 * given into the place kept, so a place may hold other fields too. `at` is when it was last written (an ISO time). */
export function position(key) {
  const kept = load();
  const place = kept.positions[key];

  return place || null;
}

/** Write some fields of a book's place; the fields not given stay as they are kept. */
export function setPosition(key, place) {
  const kept = load();

  const placeBefore = kept.positions[key] || {};
  const writtenAt = new Date().toISOString();

  kept.positions[key] = {
    ...placeBefore,
    ...place,
    at: writtenAt,
  };
  kept.lastBook = key;

  save();
}

/** Forget a book's place (「一覧から消す」). */
export function forget(key) {
  const kept = load();
  delete kept.positions[key];

  save();
}

/** The books read before, the latest first: [{ key, ...position }] (「続きから」). */
export function recent() {
  const kept = load();

  const places = [];
  for (const [key, place] of Object.entries(kept.positions)) {
    const withKey = { key, ...place };
    places.push(withKey);
  }

  places.sort((one, other) => {
    const otherAt = String(other.at);
    const oneAt = String(one.at);
    return otherAt.localeCompare(oneAt);
  });

  return places;
}
