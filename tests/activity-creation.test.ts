import assert from "node:assert/strict";
import test from "node:test";

import {
  ActivityCreationError,
  createActivity,
  InMemoryActivityStore,
  resolveCapability,
  resolveOrganizerActivity,
  type CreateActivityInput,
} from "../src/activity-creation.ts";

const completeInput: CreateActivityInput = {
  invitationCode: "ARENA-2026",
  template: "prompt-challenge",
  name: "AI Prompt 挑战赛",
  startsAt: "2026-08-20T10:00:00.000Z",
  endsAt: "2026-08-20T12:00:00.000Z",
  participantLimit: 8,
  rounds: [
    {
      title: "第一轮：把问题说清楚",
      prompt: "用 AI 重新定义这个问题。",
      submitMinutes: 8,
      reviewMinutes: 5,
      scoring: "清晰度、可执行性、启发性",
      award: "最佳问题定义",
    },
  ],
};

test("valid invitation creates one isolated lobby activity with purpose-bound links", async () => {
  const store = new InMemoryActivityStore([
    { code: "ARENA-2026", status: "active" },
  ]);

  const result = await createActivity(completeInput, {
    store,
    now: () => new Date("2026-08-14T10:00:00.000Z"),
    token: (() => {
      const tokens = [
        "activity-a",
        "manage-a",
        "host-a",
        "event-a",
        "display-a",
        "report-a",
      ];
      return () => tokens.shift()!;
    })(),
    baseUrl: "https://arena.example",
  });

  assert.equal(result.activity.status, "lobby");
  assert.equal(result.activity.roomCode, "ACTIVI");
  assert.equal(result.activity.participantLimit, 8);
  assert.deepEqual(result.links, {
    organizer: "https://arena.example/organizer/manage-a",
    host: "https://arena.example/host/host-a",
    participant: "https://arena.example/event/event-a",
    display: "https://arena.example/display/display-a",
    report: "https://arena.example/report/report-a",
  });
  assert.equal(await store.getInvitationStatus("ARENA-2026"), "used");
});

test("public creation works without an invitation", async () => {
  const publicInput = { ...completeInput };
  delete publicInput.invitationCode;
  const store = new InMemoryActivityStore();
  const result = await createActivity(publicInput, {
    store,
    now: () => new Date("2026-08-14T10:00:00.000Z"),
    token: (() => {
      const tokens = ["activity-public", "organizer-public", "host-public", "event-public", "display-public", "report-public"];
      return () => tokens.shift()!;
    })(),
    baseUrl: "https://arena.example",
  });
  assert.equal(result.activity.name, "AI Prompt 挑战赛");
  assert.equal((await store.getActivityForCapability("event-public"))?.purpose, "participant");
});

test("rejects invalid, revoked, and already-used invitations", async () => {
  for (const invitation of [
    { code: "UNKNOWN", status: undefined },
    { code: "REVOKED", status: "revoked" as const },
    { code: "USED", status: "used" as const },
  ]) {
    const store = new InMemoryActivityStore(
      invitation.status ? [{ code: invitation.code, status: invitation.status }] : [],
    );

    await assert.rejects(
      createActivity(
        { ...completeInput, invitationCode: invitation.code },
        {
          store,
          now: () => new Date(),
          token: () => crypto.randomUUID(),
          baseUrl: "https://arena.example",
        },
      ),
      (error) =>
        error instanceof ActivityCreationError &&
        error.code === "invalid-invitation",
    );
  }
});

test("requires 3–12 participants, 1–2 complete rounds, and a valid time range", async () => {
  const invalidInputs: CreateActivityInput[] = [
    { ...completeInput, participantLimit: 2 },
    { ...completeInput, participantLimit: 13 },
    { ...completeInput, rounds: [] },
    { ...completeInput, rounds: Array(3).fill(completeInput.rounds[0]) },
    { ...completeInput, endsAt: completeInput.startsAt },
    {
      ...completeInput,
      rounds: [{ ...completeInput.rounds[0], scoring: "" }],
    },
  ];

  for (const input of invalidInputs) {
    await assert.rejects(
      createActivity(input, {
        store: new InMemoryActivityStore([
          { code: "ARENA-2026", status: "active" },
        ]),
        now: () => new Date(),
        token: () => crypto.randomUUID(),
        baseUrl: "https://arena.example",
      }),
      (error) =>
        error instanceof ActivityCreationError &&
        error.code === "invalid-configuration",
    );
  }
});

test("a capability exposes only its own activity and purpose", async () => {
  const store = new InMemoryActivityStore([
    { code: "FIRST", status: "active" },
    { code: "SECOND", status: "active" },
  ]);
  const tokens = [
    "activity-1", "organizer-1", "host-1", "event-1", "display-1", "report-1",
    "activity-2", "organizer-2", "host-2", "event-2", "display-2", "report-2",
  ];
  const dependencies = {
    store,
    now: () => new Date("2026-08-14T10:00:00.000Z"),
    token: () => tokens.shift()!,
    baseUrl: "https://arena.example",
  };

  await createActivity(
    { ...completeInput, invitationCode: "FIRST", name: "同名活动" },
    dependencies,
  );
  await createActivity(
    { ...completeInput, invitationCode: "SECOND", name: "同名活动" },
    dependencies,
  );

  const first = await resolveCapability("host-1", "host", store);
  const second = await resolveCapability("host-2", "host", store);
  assert.equal(first.activity.id, "activity-1");
  assert.equal(second.activity.id, "activity-2");
  assert.deepEqual(Object.keys(first.activity).sort(), [
    "id",
    "name",
    "participantLimit",
    "roundCount",
    "startsAt",
    "status",
  ]);
  await assert.rejects(() => resolveCapability("host-1", "report", store));
});

test("rejects malformed requests and unsupported templates as configuration errors", async () => {
  const invalidInputs = [
    { ...completeInput, template: "custom" },
    { ...completeInput, rounds: undefined },
    { ...completeInput, name: 42 },
  ];

  for (const input of invalidInputs) {
    await assert.rejects(
      createActivity(input as CreateActivityInput, {
        store: new InMemoryActivityStore([
          { code: "ARENA-2026", status: "active" },
        ]),
        now: () => new Date(),
        token: () => crypto.randomUUID(),
        baseUrl: "https://arena.example",
      }),
      (error) =>
        error instanceof ActivityCreationError &&
        error.code === "invalid-configuration",
    );
  }
});

test("organizer can copy configuration without exposing participant data", async () => {
  const store = new InMemoryActivityStore([{ code: "COPY-ME", status: "active" }]);
  await createActivity(
    { ...completeInput, invitationCode: "COPY-ME", name: "原活动" },
    {
      store,
      now: () => new Date("2026-08-14T10:00:00.000Z"),
      token: (() => {
        const tokens = ["activity-copy", "organizer-copy", "host-copy", "event-copy", "display-copy", "report-copy"];
        return () => tokens.shift()!;
      })(),
      baseUrl: "https://arena.example",
    },
  );

  const copied = await resolveOrganizerActivity("organizer-copy", store);
  assert.equal(copied.name, "原活动");
  assert.equal(copied.rounds.length, 1);
  assert.equal("participants" in copied, false);
  await assert.rejects(() => resolveOrganizerActivity("report-copy", store));
});
