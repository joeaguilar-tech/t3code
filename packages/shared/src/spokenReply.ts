const SPOKEN_REPLY_MAX_LENGTH = 400;
const SPOKEN_REPLY_REMAINDER = "The rest is on your screen.";
const SPOKEN_REPLY_SCREEN_ONLY = "I've put it on your screen.";
const SPOKEN_REPLY_INLINE_CODE = "the snippet on your screen";
const SPOKEN_REPLY_INLINE_CODE_PLURAL = "the snippets on your screen";
const SPOKEN_REPLY_URL = "a link";
const SPOKEN_REPLY_PATH = "a file";

const FALLBACK_SENTENCE_LIMIT = 3;
const INLINE_WORD_MAX_LENGTH = 32;
const INLINE_WORD = /^[\p{L}\p{N}]+(?:[._-][\p{L}\p{N}]+)*$/u;
const TABLE_DELIMITER = /^\s*\|?\s*:?-+:?\s*(?:\|\s*:?-+:?\s*)*\|?\s*$/;
const FENCE_MARKER = /^\s*(`{3,}|~{3,})(.*)$/;
const LIST_MARKER = /^[ \t]*(?:[-+*]|\d+[.)])[ \t]+/;
const ROOTED_PATH =
  /(?<![\w./\\])(?:[A-Za-z]:|~|\.{1,2}|\.[\w-][\w.-]*)?[/\\][\w.-]+(?:[/\\][\w.-]+)*(?<=[\w-])/;
const RELATIVE_FILE_PATH =
  /(?<![\w./\\])(?=[a-z_.]|[\w.-]+(?:[/\\][\w.-]+)*[/\\][a-z_])[\w.-]+(?:[/\\][\w.-]+)*[/\\][\w-]+(?:\.[A-Za-z][\w-]*)+/;
const FILE_PATH = new RegExp(
  String.raw`(?:\b([Tt]he|[Tt]his|[Tt]hat|[Yy]our|[Aa]n?)\s+)?(?:${ROOTED_PATH.source}|${RELATIVE_FILE_PATH.source})(?:\s+(file|folder)\b(?![./\\-][\w.-]))?`,
  "g",
);
const BARE_URL =
  /(?<![\w./\\@-])(?:(?:https?|ftp):\/\/[^\s<>"']+|(?:[\w-]+(?:\.[\w-]+)*\.(?!(?:js|ts|jsx|tsx|mjs|cjs|json|md|py|rb|rs|go|sh|css|html|ya?ml|toml|txt)\/)[a-z]{2,}|(?:localhost|\d{1,3}(?:\.\d{1,3}){3})(?::\d+)?)\/[^\s<>"']*)/gi;
const INLINE_FORMATTING_TAG = /^(?:b|i|em|strong|u|s|del|kbd|code|sub|sup|mark|br|span)$/i;
const INLINE_CODE_RUN = new RegExp(
  `\\b${SPOKEN_REPLY_INLINE_CODE}(?:(?:,\\s*(?:(?:and|or)\\s+)?|\\s+(?:and|or)\\s+)${SPOKEN_REPLY_INLINE_CODE}\\b)+`,
  "g",
);

function urlSuffix(url: string) {
  let depth = 0;
  for (let index = 0; index < url.length; index++) {
    const character = url[index];
    if (character === "(") depth++;
    if (character !== ")") continue;
    if (depth === 0) return url.slice(index);
    depth--;
  }
  return /[.,!?;:]+$/.exec(url)?.[0] ?? "";
}

export function splitSpokenReply(text: string): { blurb: string; hasOnScreenPart: boolean } {
  const lines = text.split(/\r\n?|\n/);
  const prose: string[] = [];
  let hasDivider = false;
  let fence: string | undefined;
  let droppedContent = false;

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
    if (line.trim() === "---") {
      if (!hasDivider) {
        hasDivider = true;
        const { spoken, droppedContent: droppedFromBlurb } = cleanProse(prose);
        if (spoken.length > 0 && spoken.length <= SPOKEN_REPLY_MAX_LENGTH) {
          return {
            blurb: spoken,
            hasOnScreenPart:
              droppedContent ||
              droppedFromBlurb ||
              lines.slice(index + 1).some((line) => !!line.trim()),
          };
        }
      }
      droppedContent = true;
      continue;
    }
    prose.push(line);
  }

  const cleaned = cleanProse(prose);
  return fallbackReply(cleaned.spoken, droppedContent || cleaned.droppedContent);
}

function cleanProse(lines: string[]) {
  const prose: string[] = [];
  let inTable = false;
  let inIndentedCode = false;
  let listIndent = 0;
  let droppedContent = false;
  for (const [index, line] of lines.entries()) {
    if (line.trim()) {
      const indent = /^[ \t]*/.exec(line)?.[0].replace(/\t/g, "    ").length ?? 0;
      if (indent < listIndent) listIndent = 0;
      inIndentedCode = indent >= listIndent + 4 && (inIndentedCode || !lines[index - 1]?.trim());
      if (inIndentedCode) {
        droppedContent = true;
        continue;
      }
      const listMarker = LIST_MARKER.exec(line)?.[0];
      if (listMarker) listIndent = listMarker.replace(/\t/g, "    ").length;
    }
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
  const keepLinkLabel = (_match: string, image: string, label: string) => {
    droppedContent = true;
    return image ? "" : label;
  };
  const replaceUrl = (suffix = "") => {
    droppedContent = true;
    return SPOKEN_REPLY_URL + suffix;
  };
  const replacePath = (_match: string, determiner?: string, label?: string) => {
    droppedContent = true;
    if (!determiner && !label) return SPOKEN_REPLY_PATH;
    const article = determiner?.replace(/n$/, "") ?? "a";
    return `${article} ${label ?? "file"}`;
  };
  const spoken = prose
    .join("\n")
    .replace(/(?<!`)(`+)(?!`)([\s\S]*?)(?<!`)\1(?!`)/g, (_match, _marker: string, code: string) => {
      if (code.length <= INLINE_WORD_MAX_LENGTH && INLINE_WORD.test(code)) {
        return code;
      }
      droppedContent = true;
      return SPOKEN_REPLY_INLINE_CODE;
    })
    .replace(/^[ \t]{0,3}\[[^\]\n]+\]:[ \t]*\S[^\n]*$/gm, drop)
    .replace(/(!?)\[([^\]\n]*)\]\((?:[^()\n]|\([^()\n]*\))*\)/g, keepLinkLabel)
    .replace(/(!?)\[([^\]\n]+)\]\[[^\]\n]*\]/g, keepLinkLabel)
    .replace(/<(?:https?|ftp|mailto):[^>\s]+>/gi, () => replaceUrl())
    .replace(BARE_URL, (url) => replaceUrl(urlSuffix(url)))
    .replace(
      /(?<!\w)<([A-Za-z][\w-]*)(?:\s+[\w:-]+\s*=\s*(?:"[^"]*"|'[^']*'|[^\s"'=<>`]+))*\s*\/?>|<\/([A-Za-z][\w-]*)\s*>/g,
      (_match, opening: string | undefined, closing: string | undefined) => {
        if (INLINE_FORMATTING_TAG.test(opening ?? closing ?? "")) return "";
        droppedContent = true;
        return SPOKEN_REPLY_INLINE_CODE;
      },
    )
    .replace(FILE_PATH, replacePath)
    .replace(/^[ \t]{0,3}(?:>[ \t]?)+/gm, "")
    .replace(/^[ \t]*(?:=+|-+|([*_-])(?:[ \t]*\1){2,})[ \t]*$/gm, "")
    .replace(/^[ \t]{0,3}#{1,6}(?:[ \t]+|$)/gm, "")
    .replace(/[ \t]+#+[ \t]*$/gm, "")
    .replace(/^[ \t]*(?:[-+*]|\d+[.)])[ \t]+(?:\[[ xX]\](?:[ \t]+|$))?/gm, "")
    .replace(/\s+/g, " ")
    .replace(INLINE_CODE_RUN, SPOKEN_REPLY_INLINE_CODE_PLURAL)
    .replace(/(\*{1,3})(\S(?:.*?\S)?)\1|(?<!\w)(_{1,3})(\S(?:.*?\S)?)\3(?!\w)/g, "$2$4")
    .replace(/~~(\S(?:.*?\S)?)~~/g, "$1")
    .replace(/[,;:]\s*(?:[,;:]\s*)*([.!?]+)(?= |$)/g, "$1")
    .replace(/([:;]) +[.!?](?= |$)/g, "$1")
    .replace(/ +([,.!?])(?=\s|$)/g, "$1")
    .trim();
  return { spoken: /[\p{L}\p{N}]/u.test(spoken) ? spoken : "", droppedContent };
}

function fallbackReply(spoken: string, droppedContent: boolean) {
  if (!spoken) return { blurb: SPOKEN_REPLY_SCREEN_ONLY, hasOnScreenPart: true };

  const sentenceEnds: number[] = [];
  for (const boundary of spoken.matchAll(/[.!?。！？]+["'”’)]*(?= |$)/g)) {
    sentenceEnds.push(boundary.index + boundary[0].length);
    if (sentenceEnds.length === FALLBACK_SENTENCE_LIMIT) break;
  }

  const end = sentenceEnds[FALLBACK_SENTENCE_LIMIT - 1] ?? spoken.length;
  if (!droppedContent && end === spoken.length && end <= SPOKEN_REPLY_MAX_LENGTH) {
    return { blurb: spoken, hasOnScreenPart: false };
  }

  const budget = SPOKEN_REPLY_MAX_LENGTH - SPOKEN_REPLY_REMAINDER.length - 1;
  let excerpt = spoken.slice(0, end);
  if (excerpt.length > budget) {
    const completeSentence = sentenceEnds.filter((end) => end <= budget).at(-1);
    const lastSpace = spoken.lastIndexOf(" ", budget);
    excerpt = spoken.slice(0, completeSentence ?? (lastSpace > 0 ? lastSpace : budget));
  }
  return { blurb: `${excerpt} ${SPOKEN_REPLY_REMAINDER}`, hasOnScreenPart: true };
}
