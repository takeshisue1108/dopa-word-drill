// The drill's text column on its plate (SPEC §6.3; ED D-14, D-36, D-49, D-50, D-53, D-56, D-57),
// on the 852×480 text layer: from the top, the waiting sentence (the next one, dim), the sentence
// with its blank, the meaning and the answer line, on a translucent plate at the left of the glass,
// as the approved mockups layout_G.png and layout_H.png have them. A review and a review that
// waits start with the mark 「復習」 and its icon (D-61), on their first line. layoutColumn is
// pure: it works out the lines and places; the cockpit draws them.

import { S } from "../strings.js";

const X = 40; // the left edge of the text
const WIDTH = 532; // the width of the text
const WAITING_TOP = 36;
const WAITING = { size: 16, lineHeight: 20, maxLines: 2 };
const SENTENCE = { size: 20, lineHeight: 26 };
const SENTENCE_SMALL = { size: 16, lineHeight: 20 }; // when the column would reach the pilot's head
const MEANING = { size: 16, lineHeight: 20, maxLines: 5 };
const ANSWER = { size: 24, lineHeight: 30 };
const GAP_AFTER_WAITING = 8;
const GAP_AFTER_SENTENCE = 8;
const GAP_AFTER_MEANING = 0; // the answer line comes right under the meaning (layout_G.png)
// the pilot's head line: the text above it may be as wide as the column; below it only the answer
// line goes, left of her head
const HEAD_LINE = 256;
const PLATE = { x: 28, y: 28, w: 556, narrowW: 300, below: 2 };
const MORE = "…";
// the mark of a review: its icon as wide as the letters are tall, then a gap, then 「復習」, then
// the room left before the sentence
const MARK = { gap: 4, after: 8 };

// for the cockpit, on the 852×480 text layer: where the column's text stands above the pilot's head
// line (the answer field lies over it), and the part of the plate above that line (no star is set
// behind it)
export const COLUMN_BOX = { x: X, y: WAITING_TOP, w: WIDTH, h: HEAD_LINE - WAITING_TOP };
export const PLATE_ABOVE_HEAD = { x: PLATE.x, y: PLATE.y, w: PLATE.w, h: HEAD_LINE - PLATE.y };

/** The blank as shown: its first letter and one underscore for each other letter, spaced (D-14):
 * "running" → "r _ _ _ _ _ _". */
export function blankText(word) {
  return [word[0], ..."_".repeat(word.length - 1)].join(" ");
}

/**
 * The column: { waiting, sentence, meaning, answer, plates }. Each text part has x, top, size,
 * lineHeight, width and lines; the sentence also has scrolls, first and visible (the lines shown
 * when it scrolls). `waiting` and `sentence` are texts, `meaning` a list of lines; `measure(text,
 * size)` gives a text's width in pixels at a size; `hint`, when given, is the meaning's last line
 * (after a miss, D-32), the senses cut to leave it room. The rule of sizes (D-57): the sentence is 20 px;
 * 16 px when the meaning would pass the pilot's head line; and when even that passes, it shows the
 * lines around its blank, moved by `scroll` lines (ST-20) but not past its ends; `scrolled` is the
 * move kept. `review` and `waitingReview` say that the sentence and the waiting one are reviews:
 * the part's `mark` is then the width its mark takes at the start of its first line, else 0.
 */
export function layoutColumn({
  waiting,
  sentence,
  meaning,
  hint = null,
  scroll = 0,
  review = false,
  waitingReview = false,
  measure,
}) {
  const waitingMark = waitingReview ? markWidth(WAITING.size, measure) : 0;
  const waitingLines = cut(
    wrap(waiting, WAITING.size, measure, "", waitingMark),
    WAITING.maxLines,
    WAITING.size,
    measure,
  );
  const meaningLines = cut(
    meaning.flatMap((line) => wrap(line, MEANING.size, measure, "   ")),
    hint ? MEANING.maxLines - 1 : MEANING.maxLines,
    MEANING.size,
    measure,
  );
  if (hint) {
    meaningLines.push(hint);
  }
  const meaningHeight = meaningLines.length * MEANING.lineHeight;
  const sentenceTop = WAITING_TOP + waitingLines.length * WAITING.lineHeight + GAP_AFTER_WAITING;

  const sentencePart = sentenceAt(sentence, sentenceTop, meaningHeight, scroll, review, measure);
  const meaningTop = sentenceTop + sentencePart.height + GAP_AFTER_SENTENCE;
  const answerTop = meaningTop + meaningHeight + GAP_AFTER_MEANING;

  return {
    waiting: {
      x: X,
      top: WAITING_TOP,
      width: WIDTH,
      ...WAITING,
      lines: waitingLines,
      mark: waitingMark,
    },
    sentence: { x: X, top: sentenceTop, width: WIDTH, text: sentence, ...sentencePart.layout },
    meaning: { x: X, top: meaningTop, width: WIDTH, ...MEANING, lines: meaningLines },
    answer: { x: X, top: answerTop, ...ANSWER },
    plates: platesFor(answerTop + ANSWER.lineHeight),
  };
}

/** The sentence at its size (D-57), and the height it takes; a review's mark at the start. */
function sentenceAt(sentence, top, meaningHeight, scroll, review, measure) {
  const roomFor = (lineHeight, lines) =>
    top + lines * lineHeight + GAP_AFTER_SENTENCE + meaningHeight <= HEAD_LINE;
  const markOf = (style) => (review ? markWidth(style.size, measure) : 0);

  for (const style of [SENTENCE, SENTENCE_SMALL]) {
    const mark = markOf(style);
    const lines = wrap(sentence, style.size, measure, "", mark);
    if (roomFor(style.lineHeight, lines.length)) {
      const layout = {
        ...style,
        mark,
        lines,
        scrolls: false,
        first: 0,
        scrolled: 0,
        visible: lines.length,
      };
      return { layout, height: lines.length * style.lineHeight };
    }
  }

  // too long even in 16 px: as many lines as fit, around the line of the blank
  const mark = markOf(SENTENCE_SMALL);
  const lines = wrap(sentence, SENTENCE_SMALL.size, measure, "", mark);
  const room = HEAD_LINE - top - GAP_AFTER_SENTENCE - meaningHeight;
  const visible = Math.max(1, Math.floor(room / SENTENCE_SMALL.lineHeight));
  const blankLine = Math.max(
    0,
    lines.findIndex((line) => /\S( _)+/.test(line)),
  );
  const lastFirst = lines.length - visible;
  const around = Math.min(Math.max(0, blankLine - Math.floor(visible / 2)), lastFirst);
  const first = Math.min(Math.max(0, around + scroll), lastFirst);
  const layout = {
    ...SENTENCE_SMALL,
    mark,
    lines,
    scrolls: true,
    first,
    scrolled: first - around,
    visible,
  };
  return { layout, height: visible * SENTENCE_SMALL.lineHeight };
}

/** The plate down to 2 px under the answer line; the part below the pilot's head line is narrower. */
function platesFor(answerBottom) {
  const bottom = answerBottom + PLATE.below;
  if (answerBottom <= HEAD_LINE) {
    return [{ x: PLATE.x, y: PLATE.y, w: PLATE.w, h: bottom - PLATE.y }];
  }
  return [
    { x: PLATE.x, y: PLATE.y, w: PLATE.w, h: HEAD_LINE - PLATE.y },
    { x: PLATE.x, y: HEAD_LINE, w: PLATE.narrowW, h: bottom - HEAD_LINE },
  ];
}

/** The width of a review's mark at the letters' `size` (MARK). */
function markWidth(size, measure) {
  return size + MARK.gap + measure(S.review, size) + MARK.after;
}

/** `text` cut into lines no wider than WIDTH at `size`, at spaces; a line after the first starts
 * with `indent`, and the first is `lead` pixels narrower (a review's mark). A single word wider
 * than the column stands on a line of its own. */
function wrap(text, size, measure, indent = "", lead = 0) {
  const lines = [];
  let line = "";
  for (const word of wordsOf(text)) {
    const tried = line === "" ? word : `${line} ${word}`;
    const room = lines.length === 0 ? WIDTH - lead : WIDTH;
    if (line !== "" && measure(tried, size) > room) {
      lines.push(line);
      line = indent + word;
    } else {
      line = tried;
    }
  }
  lines.push(line);
  return lines;
}

/** The words of `text`, cut at its spaces, a blank's slots kept with its first letter
 * ("r _ _ _" is one word, blankText): a line is never cut inside the blank. */
function wordsOf(text) {
  const words = [];
  for (const piece of text.split(" ")) {
    const isSlot = piece.startsWith("_") && words.length > 0;
    if (isSlot) {
      words[words.length - 1] += ` ${piece}`;
    } else {
      words.push(piece);
    }
  }
  return words;
}

/** The first `maxLines` of `lines`; when some are left out, the last one kept ends with … and is
 * shortened to fit. */
function cut(lines, maxLines, size, measure) {
  if (lines.length <= maxLines) {
    return lines;
  }
  const kept = lines.slice(0, maxLines);
  let last = kept[maxLines - 1];
  while (last.length > 0 && measure(last + MORE, size) > WIDTH) {
    // take off the last word (a blank whole, wordsOf), or the last letter of the only word
    const words = wordsOf(last);
    last = words.length > 1 ? words.slice(0, -1).join(" ") : last.slice(0, -1);
  }
  kept[maxLines - 1] = last + MORE;
  return kept;
}

// how long the waiting sentence takes to come down into the sentence's place (D-50): 0.5 s
export const SLIDE_TICKS = 15;

/** Where a sentence coming down stands `ticks` after it started: { top, share }, `top` going from
 * the waiting sentence's `from` to the sentence's `to` in SLIDE_TICKS, and `share` the part of the
 * way done, 0 to 1 (its letters turn from dim to white with it; the sentence before fades). */
export function slideAt(from, to, ticks) {
  const share = Math.min(1, Math.max(0, ticks / SLIDE_TICKS));
  return { top: Math.round(from + (to - from) * share), share };
}
