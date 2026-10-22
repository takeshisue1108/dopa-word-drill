// The drill's screen on a phone held upright (SPEC 2.0 SD-10, §2.0.2; ED draft 3 V-09, V-12,
// ST-35 to ST-51, D-85). It takes the cockpit's place for drill.js and has its methods: the
// robot's do nothing and resolve at once (ED D-65), launch() gives its title to the chapter line of
// the next sentence (D-80), and card() shows the end of the book until 「本をえらぶ」 (D-80).
//
// The column drill.js shows (cockpit/column.js had it) is { sentence: { text, blank, answer,
// litUpTo, nyan }, blankBase, review, meaning, waitingReview, typed, ... }: `blank` is { start,
// end, word } in `text`, or null without a blank; `answer` is { typed, right } once answered.
import { choicesFor } from "../lookalike.js";
import { S } from "../strings.js";

const REVIEW_MARK =
  '<span class="mark"><svg viewBox="0 0 16 16" aria-hidden="true"><path d="M4 6h6a4 4 0 0 1 0 8H6" fill="none" stroke="currentColor" stroke-width="2"/><path d="M6 2 2 6l4 4" fill="none" stroke="currentColor" stroke-width="2"/></svg>' +
  S.review +
  "</span>";

/**
 * The view over the page's elements `el` ({ read, next, choices, answer, go, hint, end, endTitle,
 * endBooks }), with `hintOn()` (whether 「Hint」 is checked), `loadLetter(letter)` (a promise of
 * the look-alike index's file for a first letter), `random`, and `onChoice(word)`, called when a
 * choice is touched.
 */
export function createView({ el, hintOn, loadLetter, random, onChoice }) {
  let column = null;
  let chapterLine = null; // the title given by launch(), for the next sentence (D-80)
  let pendingChapter = null;
  let sentenceKey = null; // what makes a sentence new: its text and its blank
  let choices = null; // the words of the hint for this sentence; [] when there is none (D-74)
  let choicesFor_ = null; // the sentence key the choices were made for
  let endResolve = null;

  /** Whether the sentence asked shows its choices instead of the answer line. */
  function choosing() {
    const blank = column && column.sentence.blank;
    return Boolean(blank && hintOn() && choices && choices.length > 0);
  }

  /** The state of the sentence asked, for the page: "none", "asking", "right", "missed" or
   * "noblank". */
  function mode() {
    if (!column) {
      return "none";
    }
    const { blank, answer } = column.sentence;
    if (!blank) {
      return "noblank";
    }
    if (!answer) {
      return "asking";
    }
    return answer.right ? "right" : "missed";
  }

  function sentenceHtml() {
    const { text, blank, answer, litUpTo, nyan } = column.sentence;
    const lit = (from, to) => {
      const cut = Math.max(from, Math.min(to, litUpTo));
      return `<span class="lit">${escape(text.slice(from, cut))}</span>${escape(text.slice(cut, to))}`;
    };
    if (!blank) {
      return lit(0, text.length);
    }
    let middle;
    if (!answer) {
      const slots = blank.word[0] + " _".repeat(blank.word.length - 1);
      middle = `<span class="slots${nyan ? " nyan" : ""}">${escape(slots)}</span>`;
    } else if (answer.right) {
      middle = `<span class="right">${escape(blank.word)}</span>`;
    } else {
      const typed = answer.typed.trim();
      const wrong = typed ? `<span class="wrong">${escape(typed)}</span>` : "";
      middle = `${wrong}<span class="right">${escape(blank.word)}</span>`;
    }
    return lit(0, blank.start) + `<span id="blank">${middle}</span>` + lit(blank.end, text.length);
  }

  function drawSentence() {
    const line = el.read.querySelector(".sentence");
    if (line) {
      line.innerHTML = (column.review ? REVIEW_MARK : "") + sentenceHtml();
    }
  }

  function drawAll(isNew) {
    let html = chapterLine ? `<p class="chapter">${escape(chapterLine)}</p>` : "";
    html += '<p class="sentence"></p><div class="meaning">';
    column.meaning.forEach((line) => {
      html += `<p>${escape(line)}</p>`;
    });
    html += "</div>";
    el.read.innerHTML = html;
    drawSentence();
    el.next.innerHTML = column.waitingReview ? REVIEW_MARK.replace(`${S.review}</span>`, `${S.nextReview}</span>`) : "";
    if (isNew) {
      el.read.scrollTop = 0;
      const blank = document.getElementById("blank");
      if (blank && blank.offsetTop + blank.offsetHeight > el.read.clientHeight) {
        el.read.scrollTop = blank.offsetTop - 8;
      }
    }
    layout();
  }

  /** The answer row and the choices, for the sentence's state and the hint (ST-37 to ST-43). */
  function layout() {
    const state = mode();
    const showChoices = choosing();
    el.choices.hidden = !(showChoices || noChoicesNote());
    el.answer.hidden = showChoices;
    el.go.textContent = state === "missed" || state === "noblank" ? S.nextSentence : S.answer;
    el.go.hidden = showChoices && state !== "missed";
    el.hint.classList.toggle("off", state === "noblank");
    if (showChoices) {
      drawChoices();
    } else if (noChoicesNote()) {
      el.choices.innerHTML = `<p class="nochoice">${escape(S.noChoices)}</p>`;
    }
  }

  /** With the hint on and no look-alike word for the blank, a note stands in place of the choices
   * and the answer line stays (D-74). */
  function noChoicesNote() {
    return Boolean(column && column.sentence.blank && hintOn() && choices && choices.length === 0);
  }

  function drawChoices() {
    const { blank, answer } = column.sentence;
    el.choices.replaceChildren();
    for (const word of choices) {
      const button = document.createElement("button");
      button.textContent = word;
      button.disabled = Boolean(answer);
      if (answer && word === blank.word) {
        button.className = "rightpick";
      } else if (answer && !answer.right && word === answer.typed) {
        button.className = "wrongpick";
      }
      button.addEventListener("click", () => {
        if (!column.sentence.answer) {
          onChoice(word);
        }
      });
      el.choices.appendChild(button);
    }
  }

  /** Make the choices of the sentence asked, once, when the hint is on (SPEC SD-12). */
  async function makeChoices() {
    const key = sentenceKey;
    if (!column || !column.sentence.blank || !hintOn() || choicesFor_ === key) {
      return;
    }
    choicesFor_ = key;
    const blank = { word: column.sentence.blank.word, base: column.blankBase, meaning: column.meaning };
    let made;
    try {
      made = await choicesFor(blank, loadLetter, random);
    } catch (error) {
      console.warn(`the look-alike words did not load: ${error}`);
      made = [];
    }
    if (sentenceKey === key) {
      choices = made;
      layout();
    }
  }

  return {
    showColumn(next) {
      if (!next) {
        column = null;
        sentenceKey = null;
        el.read.innerHTML = "";
        el.next.innerHTML = "";
        el.choices.hidden = true;
        return;
      }
      const { text, blank } = next.sentence;
      const key = `${text}\u0000${blank ? blank.start : -1}\u0000${next.review ? 1 : 0}`;
      const isNew = key !== sentenceKey || (!next.sentence.answer && column?.sentence.answer);
      const answeredNow = column && !column.sentence.answer && next.sentence.answer;
      const relit =
        !isNew &&
        !answeredNow &&
        column &&
        (next.sentence.litUpTo !== column.sentence.litUpTo || next.sentence.nyan !== column.sentence.nyan);
      column = next;
      if (isNew) {
        sentenceKey = key;
        chapterLine = pendingChapter;
        pendingChapter = null;
        choices = null;
        choicesFor_ = null;
        drawAll(true);
        makeChoices();
      } else if (relit) {
        drawSentence();
      } else {
        drawAll(false);
      }
    },

    /** The hint was checked or unchecked: the choices are made if needed, and the row changes. */
    hintChanged() {
      if (!column) {
        return;
      }
      layout();
      makeChoices();
    },

    mode,
    choosing,
    bringRobot() {},
    hitRobot: () => Promise.resolve(),
    missRobot: () => Promise.resolve(),
    clearRoad() {},
    hold() {},

    /** A chapter starts (D-80): its title stands above its first sentence. */
    launch(title) {
      pendingChapter = title;
      return Promise.resolve();
    },

    /** The end of the book (D-80): its line stands alone until 「本をえらぶ」. */
    card(lines) {
      el.endTitle.textContent = lines[0][0];
      el.end.dispatchEvent(new CustomEvent("show"));
      return new Promise((resolve) => (endResolve = resolve));
    },

    /** 「本をえらぶ」 on the end of the book. */
    endChosen() {
      endResolve?.();
      endResolve = null;
    },
  };
}

function escape(text) {
  return text.replace(/[&<>"]/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" })[c]);
}
