import assert from "node:assert/strict";
import test from "node:test";

import {
  InMemoryLiveEventStore,
  LiveEventError,
  advanceLiveEvent,
  getAnonymousReport,
  getFullReport,
  getHostLiveEvent,
  getParticipantLiveEvent,
  saveAiScore,
  saveHistoricalAiScore,
  saveRoundEntry,
  saveVote,
} from "../src/live-event.ts";

const rounds = [
  { title: "第一轮", prompt: "用 AI 提出一个可执行方案。" },
  { title: "第二轮", prompt: "用 AI 找出方案中最关键的风险。" },
];

function setup() {
  return new InMemoryLiveEventStore({
    activity: {
      id: "activity-a",
      name: "明日共创活动",
      participantToken: "event-a",
      hostToken: "host-a",
      displayToken: "display-a",
      currentRoundIndex: 0,
      currentStage: "v1",
      rounds,
    },
    seats: [
      { id: "seat-a", nickname: "Gary", agentName: "Claude", recoveryToken: "recover-a" },
      { id: "seat-b", nickname: "Alex", agentName: "GPT", recoveryToken: "recover-b" },
      { id: "seat-c", nickname: "Sam", agentName: "Gemini", recoveryToken: "recover-c" },
    ],
  });
}

test("host can run two complete rounds with manual stage changes", async () => {
  const store = setup();

  for (const [recoveryToken, suffix] of [
    ["recover-a", "A"],
    ["recover-b", "B"],
    ["recover-c", "C"],
  ]) {
    await saveRoundEntry("event-a", recoveryToken, { v1: `V1-${suffix}` }, store);
  }
  await advanceLiveEvent("host-a", store);
  assert.equal((await getHostLiveEvent("host-a", store)).activity.stage, "v2");

  for (const [recoveryToken, suffix] of [
    ["recover-a", "A"],
    ["recover-b", "B"],
    ["recover-c", "C"],
  ]) {
    await saveRoundEntry(
      "event-a",
      recoveryToken,
      { improvementPrompt: `改进-${suffix}`, v2: `V2-${suffix}` },
      store,
    );
  }
  await advanceLiveEvent("host-a", store);
  assert.equal((await getHostLiveEvent("host-a", store)).activity.stage, "voting");

  const participant = await getParticipantLiveEvent("event-a", "recover-a", store);
  const ownAnswer = participant.answers.find((answer) => answer.isOwn);
  const otherAnswer = participant.answers.find((answer) => !answer.isOwn);
  assert.equal(ownAnswer?.nickname, undefined);
  assert.ok(otherAnswer);
  await assert.rejects(
    saveVote("event-a", "recover-a", ownAnswer!.seatId, store),
    (error) => error instanceof LiveEventError && error.code === "self-vote",
  );
  await saveVote("event-a", "recover-a", otherAnswer!.seatId, store);

  await advanceLiveEvent("host-a", store); // reveal
  await advanceLiveEvent("host-a", store); // discussion
  await advanceLiveEvent("host-a", store); // scoring
  await saveAiScore("host-a", "seat-a", 8, store);
  await saveAiScore("host-a", "seat-b", 9, store);
  await saveAiScore("host-a", "seat-c", 7, store);
  await advanceLiveEvent("host-a", store); // results

  const firstResults = await getHostLiveEvent("host-a", store);
  assert.equal(firstResults.activity.stage, "results");
  assert.deepEqual(
    firstResults.results.map(({ nickname, aiScore, votes, roundScore }) => ({ nickname, aiScore, votes, roundScore })),
    [
      { nickname: "Alex", aiScore: 9, votes: 1, roundScore: 10 },
      { nickname: "Gary", aiScore: 8, votes: 0, roundScore: 8 },
      { nickname: "Sam", aiScore: 7, votes: 0, roundScore: 7 },
    ],
  );

  await advanceLiveEvent("host-a", store); // round 2 v1
  const secondRound = await getHostLiveEvent("host-a", store);
  assert.equal(secondRound.activity.roundIndex, 1);
  assert.equal(secondRound.activity.stage, "v1");

  await advanceLiveEvent("host-a", store); // v2
  await advanceLiveEvent("host-a", store); // voting
  await advanceLiveEvent("host-a", store); // reveal
  await advanceLiveEvent("host-a", store); // discussion
  await advanceLiveEvent("host-a", store); // scoring
  await saveAiScore("host-a", "seat-a", 10, store);
  await saveAiScore("host-a", "seat-b", 8, store);
  await saveAiScore("host-a", "seat-c", 6, store);
  await advanceLiveEvent("host-a", store); // results
  await advanceLiveEvent("host-a", store); // complete

  const completed = await getHostLiveEvent("host-a", store);
  assert.equal(completed.activity.stage, "complete");
  assert.deepEqual(
    completed.totals.map(({ nickname, totalScore }) => ({ nickname, totalScore })),
    [
      { nickname: "Alex", totalScore: 18 },
      { nickname: "Gary", totalScore: 18 },
      { nickname: "Sam", totalScore: 13 },
    ],
  );
});

test("manual stage completion freezes earlier input and allows peer-vote-only results", async () => {
  const store = setup();
  await saveRoundEntry("event-a", "recover-a", { v1: "已保存回答" }, store);
  await advanceLiveEvent("host-a", store);

  await assert.rejects(
    saveRoundEntry("event-a", "recover-a", { v1: "迟到修改" }, store),
    (error) => error instanceof LiveEventError && error.code === "stage-closed",
  );
  await advanceLiveEvent("host-a", store);
  await advanceLiveEvent("host-a", store);
  await advanceLiveEvent("host-a", store);
  await advanceLiveEvent("host-a", store);
  await assert.rejects(
    saveAiScore("host-a", "seat-a", 11, store),
    (error) => error instanceof LiveEventError && error.code === "invalid-score",
  );
  await advanceLiveEvent("host-a", store);
  assert.equal((await getHostLiveEvent("host-a", store)).activity.stage, "results");
});

test("host can correct a completed round AI score while the next round is live", async () => {
  const store = setup();
  await advanceLiveEvent("host-a", store); // v2
  await advanceLiveEvent("host-a", store); // voting
  await advanceLiveEvent("host-a", store); // reveal
  await advanceLiveEvent("host-a", store); // discussion
  await advanceLiveEvent("host-a", store); // scoring
  await saveAiScore("host-a", "seat-a", 8, store);
  await saveAiScore("host-a", "seat-b", 8, store);
  await saveAiScore("host-a", "seat-c", 8, store);
  await advanceLiveEvent("host-a", store); // results
  await advanceLiveEvent("host-a", store); // round 2 v1

  await saveHistoricalAiScore("host-a", 0, "seat-b", 9, store);
  assert.equal((await store.listScores("activity-a", 0)).find((score) => score.seatId === "seat-b")?.score, 9);
  await assert.rejects(
    saveHistoricalAiScore("host-a", 1, "seat-b", 9, store),
    (error) => error instanceof LiveEventError && error.code === "stage-closed",
  );
});

test("participant answers follow the advertised 700-character limit", async () => {
  const store = setup();
  await saveRoundEntry("event-a", "recover-a", { v1: "答".repeat(700) }, store);
  await assert.rejects(
    saveRoundEntry("event-a", "recover-a", { v1: "答".repeat(701) }, store),
    (error) => error instanceof LiveEventError && error.code === "invalid-entry",
  );
  await advanceLiveEvent("host-a", store);
  await saveRoundEntry(
    "event-a",
    "recover-a",
    { improvementPrompt: "改进", v2: "答".repeat(700) },
    store,
  );
});

test("report capability exports answers without recovery tokens", async () => {
  const store = setup();
  await saveRoundEntry("event-a", "recover-a", { v1: "可导出的回答" }, store);
  const report = await getFullReport("report-a", store);
  assert.equal(report.activity.name, "明日共创活动");
  assert.equal(report.rounds[0].answers[0].v1, "可导出的回答");
  assert.equal("recoveryToken" in report.participants[0], false);
});

test("report capability is anonymous while organizer export keeps identities", async () => {
  const store = setup();
  await saveRoundEntry("event-a", "recover-a", { v1: "匿名回答" }, store);
  const anonymous = await getAnonymousReport("report-a", store);
  assert.equal("nickname" in anonymous.participants[0], false);
  assert.equal(anonymous.rounds[0].answers[0].v1, "匿名回答");
  const organizer = await getFullReport("report-a", store);
  assert.equal(organizer.participants[0].nickname, "Gary");
});

test("every participant receives exactly one final award", async () => {
  const store = new InMemoryLiveEventStore({
    activity: {
      id: "activity-awards",
      name: "七人共创活动",
      participantToken: "event-awards",
      hostToken: "host-awards",
      displayToken: "display-awards",
      reportToken: "report-awards",
      currentRoundIndex: 0,
      currentStage: "complete",
      rounds,
    },
    seats: Array.from({ length: 7 }, (_, index) => ({
      id: `seat-${index + 1}`,
      nickname: `参赛者${index + 1}`,
      agentName: `Agent ${index + 1}`,
      recoveryToken: `recover-${index + 1}`,
    })),
  });
  const report = await getFullReport("report-awards", store);
  assert.equal(report.awards.length, 7);
  assert.equal(new Set(report.awards.map((award) => award.seatId)).size, 7);
  assert.deepEqual(report.awards.map((award) => award.title), [
    "共创总冠军",
    "共创亚军",
    "共创季军",
    "最幽默表达奖",
    "最犀利批判奖",
    "最像老板奖",
    "最佳战略奖",
  ]);
  assert.deepEqual(report.awards.slice(3).map((award) => award.type), ["special", "special", "special", "special"]);
});
