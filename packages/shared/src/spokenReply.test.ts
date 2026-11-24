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
      "See the guide. Use this: The rest is on your screen.",
      true,
    ],
    [
      "code-only reply",
      "```ts\nconsole.log(42);\n```",
      "I've put it on your screen.",
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
