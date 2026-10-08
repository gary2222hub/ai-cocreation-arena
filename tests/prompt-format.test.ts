import assert from "node:assert/strict";
import test from "node:test";

import { parsePrompt } from "../src/prompt-format.ts";

test("prompt formatter separates paragraphs, numbered tasks, and requirements", () => {
  const blocks = parsePrompt("开场说明。\n\n请完成：\n1. 第一项\n2. 第二项\n\n要求：\n- 不得编造\n- 不超过700字");
  assert.deepEqual(blocks, [
    { type: "paragraph", text: "开场说明。" },
    { type: "label", text: "请完成：" },
    { type: "ordered", items: ["第一项", "第二项"] },
    { type: "label", text: "要求：" },
    { type: "unordered", items: ["不得编造", "不超过700字"] },
  ]);
});

test("prompt formatter turns plain task lines under Chinese labels into readable lists", () => {
  const blocks = parsePrompt("背景说明。\n请完成以下内容：\n给同事起一个名字。\n描述一个具体场景。\n说明人机边界。\n要求：\n不得编造。\n总字数不超过700字。");
  assert.deepEqual(blocks, [
    { type: "paragraph", text: "背景说明。" },
    { type: "label", text: "请完成以下内容：" },
    { type: "unordered", items: ["给同事起一个名字。", "描述一个具体场景。", "说明人机边界。"] },
    { type: "label", text: "要求：" },
    { type: "unordered", items: ["不得编造。", "总字数不超过700字。"] },
  ]);
});
