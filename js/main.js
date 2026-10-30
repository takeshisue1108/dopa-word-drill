// The page of ドパドパWordドリル on a phone held upright (SPEC 2.0; ED draft 3). It shows the book
// list (V-08), opens a book (the bundled dictionary, a kept upload, or a new file), hands it to
// the drill (drill.js) over the phone's view (phone/view.js, in the cockpit's place: SPEC SD-10)
// and wires the answer row with 「復習あり」, the sheet of 「メニュー」 and the end of the book. The
// drill sings nothing (SPEC 2.1 SD-17). The page before this one, with the cockpit, is kept as
// main_cockpit.js (SPEC SD-16).
import * as books from "./books/index.js";
import { dictionaryBook } from "./books/oewn.js";
import { createAnalyzer } from "./lang/client.js";
import { createDrill, hasEnglish } from "./drill.js";
import { createView } from "./phone/view.js";
import * as silentSong from "./silent_song.js";
import * as prefs from "./store/prefs.js";
import * as shelf from "./store/shelf.js";
import { fill, S } from "./strings.js";

const $ = (id) => document.getElementById(id);

let bundled = []; // data/books/index.json
let book = null;
let drill = null;
let view = null;

// ---------------------------------------------------------------- the column and the keyboard
/** The column takes the height the keyboard leaves free, and follows the visual viewport when
 * the page is scrolled under the keyboard (SPEC SD-13). */
function fit() {
  const viewport = window.visualViewport;
  if (!viewport) {
    return;
  }
  $("app").style.height = `${viewport.height}px`;
  $("app").style.transform = `translateY(${viewport.offsetTop}px)`;
}

// ---------------------------------------------------------------- boot
async function boot() {
  if (window.visualViewport) {
    visualViewport.addEventListener("resize", fit);
    visualViewport.addEventListener("scroll", fit);
  }
  fit();

  view = createView({
    el: {
      read: $("read"),
      next: $("next"),
      go: $("go"),
      end: $("end"),
      endTitle: $("end-title"),
      endBooks: $("end-books"),
    },
  });
  $("end").addEventListener("show", () => show("end"));

  drill = createDrill({
    cockpit: view,
    song: silentSong,
    analyzer: createAnalyzer(),
    store: prefs,
    random: Math.random,
    hooks: {
      frames: (callback) => requestAnimationFrame(callback),
      focus: () => focusAnswer(),
      onSentence: (n, total) => {
        $("sentence-of").textContent = fill(S.sentenceOf, { n, total });
      },
      describe: (name, description) => {
        $("answer").setAttribute("aria-label", name || S.blank);
        $("answer-description").textContent = description;
        $("live").textContent = description;
      },
      sfx: () => {}, // no sound effects (ED D-65)
      onNotice: notice,
      onBookEnd: () => showList(),
    },
  });

  try {
    const response = await fetch("data/books/index.json");
    bundled = await response.json();
  } catch {
    bundled = [];
  }

  wireControls();
  $("loading").hidden = true;
  showList();
}

// ---------------------------------------------------------------- pages
function show(id) {
  for (const page of ["books", "drill", "end"]) {
    $(page).hidden = page !== id;
  }
}

// ---------------------------------------------------------------- the book list (V-08)
/** The book list (ED D-81): 「続きから」 with the books read before, 「収録の本」, 「ファイルから」.
 * With a book open, 「戻る」 returns to the same sentence; the drill is held meanwhile. */
async function showList() {
  if (book) {
    drill.hold(true);
  }
  $("answer").blur();
  show("books");
  $("list-back").hidden = !book || view.mode() === "none";
  const list = $("list");
  list.replaceChildren();

  const add = (tag, props = {}, parent = list) => {
    const element = document.createElement(tag);
    Object.assign(element, props);
    return parent.appendChild(element);
  };
  const bookButton = (title, author, onclick, parent) => {
    const button = add("button", { className: "book", onclick }, parent);
    add("span", { className: "t", textContent: title }, button);
    if (author) {
      add("span", { className: "a", textContent: author }, button);
    }
    return button;
  };

  // 「続きから」: books read before, the latest first (uploads only while still kept)
  const kept = new Set(await shelf.keys());
  const recent = prefs.recent().filter((place) =>
    place.key.startsWith("file:") ? kept.has(place.key) : bundled.some((known) => known.key === place.key),
  );
  if (recent.length) {
    add("h2", { textContent: S.recent });
    const group = add("ul");
    for (const place of recent) {
      const entry = bundled.find((known) => known.key === place.key);
      const row = add("li", {}, group);
      bookButton(entry ? entry.title : place.title || place.key, entry ? entry.author : "", () => openKey(place.key), row);
      add(
        "button",
        {
          className: "forget",
          textContent: S.forget,
          onclick: async () => {
            prefs.forget(place.key);
            if (place.key.startsWith("file:")) {
              await shelf.remove(place.key);
            }
            showList();
          },
        },
        row,
      );
    }
  }

  add("h2", { textContent: S.bundled });
  const group = add("ul");
  for (const entry of bundled) {
    bookButton(entry.title, entry.author, () => openKey(entry.key), add("li", {}, group));
  }

  add("h2", { textContent: S.fromFile });
  const input = add("input", { type: "file", accept: ".txt,.md,.pdf", hidden: true });
  input.onchange = () => {
    if (input.files[0]) {
      openFile(input.files[0]);
    }
  };
  add("button", { className: "plain", textContent: S.chooseFile, onclick: () => input.click() });
}

/** 「戻る」 on the list: the drill comes back as it was (V-08). */
function closeList() {
  show("drill");
  drill.hold(false);
}

function listMessage(text) {
  $("list-message").textContent = text;
}

function listCharge(percent) {
  listMessage("");
  $("loading").hidden = false;
  $("loading").textContent = fill(S.loading, { n: Math.round(percent) });
}

// ---------------------------------------------------------------- opening a book
async function openKey(key) {
  if (key.startsWith("file:")) {
    const record = await shelf.get(key);
    if (!record) {
      return listMessage(S.noText);
    }
    return openBytes(record.name, new Uint8Array(record.bytes), key);
  }
  const entry = bundled.find((known) => known.key === key);
  if (!entry) {
    return;
  }
  listCharge(0);
  try {
    const response = await fetch(entry.path);
    if (entry.kind === "dictionary") {
      const rows = await response.json();
      listCharge(60);
      return start(dictionaryBook(rows));
    }
    const bytes = new Uint8Array(await response.arrayBuffer());
    listCharge(60);
    const folder = entry.path.replace(/[^/]+$/, "");
    start(await books.parseFile({ name: "text.txt", bytes, key, imageBase: folder }));
  } catch (error) {
    failed(error.message || S.noText);
  }
}

async function openFile(file) {
  listCharge(0);
  const bytes = new Uint8Array(await file.arrayBuffer());
  listCharge(40);
  await openBytes(file.name, bytes, await shelf.keyOf(bytes), true);
}

/** Read a file's bytes as a book and start the drill on it; with `keep`, the file is first kept in
 * the browser. A book with no English sentence is refused, and not kept (D-51, ST-33). */
async function openBytes(name, bytes, key, keep = false) {
  try {
    const opened = await books.parseFile({ name, bytes, key });
    if (!hasEnglish(opened)) {
      return failed(S.noEnglish);
    }
    if (keep) {
      await shelf.keep(key, { name, type: "", bytes });
    }
    start(opened);
  } catch (error) {
    failed(error.code === "pdf" ? S.badFormat : error.message || S.noText);
  }
}

function failed(text) {
  $("loading").hidden = true;
  listMessage(text);
}

/** The drill on `opened`, at its kept place (ST-34). */
function start(opened) {
  $("loading").hidden = true;
  listMessage("");
  if (book && book !== opened) {
    book.pdfDocument?.destroy();
  }
  book = opened;
  prefs.setPosition(book.key, { title: book.title });
  show("drill");
  // inside the touch that chose the book, so that the keyboard opens (SPEC SD-13)
  $("answer").focus();
  drill.open(book);
}

// ---------------------------------------------------------------- the answer row
function wireControls() {
  // 「復習あり」 (SPEC 2.1 SD-19): checked at first, kept as the user leaves it
  $("review").checked = prefs.settings().review !== false;
  $("review").addEventListener("change", () => {
    prefs.setSetting("review", $("review").checked);
    drill.reviewsChanged();
    focusAnswer(); // inside the touch, so that the keyboard stays open (SPEC SD-13)
  });

  $("answer").addEventListener("input", () => {
    if (view.mode() === "asking") {
      drill.type($("answer").value);
    } else {
      $("answer").value = "";
    }
  });
  $("answer").addEventListener("keydown", (event) => {
    if (event.key === "Enter" && !event.isComposing) {
      event.preventDefault();
      press();
    }
  });
  // the button keeps the focus in the answer field, so that the keyboard stays open (D-75)
  $("go").addEventListener("pointerdown", (event) => event.preventDefault());
  $("go").addEventListener("click", () => press());

  $("open-menu").addEventListener("click", openSheet);
  $("shade").addEventListener("click", () => closeSheet());
  $("sheet").addEventListener("click", sheetChoice);
  $("list-back").addEventListener("click", closeList);
  $("end-books").addEventListener("click", () => view.endChosen());
}

/** 「答える」, 「次へ」 or the return key: the drill answers what was typed, or goes on after a miss
 * or a sentence without a blank (D-78). */
function press() {
  drill.fire();
  $("answer").value = "";
}

/** The answer field takes the focus, unless the sheet is open. Outside a touch, iOS opens no
 * keyboard, but a field that has the focus keeps it (SPEC SD-13). */
function focusAnswer() {
  if ($("sheet").hidden && !$("drill").hidden) {
    $("answer").focus();
  }
}

// ---------------------------------------------------------------- the sheet (V-10, V-11, V-13, V-14)
function openSheet() {
  drill.hold(true); // the drill is held while the sheet is open (ED ST-49)
  $("answer").blur();
  $("sheet-main").hidden = false;
  $("sheet-sub").hidden = true;
  $("sheet").hidden = false;
  requestAnimationFrame(() => {
    $("sheet").classList.add("open");
    $("shade").classList.add("open");
  });
}

function closeSheet(refocus = true) {
  $("sheet").classList.remove("open");
  $("shade").classList.remove("open");
  $("sheet").hidden = true;
  drill.hold(false);
  if (refocus) {
    focusAnswer();
  }
}

function subPage(title, fillIn) {
  const sub = $("sheet-sub");
  sub.replaceChildren();
  const heading = document.createElement("h3");
  heading.textContent = title;
  sub.append(heading);
  fillIn(sub);
  const back = document.createElement("button");
  Object.assign(back, { className: "item", textContent: S.back });
  back.onclick = () => {
    $("sheet-main").hidden = false;
    sub.hidden = true;
  };
  sub.append(back);
  $("sheet-main").hidden = true;
  sub.hidden = false;
}

function sheetChoice(event) {
  const act = event.target.closest("button")?.dataset.act;
  if (act === "close") {
    closeSheet();
  } else if (act === "books") {
    closeSheet(false);
    showList();
  } else if (act === "contents") {
    subPage(S.contents, (sub) => {
      book.chapters.forEach((chapter, chapterIndex) => {
        const button = document.createElement("button");
        Object.assign(button, { className: "item", textContent: chapter.title || book.title });
        button.onclick = () => {
          closeSheet();
          drill.jump(chapterIndex);
        };
        sub.append(button);
      });
    });
  } else if (act === "credits") {
    subPage(S.credits_, (sub) => {
      const lines = document.createElement("div");
      lines.className = "sub";
      for (const line of [...S.credits, ...S.fontCredits]) {
        lines.append(line, document.createElement("br"));
      }
      const link = document.createElement("a");
      Object.assign(link, { href: "LICENSES.md", target: "_blank", rel: "noopener", textContent: S.licenses });
      lines.append(link);
      sub.append(lines);
    });
  }
}

// ---------------------------------------------------------------- notices
let noticeTimer = null;
/** A notice under the reading area (読み込み中), which goes after 6 s;
 * `notice(null, which)` takes `which` away if it is shown. */
function notice(text, which) {
  const line = $("notice");
  if (text === null) {
    if (line.textContent === which) {
      line.textContent = "";
    }
    return;
  }
  line.textContent = text;
  clearTimeout(noticeTimer);
  if (text !== S.songLoading) {
    noticeTimer = setTimeout(() => (line.textContent = ""), 6000);
  }
}

// for the browser checks (tools/site/e2e_phone2.mjs)
globalThis.ddr = {
  drill: () => drill.debug(),
  view: () => ({ mode: view.mode() }),
};

boot();
