const SPOKEN_REPLY_MAX_LENGTH = 400;
const SPOKEN_REPLY_REMAINDER = "The rest is on your screen.";
const SPOKEN_REPLY_SCREEN_ONLY = "The answer is on your screen.";
const SCREEN_MENTION = /\bscreen\b/i;

const FALLBACK_SENTENCE_LIMIT = 3;
const INLINE_WORD = /^[\p{L}\p{N}]+(?:[.-][\p{L}\p{N}]+)?$/u;
const TABLE_DELIMITER = /^\s*\|?\s*:?-+:?\s*(?:\|\s*:?-+:?\s*)*\|?\s*$/;
const FENCE_MARKER = /^\s*(`{3,}|~{3,})(.*)$/;
const LIST_MARKER = /^[ \t]*(?:[-+*]|\d+[.)])[ \t]+/;
const HEADING_MARKER = /^[ \t]{0,3}#{1,6}(?:[ \t]+|$)/;
const SETEXT_UNDERLINE = /^[ \t]{0,3}(?:=+|-+)[ \t]*$/;
const THEMATIC_BREAK = /^[ \t]*([*_-])(?:[ \t]*\1){2,}[ \t]*$/;
const INLINE_CODE = /(?<!`)(`+)(?!`)([\s\S]*?)(?<!`)\1(?!`)/g;
const TAG_ATTRIBUTES = String.raw`(?:\s+(?:[\w:-]+\s*=\s*(?:"[^"]*"|'[^']*'|\{[^{}]*\}|[^\s"'=<>]+)|disabled|checked|required|readonly|selected|multiple|hidden|autofocus|open|controls|loop|muted|autoplay|async|defer))*`;
const HTML_BLOCK = new RegExp(
  String.raw`^[ \t]*<([A-Za-z][\w-]*)${TAG_ATTRIBUTES}\s*(?:\/>|>[\s\S]*?<\/\1\s*>)[ \t]*$`,
  "gm",
);
const INLINE_TAG = new RegExp(
  String.raw`(?<!\w)<(?:[A-Za-z][\w-]*${TAG_ATTRIBUTES}\s*\/?)?>|<\/(?:[A-Za-z][\w-]*\s*)?>|<(?:br|hr)\s*\/?>`,
  "g",
);
const AUTOLINK = /<[a-z][a-z\d+.-]*:[^>\s]+>/gi;
// Keep punctuation inside inline markup out of sentence boundary detection.
const UNSPEAKABLE = "\0";
const URL_PREFIX = /^(?!localhost:\d+(?:[/?#]|$))(?:[a-z][a-z\d+.-]*:[^\s\\]|www\.)/i;
const ROOTED_PATH = /^(?:\.{1,2}|~)?\/[^/\s]/;
const RELATIVE_FILE =
  /^[a-z_.][\w.-]*\/[\w.-]+\.[A-Za-z][\w-]*(?::\d+(?:[:-]\d+)?|#L\d+(?:-L\d+)?)?(?:$|[–—…])/;
const SENTENCE_END = /[.!?。！？]+["'”’)\]]*(?= |$)/g;
const ABBREVIATION = /\b(?:Mr|Mrs|Ms|Dr|vs|e\.g|i\.e|a\.m|p\.m)$/i;
const NUMBER_ABBREVIATION = /\b(?:No|Nos|Fig|Figs|p|pp|Vol|Ch|Sec|Eq|approx)$/i;
const DOTTED_INITIALISM = /\b(?:[A-Z]\.)+[A-Z]$/;

export function splitSpokenReply(text: string): { blurb: string; hasOnScreenPart: boolean } {
  const lines = text.split(/\r\n?|\n/);
  const prose: string[] = [];
  let hasDivider = false;
  let fence: string | undefined;
  let droppedContent = false;
  let inIndentedCode = false;
  let listIndent = 0;

  for (const [index, line] of lines.entries()) {
    const [, marker = "", info = ""] = FENCE_MARKER.exec(line) ?? [];
    if (fence) {
      if (marker.startsWith(fence) && info.trim() === "") {
        fence = undefined;
      }
      continue;
    }
    if (marker && (!marker.startsWith("`") || !info.includes("`"))) {
      fence = marker;
      droppedContent = true;
      continue;
    }
    if (line.trim()) {
      const indent = leadingIndent(line);
      if (indent < listIndent) listIndent = 0;
      inIndentedCode = indent >= listIndent + 4 && (inIndentedCode || !lines[index - 1]?.trim());
      if (inIndentedCode) {
        droppedContent = true;
        continue;
      }
      const listMarker = LIST_MARKER.exec(line)?.[0];
      if (listMarker) listIndent = listMarker.replace(/\t/g, "    ").length;
    }
    if (line.trim() === "---") {
      if (!hasDivider) {
        hasDivider = true;
        const cleaned = cleanProse(prose);
        const removed = droppedContent || cleaned.droppedContent;
        if ((cleaned.sentences.length || removed) && cleaned.length <= SPOKEN_REPLY_MAX_LENGTH) {
          return formatReply(
            cleaned.sentences,
            removed || lines.slice(index + 1).some((line) => !!line.trim()),
          );
        }
      }
      droppedContent = true;
      prose.push("");
      continue;
    }
    prose.push(line);
  }

  const cleaned = cleanProse(prose);
  return formatReply(
    cleaned.sentences.slice(0, FALLBACK_SENTENCE_LIMIT),
    droppedContent ||
      cleaned.droppedContent ||
      cleaned.sentences.length > FALLBACK_SENTENCE_LIMIT ||
      cleaned.length > SPOKEN_REPLY_MAX_LENGTH,
  );
}

function cleanProse(lines: string[]) {
  const prose: string[] = [];
  let inTable = false;
  let droppedContent = false;
  for (const [index, line] of lines.entries()) {
    const nextLine = lines[index + 1] ?? "";
    if (line.trim() && nextLine.includes("|") && TABLE_DELIMITER.test(nextLine)) {
      inTable = true;
      droppedContent = true;
      continue;
    }
    if (inTable && line.includes("|")) continue;
    inTable = false;
    prose.push(line);
  }

  const drop = () => {
    droppedContent = true;
    return "";
  };
  const keepLinkLabel = (_match: string, label: string) => {
    droppedContent = true;
    return label;
  };
  let removedImage = false;
  const marked = prose
    .join("\n")
    .replace(/!\[[^\]\n]*\](?:\((?:[^()\n]|\([^()\n]*\))*\)|\[[^\]\n]*\])/g, () => {
      removedImage = true;
      return drop();
    })
    .replace(HTML_BLOCK, drop)
    .replace(INLINE_CODE, (_match, _marker: string, code: string) =>
      INLINE_WORD.test(code) ? code : UNSPEAKABLE,
    )
    .replace(/^[ \t]{0,3}\[[^\]\n]+\]:[ \t]*\S[^\n]*$/gm, drop)
    .replace(/\[([^\]\n]*)\]\((?:[^()\n]|\([^()\n]*\))*\)/g, keepLinkLabel)
    .replace(/\[([^\]\n]+)\]\[[^\]\n]*\]/g, keepLinkLabel)
    .replace(AUTOLINK, UNSPEAKABLE)
    .replace(INLINE_TAG, UNSPEAKABLE)
    .replace(/^[ \t]{0,3}(?:>[ \t]?)+/gm, "");

  const blocks = splitProseBlocks(marked);
  const sentences = blocks.flatMap(({ lines, isListItem }, index) => {
    const text = stripEmphasis(lines.join(" ").replace(/\s+/g, " ").trim());
    const parts = splitSentences(text).filter((sentence) => {
      if (!sentence.includes(UNSPEAKABLE) && !sentence.split(" ").some(isUnspeakableToken)) {
        return true;
      }
      droppedContent = true;
      return false;
    });
    if (removedImage) {
      for (const [index, part] of parts.entries()) {
        parts[index] = part.replace(/[:,;](?:\s*[:,;])*\s*([.!?]+)(?= |$)/g, "$1");
      }
    }
    const last = parts.at(-1);
    if (
      last &&
      (isListItem || index < blocks.length - 1) &&
      !/[.:;!?。！？]["'”’)\]]*$/.test(last) &&
      !(isListItem && /,["'”’)\]]*$/.test(last))
    ) {
      parts[parts.length - 1] = last + ".";
    }
    return parts;
  });
  const spoken = sentences.join(" ");
  return {
    sentences: /[\p{L}\p{N}]/u.test(spoken) ? sentences : [],
    length: spoken.length,
    droppedContent,
  };
}

function splitProseBlocks(text: string) {
  const blocks: { lines: string[]; isListItem: boolean }[] = [];
  let current: string[] = [];
  let listIndent = 0;
  let blank = false;
  const finishBlock = () => {
    if (current.length) blocks.push({ lines: current, isListItem: listIndent > 0 });
    current = [];
    listIndent = 0;
  };

  for (const line of text.split("\n")) {
    if (!line.trim()) {
      blank = true;
      continue;
    }
    if (SETEXT_UNDERLINE.test(line) || THEMATIC_BREAK.test(line)) {
      finishBlock();
      blank = true;
      continue;
    }
    if (HEADING_MARKER.test(line)) {
      finishBlock();
      const heading = line
        .replace(HEADING_MARKER, "")
        .replace(/[ \t]+#+[ \t]*$/, "")
        .trim();
      if (heading) blocks.push({ lines: [heading], isListItem: false });
      blank = false;
      continue;
    }
    const marker =
      !blank && current.length && /^\s*(?:19|20)\d{2}\.\s/.test(line)
        ? undefined
        : LIST_MARKER.exec(line)?.[0];
    if (marker) {
      finishBlock();
      listIndent = marker.replace(/\t/g, "    ").length;
      current.push(line.slice(marker.length).replace(/^\[[ xX]\](?:[ \t]+|$)/, ""));
    } else {
      if (blank && (listIndent === 0 || leadingIndent(line) < listIndent)) finishBlock();
      current.push(line);
    }
    blank = false;
  }
  finishBlock();
  return blocks;
}

function stripEmphasis(text: string) {
  return text
    .replace(
      /(?<!\w)(\*{1,3})(\S(?:.*?\S)?)\1(?!\w)|(?<!\w)(_{1,3})(\S(?:.*?\S)?)\3(?!\w)/g,
      (
        match,
        _stars,
        starred: string | undefined,
        _underscores,
        underscored: string | undefined,
      ) => (match === "__init__" ? match : (starred ?? underscored ?? match)),
    )
    .replace(/~~(\S(?:.*?\S)?)~~/g, "$1");
}

function leadingIndent(line: string) {
  return /^[ \t]*/.exec(line)?.[0].replace(/\t/g, "    ").length ?? 0;
}

function isUnspeakableToken(word: string) {
  const token = word
    .replace(/^[^\p{L}\p{N}_/]+?(?=[\p{L}\p{N}_/]|\.[\p{L}\p{N}_]|\.\.?\/|~\/)/u, "")
    .replace(/(?<=[\p{L}\p{N}_/])(?:['’]s)?[^\p{L}\p{N}_/]*$/u, "");
  return (
    URL_PREFIX.test(token) ||
    ROOTED_PATH.test(token) ||
    token.indexOf("/") !== token.lastIndexOf("/") ||
    RELATIVE_FILE.test(token)
  );
}

function splitSentences(text: string) {
  const sentences: string[] = [];
  let start = 0;
  for (const boundary of text.matchAll(SENTENCE_END)) {
    const end = boundary.index + boundary[0].length;
    if (end < text.length && boundary[0] === ".") {
      const before = text.slice(start, boundary.index);
      const next = text.charAt(end + 1);
      if (
        /\p{Ll}/u.test(next) ||
        (/\p{Nd}/u.test(next) && NUMBER_ABBREVIATION.test(before)) ||
        DOTTED_INITIALISM.test(before) ||
        ABBREVIATION.test(before)
      ) {
        continue;
      }
    }
    sentences.push(text.slice(start, end).trim());
    start = end + 1;
  }
  if (start < text.length) sentences.push(text.slice(start));
  return sentences;
}

function formatReply(kept: string[], hasOnScreenPart: boolean) {
  if (!kept.length) return { blurb: SPOKEN_REPLY_SCREEN_ONLY, hasOnScreenPart: true };
  if (!hasOnScreenPart) return { blurb: kept.join(" "), hasOnScreenPart: false };

  const sentences = kept.filter((sentence) => sentence !== SPOKEN_REPLY_REMAINDER);
  const content = sentences.join(" ");
  if (content.length <= SPOKEN_REPLY_MAX_LENGTH && SCREEN_MENTION.test(sentences.at(-1) ?? "")) {
    return { blurb: content, hasOnScreenPart: true };
  }
  const budget = SPOKEN_REPLY_MAX_LENGTH - SPOKEN_REPLY_REMAINDER.length - 1;
  let excerpt = content;
  if (content.length > budget) {
    const complete = [];
    let length = 0;
    for (const sentence of sentences) {
      length += sentence.length + Number(complete.length > 0);
      if (length > budget) break;
      complete.push(sentence);
    }
    const lastSpace = content.lastIndexOf(" ", budget);
    excerpt = complete.join(" ") || content.slice(0, lastSpace > 0 ? lastSpace : budget);
    if (SCREEN_MENTION.test(complete.at(-1) ?? "")) {
      return { blurb: excerpt, hasOnScreenPart: true };
    }
  }
  return {
    blurb: excerpt ? `${excerpt} ${SPOKEN_REPLY_REMAINDER}` : SPOKEN_REPLY_REMAINDER,
    hasOnScreenPart: true,
  };
}
