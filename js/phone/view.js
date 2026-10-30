// The drill's screen on a phone held upright (SPEC 2.0 SD-10, §2.0.2, 2.1; ED draft 3 V-09, V-12,
// ST-35 to ST-51, D-85, ED-13). It takes the cockpit's place for drill.js and has its methods: the
// robot's do nothing and resolve at once (ED D-65), launch() gives its title to the chapter line of
// the next sentence (D-80), and card() shows the end of the book until 「本をえらぶ」 (D-80).
//
// The column drill.js shows (cockpit/column.js had it) is { sentence: { text, blank, answer,
// litUpTo, nyan }, review, meaning, waitingReview, typed, ... }: `blank` is { start, end, word }
// in `text`, or null without a blank; `answer` is { typed, right } once answered.
import { S } from "../strings.js";

const REVIEW_MARK =
  '<span class="mark"><svg viewBox="0 0 16 16" aria-hidden="true"><path d="M4 6h6a4 4 0 0 1 0 8H6" fill="none" stroke="currentColor" stroke-width="2"/><path d="M6 2 2 6l4 4" fill="none" stroke="currentColor" stroke-width="2"/></svg>' +
  S.review +
  "</span>";

/** The view over the page's elements `el` ({ read, next, go, end, endTitle, endBooks }). */
export function createView({ el }) {
  let column = null;
  let chapterLine = null; // the title given by launch(), for the next sentence (D-80)
  let pendingChapter = null;
  let sentenceKey = null; // what makes a sentence new: its text and its blank
  let endResolve = null;

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
    const state = mode();
    el.go.textContent = state === "missed" || state === "noblank" ? S.nextSentence : S.answer;
  }

  return {
    showColumn(next) {
      if (!next) {
        column = null;
        sentenceKey = null;
        el.read.innerHTML = "";
        el.next.innerHTML = "";
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
        drawAll(true);
      } else if (relit) {
        drawSentence();
      } else {
        drawAll(false);
      }
    },

    mode,
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
