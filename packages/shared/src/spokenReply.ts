export const SPOKEN_REPLY_MAX_LENGTH = 400;
export const SPOKEN_REPLY_REMAINDER = "The rest is on your screen.";
export const SPOKEN_REPLY_SCREEN_ONLY = "I've put it on your screen.";

const FALLBACK_SENTENCE_LIMIT = 3;
const TABLE_DELIMITER = /^\s*\|?\s*:?-+:?\s*(?:\|\s*:?-+:?\s*)*\|?\s*$/;
const FENCE_MARKER = /^\s*(`{3,}|~{3,})(.*)$/;

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
        const { spoken } = cleanProse(prose);
        if (spoken.length > 0 && spoken.length <= SPOKEN_REPLY_MAX_LENGTH) {
          return {
            blurb: spoken,
            hasOnScreenPart: lines.slice(index + 1).some((line) => !!line.trim()),
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
  const spoken = prose
    .join("\n")
    .replace(/(?<!`)(`+)(?!`)[\s\S]*?(?<!`)\1(?!`)/g, drop)
    .replace(
      /(!?)\[([^\]\n]*)\]\((?:[^()\n]|\([^()\n]*\))*\)/g,
      (_match, image: string, label: string) => {
        droppedContent = true;
        return image ? "" : label;
      },
    )
    .replace(/^\s{0,3}#{1,6}(?:[ \t]+|$)/gm, "")
    .replace(/[ \t]+#+[ \t]*$/gm, "")
    .replace(/^[ \t]*(?:[-+*]|\d+[.)])[ \t]+/gm, "")
    .replace(/(\*{1,3})(\S(?:.*?\S)?)\1|(?<!\w)(_{1,3})(\S(?:.*?\S)?)\3(?!\w)/g, "$2$4")
    .replace(/\s+/g, " ")
    .replace(/([:;]) +[.!?](?= |$)/g, "$1")
    .replace(/ +([,.!?])/g, "$1")
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
