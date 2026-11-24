import { describe, expect, it } from "vitest";

import { splitSpokenReply } from "./spokenReply";

describe("splitSpokenReply", () => {
  it.each([
    ["divider after a blank line", "It worked.\n\n  --- \nDetails.", "It worked.", true],
    ["divider without a blank line", "It worked.\r\n---\r\nDetails.", "It worked.", true],
    ["first divider", "It worked.\n---\nDetails.\n---\nMore.", "It worked.", true],
    ["whitespace after the divider", "It worked.\n---\n  \n", "It worked.", false],
    ["short plain reply", "  It  worked.\nThank you. ", "It worked. Thank you.", false],
    [
      "divider inside a backtick fence",
      "It worked.\n````text\n```\n---\nSecret.\n````\nAll done.",
      "It worked. All done. The rest is on your screen.",
      true,
    ],
    [
      "divider inside a tilde fence before a real divider",
      "It worked.\n~~~text\n---\nSecret.\n~~~\nAll done.\n---\nDetails.",
      "It worked. All done.",
      true,
    ],
    [
      "code, links, and a table",
      "See [the guide](https://example.com/a_(b)).\n\nUse this: `run`.\n\nName | Value\n--- | ---\nA | 1\n\n```sh\nrun\n```",
      "See the guide. Use this: run. The rest is on your screen.",
      true,
    ],
    ["code-only reply", "```ts\nconsole.log(42);\n```", "I've put it on your screen.", true],
    [
      "inline command between words",
      "Use `git reset --soft HEAD~1` to undo the last commit.",
      "Use the snippet on your screen to undo the last commit. The rest is on your screen.",
      true,
    ],
    [
      "single word in inline code",
      "A JavaScript `Map` iterates keys in insertion order.",
      "A JavaScript Map iterates keys in insertion order.",
      false,
    ],
    [
      "inline path between words",
      "Open `src/app/main.ts` to see it.",
      "Open the snippet on your screen to see it. The rest is on your screen.",
      true,
    ],
    [
      "inline expression between words",
      "Then `map.get(key)` returns undefined.",
      "Then the snippet on your screen returns undefined. The rest is on your screen.",
      true,
    ],
    [
      "inline command before sentence punctuation",
      "Run `git branch -a`. It lists all branches.",
      "Run the snippet on your screen. It lists all branches. The rest is on your screen.",
      true,
    ],
    [
      "bare URL with sentence punctuation",
      "I opened https://example.com/pull/12. Please review it.",
      "I opened a link. Please review it. The rest is on your screen.",
      true,
    ],
    [
      "autolinks",
      "See <https://example.com/docs> or contact <mailto:team@example.com>.",
      "See a link or contact a link. The rest is on your screen.",
      true,
    ],
    [
      "reference links and definitions",
      "See [the docs][1] or [the guide][].\n\n[1]: https://example.com/docs\n[the guide]: ./guide.md",
      "See the docs or the guide. The rest is on your screen.",
      true,
    ],
    [
      "indented code block",
      "Run this:\n\n    npm install foo\n\tnpm run check\n\nDone.",
      "Run this: Done. The rest is on your screen.",
      true,
    ],
    [
      "indented list continuation before a code block",
      "1. Start here\n\n    and keep reading.\n\nDone.\n\n    npm install foo",
      "Start here and keep reading. Done. The rest is on your screen.",
      true,
    ],
    ["fence before a trailing divider", "Done.\n```ts\nx()\n```\n---\n", "Done.", true],
    ["table before a trailing divider", "Done.\n\nA | B\n--- | ---\n1 | 2\n---\n", "Done.", true],
    ["image before a trailing divider", "Done. ![shot](a.png)\n---\n", "Done.", true],
    ["setext heading", "Title\n===\nBody text.", "Title Body text.", false],
    ["task list", "- [ ] Task one.\n- [x] Task two.", "Task one. Task two.", false],
    ["multiline emphasis", "**Bold\ntext** here.", "Bold text here.", false],
    ["strikethrough", "This is ~~wrong~~ right.", "This is wrong right.", false],
    ["blockquote", "> Quoted note here.\n\nDone.", "Quoted note here. Done.", false],
    ["thematic break", "Done.\n\n***\n\nMore.", "Done. More.", false],
    ["inline HTML tags", "Click <kbd>Cmd</kbd> now.", "Click Cmd now.", false],
    [
      "absolute and relative file paths",
      "I edited /Users/joe/src/app/main.ts and src/app.ts, then checked ./README.md.",
      "I edited a file and a file, then checked a file. The rest is on your screen.",
      true,
    ],
    [
      "slash-joined names",
      "I set up the React/Next.js app and the TypeScript/Node.js server.",
      "I set up the React/Next.js app and the TypeScript/Node.js server.",
      false,
    ],
    ["decimal ratio", "Rated 4.5/5.0 by users.", "Rated 4.5/5.0 by users.", false],
    ["multiplier ratio", "Ratio is 1.5x/2.0x now.", "Ratio is 1.5x/2.0x now.", false],
    [
      "relative files",
      "See src/index.ts, src/App.tsx and apps/web/src/Foo.tsx.",
      "See a file, a file and a file. The rest is on your screen.",
      true,
    ],
    [
      "host path",
      "I opened github.com/foo/bar/pull/12 for you.",
      "I opened a link for you. The rest is on your screen.",
      true,
    ],
    [
      "host path beside a bare domain",
      "Docs at www.example.com/docs and example.com.",
      "Docs at a link and example.com. The rest is on your screen.",
      true,
    ],
    [
      "code inside a numbered list item",
      "1. Step one:\n\n        npm install\n\n2. Step two.",
      "Step one: Step two. The rest is on your screen.",
      true,
    ],
    [
      "code inside a bullet list item",
      "- item\n\n        code here\n\nAfter.",
      "item After. The rest is on your screen.",
      true,
    ],
    [
      "URL within a sentence",
      "Opened the PR at https://github.com/foo/bar/pull/12 for you.",
      "Opened the PR at a link for you. The rest is on your screen.",
      true,
    ],
    [
      "path within a sentence",
      "I edited /Users/joe/src/app/main.ts and it builds.",
      "I edited a file and it builds. The rest is on your screen.",
      true,
    ],
    [
      "paths in a comma-separated list",
      "Done. Files: ./a.ts, ../b.ts.",
      "Done. Files: a file, a file. The rest is on your screen.",
      true,
    ],
    [
      "parenthesized URL",
      "See (https://example.com/a) now.",
      "See (a link) now. The rest is on your screen.",
      true,
    ],
    [
      "parenthesized URL with balanced internal parentheses",
      "See (https://example.com/a_(b)).",
      "See (a link). The rest is on your screen.",
      true,
    ],
    [
      "punctuation left after dropping images",
      "Done: ![one](a.png), ![two](b.png).",
      "Done. The rest is on your screen.",
      true,
    ],
    [
      "comparison with angle brackets",
      "If a <b and c> d then fine.",
      "If a <b and c> d then fine.",
      false,
    ],
    [
      "generic type beside inline formatting",
      "It returns Promise<string> and a <b>bold</b> value.",
      "It returns Promise<string> and a bold value.",
      false,
    ],
    [
      "inline commands joined by commas and and",
      "Run `npm test`, `npm run lint` and `npm run build`.",
      "Run the snippets on your screen. The rest is on your screen.",
      true,
    ],
    [
      "inline commands joined with an Oxford comma and or",
      "Run `npm test`, `npm run lint`, or `npm run build`.",
      "Run the snippets on your screen. The rest is on your screen.",
      true,
    ],
    [
      "empty blurb before the divider",
      "\n---\nHere is the result.",
      "Here is the result. The rest is on your screen.",
      true,
    ],
    [
      "Markdown in a divider blurb",
      "## **Done**\n- Read [the guide](https://example.com).\n1. _Try again._ ![screenshot](image.png)\n---\nDetails.",
      "Done Read the guide. Try again.",
      true,
    ],
    [
      "more than three sentences",
      "One. Two! Three? Four.",
      "One. Two! Three? The rest is on your screen.",
      true,
    ],
  ] as const)("%s", (_name, text, blurb, hasOnScreenPart) => {
    expect(splitSpokenReply(text)).toEqual({ blurb, hasOnScreenPart });
  });

  it("falls back when the divider blurb exceeds the length cap", () => {
    expect(splitSpokenReply(`Start here. ${"extra ".repeat(80)}\n---\nDetails.`)).toEqual({
      blurb: "Start here. The rest is on your screen.",
      hasOnScreenPart: true,
    });
  });

  it("caps a long first sentence", () => {
    const { blurb, hasOnScreenPart } = splitSpokenReply("word ".repeat(100));
    expect(blurb.length).toBeLessThanOrEqual(400);
    expect(blurb).toMatch(/^word(?: word)*[.!?]? The rest is on your screen\.$/);
    expect(hasOnScreenPart).toBe(true);
  });
});
