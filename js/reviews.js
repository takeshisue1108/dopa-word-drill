// The reviews of the words answered wrong (SPEC §5.11; ED D-61 to D-63): a sentence whose blank
// was answered wrong comes back as it was, with the same blank and the mark 「復習」, 3 to 5
// sentences after the miss and again 9 to 12 sentences after it. A wrong answer in a review sets
// both reviews again from that answer. The sentences are counted as they come down, reviews
// included, across books and closed tabs; the reviews are kept by prefs.js with the count.
// They stand beside the words to bring back of missed.js (D-22): the two never touch.

// the reviews of one miss: the window of each, in sentences after the sentence missed
const WINDOWS = [
  [3, 5],
  [9, 12],
];

/** The reviews over `prefs` (store/prefs.js, or a stand-in with reviews() and saveReviews()):
 * reviews() is { shown (the sentences that have come down), due: [{ at, sentence, chosen }] }. */
export function createReviews(prefs) {
  return {
    /** A sentence comes down: the count goes up by 1, and a review shown (`review`, or null) is
     * no longer due. */
    cameDown(review) {
      const kept = prefs.reviews();
      kept.shown += 1;
      if (review) {
        kept.due = kept.due.filter((one) => one !== review);
      }
      prefs.saveReviews();
    },

    /** A wrong answer, or a shot with nothing typed, on the blank `chosen` (as the worker answers
     * it) of `sentence` (the book's: { display, speech, map, ends }), the sentence that came down
     * last: the reviews of its base form are set again, each in its window at a sentence no
     * other review takes, chosen by `random` (a function giving a number from 0 up to 1); when
     * all of a window is taken, the first free sentence after it. */
    wrong(sentence, chosen, random) {
      const kept = prefs.reviews();
      kept.due = kept.due.filter((one) => one.chosen.base !== chosen.base);
      const taken = new Set(kept.due.map((one) => one.at));
      for (const [first, last] of WINDOWS) {
        const at = freeAt(kept.shown + first, kept.shown + last, taken, random);
        taken.add(at);
        kept.due.push({ at, sentence, chosen });
      }
      prefs.saveReviews();
    },

    /** The review due at the next sentence to come down, the one due longest first, or null; it
     * stays due until it comes down (cameDown). */
    next() {
      const kept = prefs.reviews();
      const coming = kept.shown + 1;
      let found = null;
      for (const one of kept.due) {
        if (one.at <= coming && (!found || one.at < found.at)) {
          found = one;
        }
      }
      return found;
    },
  };
}

/** A sentence from `first` to `last` not in `taken`, chosen by `random`; when there is none, the
 * first one after `last` not in `taken`. */
function freeAt(first, last, taken, random) {
  const free = [];
  for (let at = first; at <= last; at++) {
    if (!taken.has(at)) {
      free.push(at);
    }
  }
  if (free.length > 0) {
    return free[Math.floor(random() * free.length)];
  }
  let at = last + 1;
  while (taken.has(at)) {
    at += 1;
  }
  return at;
}
