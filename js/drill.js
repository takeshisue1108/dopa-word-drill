// The drill loop of the site (SPEC §6.2; ED ST-06 to ST-25), in place of the reader app's
// reading loop: a chapter starts with its launch; then one sentence after another comes down with
// its blank, its meaning, its robot and its song, and waits for the answer. The drill is given
// what it drives (createDrill's parts), so that the tests can give it stand-ins.
//
// A sentence made ready ("prepared") is { place, sentence, chosen, blank, meaning, sung, review,
// robot }: `chosen` is the candidate chosen (lang/blanks.js), or null, and `blank` the same with
// where it is shown; its `start` and `end` are in the sentence's speech
// text (which is also the sung text up to the mark), and `blank.display` is { start, end, word }
// of the same word in the display text, which the column is given. `sung` is what the song made
// ready of the sentence with the blank's word as the mark of 「ニャン」 (SPEC §5.10). Once it is
// handed to the song (sing) it also has `job` (the song's: the song sets its `t0` when it starts
// the sentence and its `end` when it ends it), `songEnded` and `songIsOver`; after a miss,
// `robotGone`. A review (reviews.js) is a sentence answered wrong before, with the same blank:
// its `review` is the review that brought it (else null), and its `place` is the book's place
// it came after, which it does not move. `robot` names its robot.
//
// Work that waits (a launch, a card, a sentence made ready, a burst) can come back after the
// drill has moved on. Two guards drop it: what belongs to a chapter's start or the book's end
// checks `turn`, which startChapter and bookEnd count up; what belongs to one sentence checks
// that `current` is still that sentence. leave() (open, jump) sets `current` to null, so both
// fire.
import { NYAN_MARK } from "./lang/morae.js";
import { blankText } from "./cockpit/panel.js";
import { judge } from "./judge.js";
import { createMissed } from "./missed.js";
import { indexChapters, speechToDisplay, toDisplay } from "./places.js";
import { createReviews } from "./reviews.js";
import { fill, S } from "./strings.js";

/**
 * The drill over its parts: `cockpit` (cockpit/cockpit.js), `song` (sing/index.js), `analyzer`
 * (lang/client.js), `store` (store/prefs.js), `random` (a function giving a number from 0 up to
 * 1, Math.random in the page) and the page's `hooks`: frames(callback) (requestAnimationFrame),
 * focus("answer") or focus("fire") (where the keyboard's focus goes), describe(name, description)
 * (the answer field's accessible name, null without a blank, and its description),
 * onSentence(n, total) (the sentence's number in the book, for 「文 {n}/{total}」), sfx(role),
 * onNotice(text) and onBookEnd().
 */
export function createDrill({ cockpit, song, analyzer, store, random, hooks }) {
  const missed = createMissed(store);
  const reviews = createReviews(store);
  let reviewsMade = 0; // for the names of the reviews' robots
  // the checkbox 「復習あり」 (ED D-89; SPEC SD-19): unchecked, no review comes; a miss still sets
  // its reviews
  const reviewsOn = () => store.settings().review !== false;
  // the book's sentence made ready to wait, and put off by a review when the box was checked: it
  // comes after the review as it was made, so that its blank is not chosen twice (D-22)
  let putOff = null;
  let book = null;
  let chapterOf = [];
  let sentenceNumbers = { before: [], total: 0 }; // the book's sentences (sentencesOf)

  // the drill's state (SPEC §6.2): "launch", "asking" (the robot waits for the answer), "flying"
  // (the missiles of a right answer are out), "missed" (the right word is shown, and the drill
  // waits for the next shot), "coming" (the waiting sentence is on its way down: it comes as soon
  // as it is ready), "ending" (the book's end card is up). A shot is taken in "asking" and
  // "missed" only (fire)
  let state = "launch";

  // the sentence asked, prepared (or null), and the promise of the one that waits at the top
  // (prepareWaiting)
  let current = null;
  let nextPrepared = null;

  // what the column shows (cockpit/column.js, show)
  let column = null;

  // the charging of the turn that waits for its first sentence: { timer, shown } (charging)
  let charge = null;

  // a chapter's start and the book's end each begin a new turn; work of an earlier turn that comes
  // back late (a launch or a card that ends, a sentence made ready) finds the turn changed and is
  // dropped
  let turn = 0;

  /** Show the column with `changes` to what it shows. */
  function showColumn(changes) {
    column = { ...column, ...changes };
    cockpit.showColumn(column);
  }

  // whether the song could start; and whether the drill has said that something of the song failed
  let songStarted = true;
  let failureSaid = false;

  /** 「歌の素材を読み込めませんでした」, once (ST-24). */
  function sayTheFailureOnce(error) {
    console.warn(`the song cannot sing: ${error}`);
    if (!failureSaid) {
      failureSaid = true;
      hooks.onNotice(S.songFailed);
    }
  }

  // a sentence that cannot be analyzed is sung on silent slots, at the song's pace (ST-24)
  song.setScorer(async (text) => {
    try {
      return await analyzer.analyze(text);
    } catch (error) {
      sayTheFailureOnce(error);
      return silentScore(text);
    }
  });
  hooks.frames(lightLoop);

  /** The words of `sentence` that can be its blank (lang/blanks.js); none when it cannot be
   * analyzed (ST-24). */
  async function candidatesFor(sentence) {
    try {
      return (await analyzer.analyze(sentence.speech)).blanks || [];
    } catch (error) {
      sayTheFailureOnce(error);
      return [];
    }
  }

  /** The sentence at `place` made ready: its blank chosen, its song prepared; or the sentence a
   * review put off, when it is the one at `place`. */
  async function prepare(place) {
    const kept = putOff;
    putOff = null;
    if (kept && kept.place.block === place.block && kept.place.sentence === place.sentence) {
      return kept;
    }
    const sentence = book.blocks[place.block].sentences[place.sentence];
    const chosen = missed.choose(await candidatesFor(sentence), random);
    return readied({ place, sentence, chosen, review: null, robot: robotId(place) });
  }

  /** The sentence of `review` made ready after the book's `place` (D-61, D-62): its blank as it
   * was, its song prepared. */
  function prepareReview(review, place) {
    reviewsMade += 1;
    const { sentence, chosen } = review;
    return readied({ place, sentence, chosen, review, robot: `review:${reviewsMade}` });
  }

  /** A sentence with its blank `chosen` made ready: its song prepared. */
  async function readied(prepared) {
    const { sentence, chosen } = prepared;
    let sung = null;
    // the song can be turned off in 「設定」 (ED D-71; SPEC SD-14)
    if (songStarted && store.settings().song !== false) {
      sung = await song.prepare(sungTextOf(sentence, chosen)).catch(sayTheFailureOnce);
    }
    return {
      ...prepared,
      blank: chosen && blankOf(sentence, chosen),
      meaning: chosen ? chosen.meaning : [S.noBlank],
      sung,
    };
  }

  /** A prepared sentence comes down (ST-06, ST-08): its column, its robot and its song, at once;
   * then the sentence after it is made ready for the waiting place (ST-18). */
  function present(prepared) {
    state = "asking";
    current = prepared;
    reviews.cameDown(prepared.review);
    const blank = prepared.blank && prepared.blank.display;
    showColumn({
      waiting: "",
      waitingReview: false,
      sentence: { text: prepared.sentence.display, blank, answer: null, litUpTo: 0, nyan: false },
      // the blank's base form, which the hint's choices leave out (SPEC 2.0 §2.0.3)
      blankBase: prepared.blank ? prepared.blank.base : null,
      review: Boolean(prepared.review),
      meaning: prepared.meaning,
      hint: null,
      typed: "",
    });
    cockpit.bringRobot(prepared.robot);
    sing(prepared);
    if (!prepared.review) {
      store.setPosition(book.key, { ...prepared.place });
    }
    tellThePage(prepared);
    nextPrepared = prepareWaiting(prepared);
  }

  /** Tell the page of a sentence that comes down: the answer field's name and description, the
   * sentence's number in the book, and where the focus goes (the button without a blank). */
  function tellThePage(prepared) {
    hooks.describe(...answerFieldLabels(prepared));
    const { block, sentence } = prepared.place;
    hooks.onSentence(sentenceNumbers.before[block] + sentence + 1, sentenceNumbers.total);
    hooks.focus(prepared.blank ? "answer" : "fire");
  }

  /** Hand a prepared sentence to the song, which starts it at once (SPEC §6.6). Its end is the
   * promise `songEnded`, which `songIsOver()` also brings when a drawer stops the song (ST-21). */
  function sing(prepared) {
    if (!prepared.sung) {
      // nothing to sing: the song is over at once (ST-24)
      prepared.songIsOver = () => {};
      prepared.songEnded = Promise.resolve();
      return;
    }
    prepared.songEnded = new Promise((resolve) => (prepared.songIsOver = resolve));
    prepared.job = song.enqueue(prepared.sung, { onEnd: prepared.songIsOver });
  }

  /** At every frame the column's letters follow the song (ST-07): lit up to where it has sung,
   * the blank glowing while 「ニャン」 sounds, every letter once it has ended. */
  function lightLoop() {
    hooks.frames(lightLoop);
    const job = current && current.job;
    if (!job || job.t0 === undefined) {
      return;
    }
    const times = song.slotTimes(job);
    if (!times) {
      return;
    }

    // the song's time, less the time its sound takes to come out
    const latency = song.audioContext()?.outputLatency || 0;
    const now = song.now() - latency;

    let light = lightOf(current, timedMorae(job, times), now);
    if (job.end !== undefined && now >= job.end) {
      light = { litUpTo: current.sentence.display.length, nyan: false };
    }
    const shown = column.sentence;
    if (light.litUpTo !== shown.litUpTo || light.nyan !== shown.nyan) {
      showColumn({ sentence: { ...shown, ...light } });
    }
  }

  /** Make the sentence after `asked` ready and show it at the top as soon as it is (D-36): a
   * review when one is due (D-61), else the book's next sentence, whose blank is chosen now,
   * since it is shown open there (ST-17). Nothing waits at the end of a chapter or of the book,
   * unless a review is due. Resolves to the sentence made ready, or null when nothing waits or
   * the drill has moved past `asked`. */
  async function prepareWaiting(asked) {
    const review = reviewsOn() ? reviews.next() : null;
    let ready;
    if (review) {
      ready = await prepareReview(review, asked.place);
    } else {
      const { block, sentence } = asked.place;
      const place = sentenceFrom(book, chapterOf, { block, sentence: sentence + 1 });
      if (!place) {
        return null;
      }
      ready = await prepare(place);
    }
    if (current !== asked) {
      return null;
    }
    showColumn({ waiting: waitingLineText(ready), waitingReview: Boolean(ready.review) });
    return ready;
  }

  /** A shot while a sentence is asked (SPEC §6.2 steps 4 to 7): what was typed is judged, then
   * a hit or a miss; at a sentence without a blank, always a hit. */
  function shoot() {
    // a sentence without a blank: one shot is a hit, without a shout (D-18, ST-16)
    if (!current.blank) {
      state = "flying";
      afterHit(cockpit.hitRobot(current.robot, null));
      return;
    }

    const { word } = current.blank.display;
    const typed = column.typed;
    const id = current.robot;
    const right = judge(typed, word) === "right";

    const answered = { ...column.sentence, answer: { typed, right } };
    if (right) {
      state = "flying";
      showColumn({ sentence: answered, typed: "" });
      afterHit(cockpit.hitRobot(id, word));
      return;
    }

    // wrong, or nothing typed (D-34): the word comes back (ST-19), the sentence is reviewed
    // (D-61), and the drill waits (ST-11)
    state = "missed";
    missed.wrong(current.blank.base);
    reviews.wrong(current.sentence, current.chosen, random);
    showColumn({ sentence: answered, hint: S.next, typed: "" });
    current.robotGone = cockpit.missRobot(id);
  }

  /** After a hit the waiting sentence comes by itself, 0.5 s after both the burst (`burstEnded`)
   * and the song have ended (D-35, ST-13): the song is never cut short. With nothing sung, it
   * comes 1.2 s after the answer (ED D-75). */
  async function afterHit(burstEnded) {
    const asked = current;
    await Promise.all([burstEnded, asked.songEnded]);
    const pause = asked.sung ? AFTER_HIT_MS : AFTER_SILENT_HIT_MS;
    await new Promise((resolve) => setTimeout(resolve, pause));
    if (current === asked) {
      comeDown();
    }
  }

  /** The waiting sentence comes down, once it is ready (ST-12, ST-13); when none waits, the
   * chapter is over: the next chapter starts, or the book ends (ST-22, ST-23). */
  async function comeDown() {
    state = "coming";
    const left = current;
    // one robot on the road at a time (D-04): a missed one rushes past first
    await left.robotGone;
    const next = await nextPrepared;
    if (current !== left) {
      return; // a jump came
    }
    if (next) {
      present(next);
      return;
    }
    afterChapter(chapterOf[left.place.block]);
  }

  /** What follows chapter `chapterIndex`: the next chapter, or the book's end. */
  function afterChapter(chapterIndex) {
    const chapterAfter = chapterIndex + 1;
    return chapterAfter < book.chapters.length ? startChapter(chapterAfter) : bookEnd();
  }

  /** A chapter starts with its launch (ST-22), behind which its first sentence (or the sentence
   * at `place`, a place in it) is made ready. A chapter without a sentence is passed over. */
  async function startChapter(chapterIndex, place = null) {
    const chapter = book.chapters[chapterIndex];
    const start =
      place || sentenceFrom(book, chapterOf, { block: chapter.firstBlock, sentence: 0 });
    if (!start) {
      return afterChapter(chapterIndex);
    }
    state = "launch";
    const myTurn = ++turn;
    // no sentence is asked under a launch: nothing is lit, typed or shot (reader check w7)
    current = null;
    column = null;
    cockpit.showColumn(null);
    const first = prepare(start);
    await cockpit.launch(chapter.title || book.title, S.launch);
    const ready = await charging(first);
    if (myTurn === turn) {
      present(ready);
    }
  }

  /** Wait for a sentence made ready behind a launch: when it is not ready 0.6 s after, the
   * charging display stands until it is (ST-03; the reader's ST-43). */
  async function charging(ready) {
    const wait = {};
    charge = wait;
    wait.timer = setTimeout(() => {
      wait.shown = true;
      hooks.onNotice(S.songLoading);
    }, CHARGE_AFTER_MS);
    try {
      return await ready;
    } finally {
      if (charge === wait) {
        endCharging();
      }
    }
  }

  /** The charging of the turn that waits, if any, ends: its display goes (and a later turn's
   * is never taken away by an earlier one's end). */
  function endCharging() {
    if (!charge) {
      return;
    }
    clearTimeout(charge.timer);
    if (charge.shown) {
      hooks.onNotice(null, S.songLoading);
    }
    charge = null;
  }

  /** What the drill was doing is left, for another chapter or another book: the song takes the
   * sentence back, its robot leaves the road, the charging ends, and no sentence is asked. */
  function leave() {
    putOff = null;
    song.clear();
    current?.songIsOver();
    current = null;
    cockpit.clearRoad();
    endCharging();
  }

  /** The book's end (D-45, ST-23): 「{書名} 読了！」 with the fanfare for 5 s or a click, then the
   * book list. */
  async function bookEnd() {
    state = "ending";
    const myTurn = ++turn;
    hooks.sfx("fanfare");
    await cockpit.card([[fill(S.done, { title: book.title }), true]], END_CARD_SECONDS);
    if (myTurn !== turn) {
      return; // a jump or another book came while the card was up
    }
    store.setPosition(book.key, { block: 0, sentence: 0 });
    hooks.onBookEnd();
  }

  return {
    /** Open a book at its kept place, or at its start: the launch of that place's chapter, then
     * its sentence. */
    async open(newBook) {
      if (book) {
        leave();
      }
      book = newBook;
      ({ chapterOf } = indexChapters(book));
      sentenceNumbers = sentencesOf(book);
      try {
        await song.start(store.settings());
      } catch (error) {
        songStarted = false;
        sayTheFailureOnce(error);
      }
      const place = keptPlace(book, store.position(book.key));
      await startChapter(place ? chapterOf[place.block] : 0, place);
    },

    /** The answer line now holds `text` (the page's input, ST-09). */
    type(text) {
      if (!column) {
        return; // a launch is up
      }
      showColumn({ typed: text });
    },

    /** A drawer or the book list opens (`on`) or closes (ST-21, ST-02): the song stops, and the
     * sentence is not sung again; the cockpit is held while it is open. The sentence and what was
     * typed stay as they were. */
    hold(on) {
      if (on && current) {
        song.clear();
        current.songIsOver();
        current.job = null; // taken back: the light stands where it is (lightLoop)
      }
      cockpit.hold(on);
    },

    /** 「復習あり」 was checked or unchecked (SPEC SD-19), and counts at once: unchecked while a
     * review waits, the book's next sentence is made ready in its place; checked while a review is
     * due, the review takes the place of the book's sentence that waits, which is kept for after
     * it (`putOff`). */
    reviewsChanged() {
      const asked = current;
      if (!asked || !["asking", "flying", "missed"].includes(state)) {
        return;
      }
      nextPrepared = nextPrepared.then((ready) => {
        if (current !== asked) {
          return ready;
        }
        if (reviewsOn() && (!ready || !ready.review) && reviews.next()) {
          putOff = ready;
          return prepareWaiting(asked);
        }
        if (!reviewsOn() && ready && ready.review) {
          return prepareWaiting(asked);
        }
        return ready;
      });
    },

    /** Go to chapter `chapterIndex` (「目次」): the sentence left stops, its robot is taken off the
     * road, and the chapter starts with its launch. */
    jump(chapterIndex) {
      leave();
      startChapter(chapterIndex);
    },

    /** For checks: the state, the place and the blank's word of the sentence asked, and the
     * column. */
    debug() {
      return {
        state,
        place: current && current.place,
        word: current && current.blank ? current.blank.display.word : null,
        column,
      };
    },

    /** Enter or the missile button (D-19): the answer is fired while a sentence is asked; after
     * a miss, the next sentence comes (ST-12). Otherwise nothing happens. */
    fire() {
      if (state === "asking") {
        shoot();
      } else if (state === "missed") {
        comeDown();
      }
    },
  };
}

/**
 * The light of a prepared sentence at the song's time `now` (ST-07): { litUpTo, nyan }. `morae`
 * are its sung morae, timed (timedMorae), their spans in the text the song was given, where the
 * blank's word is the one character of the mark. `litUpTo` is the end of the last mora that has
 * begun, in the sentence's display text; `nyan` is true while a mora over the mark sounds
 * (「ニャン」 and its held slot).
 */
export function lightOf({ sentence, blank }, morae, now) {
  const markAt = blank ? blank.start : -1;
  const wordLength = blank ? blank.end - blank.start : 0;

  // an index of the sung text in the speech: past the mark, the mark stands for the word
  const inSpeech = (index) => (blank && index > markAt ? index - 1 + wordLength : index);

  let litUpTo = 0;
  let nyan = false;
  for (const mora of morae) {
    if (mora.t > now) {
      continue;
    }
    litUpTo = Math.max(litUpTo, speechToDisplay(sentence, inSpeech(mora.end)));
    const overTheMark = mora.start <= markAt && markAt < mora.end;
    if (overTheMark && now < mora.t + mora.dur) {
      nyan = true;
    }
  }
  return { litUpTo, nyan };
}

/** The morae of a song's `job` with their times: slot k of bar b is the sentence's slot 8b + k
 * (the sung slots of a bar come first), and `times` gives each slot's start and, last, the end of
 * the last bar (sing/index.js, slotTimes). */
export function timedMorae(job, times) {
  return job.bars.flatMap((bar, barIndex) =>
    bar.map((mora, slotInBar) => {
      const slot = SLOTS_PER_BAR * barIndex + slotInBar;
      return {
        t: times[slot],
        dur: times[slot + 1] - times[slot],
        start: mora.start,
        end: mora.end,
      };
    }),
  );
}

// a sentence that could not be analyzed: 8 slots for 5 characters (the reader's SD-W09)
const UNSCORED_CHARS_PER_SLOT = 5 / 8;

/** A score without a voice, for a sentence that could not be analyzed (the reader's): the text's
 * characters over silent slots (「ッ」) at the song's pace. */
function silentScore(text) {
  const morae = [];
  const slots = Math.ceil(text.length / UNSCORED_CHARS_PER_SLOT);
  for (let slot = 0; slot < slots; slot++) {
    const start = Math.floor(slot * UNSCORED_CHARS_PER_SLOT);
    const end = Math.min(text.length, Math.floor((slot + 1) * UNSCORED_CHARS_PER_SLOT));
    morae.push({ k: "ッ", start, end, tails: [] });
  }
  return { phrases: [{ pause: true, morae }], targets: [] };
}

/** Whether `book` has an English sentence to drill (D-51, ST-04): a sentence with a Latin letter
 * in a block taken for English (books/sentences.js, detectLang, takes a block without letters for
 * English too). */
export function hasEnglish(book) {
  return book.blocks.some(
    (block) =>
      block.kind !== "figure" &&
      block.lang === "en" &&
      block.sentences.some((sentence) => /[A-Za-z]/.test(sentence.speech)),
  );
}

/** The sentences of `book`: { before (for each block, how many sentences the blocks before it
 * hold), total }. A figure holds none. */
function sentencesOf(book) {
  const before = [];
  let total = 0;
  for (const block of book.blocks) {
    before.push(total);
    if (block.kind !== "figure") {
      total += block.sentences.length;
    }
  }
  return { before, total };
}

/** The place `kept` for `book`, when the book has a sentence there; else null. */
function keptPlace(book, kept) {
  const block = kept && book.blocks[kept.block];
  if (block && block.sentences[kept.sentence]) {
    return { block: kept.block, sentence: kept.sentence };
  }
  return null;
}

/** The first place from `place` on, in its chapter, that holds a sentence, or null: figures and
 * blocks without sentences are stepped over. */
function sentenceFrom(book, chapterOf, place) {
  const chapter = chapterOf[place.block];
  let { block, sentence } = place;
  while (block < book.blocks.length && chapterOf[block] === chapter) {
    const { kind, sentences } = book.blocks[block];
    if (kind !== "figure" && sentences[sentence]) {
      return { block, sentence };
    }
    block += 1;
    sentence = 0;
  }
  return null;
}

/** The blank of `sentence` for the candidate `chosen`: the candidate, with its span in the
 * display text and the word shown there. */
function blankOf(sentence, chosen) {
  const display = toDisplay(sentence, chosen.start, chosen.end);
  const word = sentence.display.slice(display.start, display.end);
  return { ...chosen, display: { ...display, word } };
}

/** What the song sings of `sentence`: its speech, with the word of the blank `chosen` (or null)
 * as the mark of 「ニャン」 (SPEC §5.10). */
function sungTextOf(sentence, chosen) {
  if (!chosen) {
    return sentence.speech;
  }
  const { speech } = sentence;
  return speech.slice(0, chosen.start) + NYAN_MARK + speech.slice(chosen.end);
}

// the slots of a bar of the song (the reader's sing D-20)
const SLOTS_PER_BAR = 8;

// how long a sentence may still be made ready after its launch before the charging shows (ST-03)
const CHARGE_AFTER_MS = 600;

// how long the book's end card stands, unless it is clicked (ST-23)
const END_CARD_SECONDS = 5;

// from the end of a hit's burst and its song to the next sentence (D-35)
const AFTER_HIT_MS = 500;

// from a hit to the next sentence when nothing is sung (ED D-75)
const AFTER_SILENT_HIT_MS = 1200;

/** A prepared sentence as the column shows it: its blank as its first letter and slots. */
function waitingLineText({ sentence, blank }) {
  if (!blank) {
    return sentence.display;
  }
  const { start, end, word } = blank.display;
  return sentence.display.slice(0, start) + blankText(word) + sentence.display.slice(end);
}

/** The answer field's accessible name and description for a prepared sentence (SPEC §6.4, PR-02):
 * 「空欄（{n} 文字、{頭文字} から）」, and the sentence with 「空欄」 in place of the word, then its
 * meaning; without a blank, no name, and the sentence and 「空欄なし。楽勝！」. */
function answerFieldLabels({ sentence, blank, meaning, review }) {
  // each part read as a sentence of its own; a review says so first (D-61)
  const stopped = (text) => (/[.!?。！？]$/.test(text) ? text : `${text}.`);
  const first = review ? [S.review] : [];
  if (!blank) {
    return [null, [...first, sentence.display, ...meaning].map(stopped).join(" ")];
  }
  const { start, end, word } = blank.display;
  const name = fill(S.blankName, { n: word.length, first: word[0] });
  const spoken = sentence.display.slice(0, start) + S.blank + sentence.display.slice(end);
  return [name, [...first, spoken, ...meaning].map(stopped).join(" ")];
}

/** The robot of a sentence is named by its place. */
const robotId = (place) => `${place.block}:${place.sentence}`;
