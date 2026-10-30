// The answer to a blank (SPEC §5.9; ED D-12, D-29, D-34): right only when it is the word of the
// sentence as written there, ignoring case and the spaces around it; "empty" when nothing was
// typed, which the drill takes as "I do not know", a wrong answer.

/** "right", "wrong" or "empty": the typed text `typed` against the blank's `word`. */
export function judge(typed, word) {
  const answer = typed.trim();
  if (answer === "") {
    return "empty";
  }
  return answer.toLowerCase() === word.toLowerCase() ? "right" : "wrong";
}
