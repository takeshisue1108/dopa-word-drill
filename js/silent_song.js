// The song that never sings (SPEC 2.1 SD-17; ED D-86): it stands in the place of sing/index.js for
// the drill, which keeps its song code unchanged (ED G-07). prepare() makes nothing to sing, so the
// drill never enqueues a sentence, and a right answer goes on 1.2 s after it (ED D-75).

export function setScorer() {}

export async function start() {}

/** Nothing to sing: the drill takes null as a sentence without a song. */
export async function prepare() {
  return null;
}

export function enqueue() {
  return null;
}

export function slotTimes() {
  return null;
}

export function now() {
  return 0;
}

export function audioContext() {
  return null;
}

export function clear() {}
