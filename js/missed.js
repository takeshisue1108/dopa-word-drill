// The words to bring back (SPEC §5.8; ED D-22 to D-24, D-34, D-48): a base form answered wrong is
// made the blank first the next 2 times a word of that base form is in a sentence, and is then
// dropped; a new wrong answer sets its count back to 2. The counts are kept in the browser by
// prefs.js, across books and closed tabs, and never shown.

const TIMES_BROUGHT_BACK = 2;

/** The words to bring back over `prefs` (store/prefs.js, or a stand-in with missed() and
 * saveMissed()). */
export function createMissed(prefs) {
  return {
    /** A wrong answer, or a shot with nothing typed, on a blank of base form `base`. */
    wrong(base) {
      prefs.missed()[base] = TIMES_BROUGHT_BACK;
      prefs.saveMissed();
    },

    /**
     * The blank of a sentence among its `candidates` (as the worker answers them), or null when it
     * has none: one whose base form is kept, if any, else any of them; chosen by `random` (a
     * function giving a number from 0 up to 1, Math.random in the page). A kept base form chosen
     * has its count lowered by 1 and is dropped at 0.
     */
    choose(candidates, random) {
      const kept = prefs.missed();
      const broughtBack = candidates.filter((candidate) => kept[candidate.base] > 0);
      const pool = broughtBack.length > 0 ? broughtBack : candidates;
      if (pool.length === 0) {
        return null;
      }
      const blank = pool[Math.floor(random() * pool.length)];
      if (broughtBack.length > 0) {
        kept[blank.base] -= 1;
        if (kept[blank.base] === 0) {
          delete kept[blank.base];
        }
        prefs.saveMissed();
      }
      return blank;
    },
  };
}
