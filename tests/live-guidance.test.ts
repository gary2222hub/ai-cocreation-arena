import assert from "node:assert/strict";
import test from "node:test";

import { buildAdvanceWarning, buildAiScoringBrief, buildOpeningScript, rankForScore } from "../src/live-guidance.ts";

test("opening script explains how participants use the activity and its irreversible stages", () => {
  const script = buildOpeningScript("明日活动");
  assert.match(script, /明日活动/);
  assert.match(script, /阶段一旦结束/);
  assert.match(script, /不能补交/);
  assert.match(script, /点击保存/);
  assert.match(script, /不能投给自己/);
});

test("AI scoring brief is anonymous and covers every work", () => {
  const brief = buildAiScoringBrief({
    roundNumber: 1,
    title: "测试题目",
    prompt: "完整题目",
    answers: [
      { anonymousLabel: "A", v1: "甲的初稿", improvementPrompt: "追问甲", v2: "甲的终稿" },
      { anonymousLabel: "B", v1: "乙的初稿", improvementPrompt: "追问乙", v2: "乙的终稿" },
    ],
  });
  assert.match(brief, /作品 A/);
  assert.match(brief, /作品 B/);
  assert.match(brief, /只输出 JSON 数组/);
  assert.doesNotMatch(brief, /Gary|Alex/);
});

test("stage warnings explain the concrete consequence before irreversible actions", () => {
  assert.match(buildAdvanceWarning("v1", "进入 V2"), /未保存的 V1 不会进入后续展示、投票或评分/);
  assert.match(buildAdvanceWarning("voting", "结束投票"), /失去本轮互评机会/);
  assert.match(buildAdvanceWarning("discussion", "进入评分"), /确认现场交流确实结束/);
});

test("equal scores receive the same displayed rank", () => {
  const rows = [{ score: 10 }, { score: 10 }, { score: 8 }];
  assert.deepEqual(rows.map((_, index) => rankForScore(rows, index)), [1, 1, 3]);
});
