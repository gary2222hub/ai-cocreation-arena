import assert from "node:assert/strict";
import test from "node:test";

import {
  canJoinParticipantLobby,
  InMemoryLobbyStore,
  getHostLobby,
  getParticipantLobby,
  heartbeat,
  joinLobby,
  lockRoster,
  LobbyError,
  removeSeat,
  type LobbyActivitySeed,
} from "../src/lobby.ts";

const activity: LobbyActivitySeed = {
  id: "activity-a",
  participantLinkToken: "event-a",
  hostLinkToken: "host-a",
  name: "AI 共创场测试",
  roomCode: "A1B2C3",
  participantLimit: 3,
  status: "lobby",
  rosterLockedAt: null,
  lockedSeatLimit: null,
  reviewStartedAt: null,
};

test("participant joins once and the same browser recovery token restores that seat", async () => {
  const store = new InMemoryLobbyStore([activity]);
  const dependencies = {
    store,
    now: () => new Date("2026-08-14T10:00:00.000Z"),
    token: (() => {
      const values = ["seat-a", "recovery-a"];
      return () => values.shift()!;
    })(),
  };

  const joined = await joinLobby(
    {
      participantLinkToken: "event-a",
      roomCode: "a1b2c3",
      nickname: "Gary",
      agentName: "Claude",
    },
    dependencies,
  );
  const restored = await joinLobby(
    {
      participantLinkToken: "event-a",
      roomCode: "",
      nickname: "ignored",
      agentName: "ignored",
      recoveryToken: joined.recoveryToken,
    },
    dependencies,
  );

  assert.equal(joined.recovered, false);
  assert.equal(restored.recovered, true);
  assert.equal(restored.seat.id, joined.seat.id);
  assert.equal((await store.listSeats("activity-a")).length, 1);
});

test("recovery is activity-scoped and host connection status follows heartbeats", async () => {
  const secondActivity: LobbyActivitySeed = {
    ...activity,
    id: "activity-b",
    participantLinkToken: "event-b",
    hostLinkToken: "host-b",
    roomCode: "B1B2B3",
  };
  const store = new InMemoryLobbyStore([activity, secondActivity]);
  let sequence = 0;
  const first = await joinLobby(
    { participantLinkToken: "event-a", roomCode: "A1B2C3", nickname: "Gary", agentName: "Claude" },
    {
      store,
      now: () => new Date("2026-08-14T10:00:00.000Z"),
      token: () => `token-${sequence++}`,
    },
  );
  const second = await joinLobby(
    {
      participantLinkToken: "event-b",
      roomCode: "B1B2B3",
      nickname: "Gary",
      agentName: "Claude",
      recoveryToken: first.recoveryToken,
    },
    {
      store,
      now: () => new Date("2026-08-14T10:00:00.000Z"),
      token: () => `token-${sequence++}`,
    },
  );
  assert.equal(second.recovered, false);
  assert.equal(second.seat.activityId, "activity-b");

  assert.equal(
    (await getHostLobby("host-a", store, () => new Date("2026-08-14T10:00:10.000Z"))).seats[0].connectionStatus,
    "connected",
  );
  assert.equal(
    (await getHostLobby("host-a", store, () => new Date("2026-08-14T10:00:20.000Z"))).seats[0].connectionStatus,
    "disconnected",
  );
  await heartbeat(
    "event-a",
    first.recoveryToken,
    store,
    () => new Date("2026-08-14T10:00:21.000Z"),
  );
  assert.equal(
    (await getHostLobby("host-a", store, () => new Date("2026-08-14T10:00:22.000Z"))).seats[0].connectionStatus,
    "connected",
  );
});

test("host locks the roster, rejects late joins, and can replace a broken seat before review", async () => {
  const store = new InMemoryLobbyStore([activity]);
  let sequence = 0;
  const dependencies = {
    store,
    now: () => new Date("2026-08-14T10:00:00.000Z"),
    token: () => `token-${sequence++}`,
  };
  const first = await joinLobby(
    { participantLinkToken: "event-a", roomCode: "A1B2C3", nickname: "Gary", agentName: "Claude" },
    dependencies,
  );
  await joinLobby(
    { participantLinkToken: "event-a", roomCode: "A1B2C3", nickname: "Alex", agentName: "GPT" },
    dependencies,
  );
  await joinLobby(
    { participantLinkToken: "event-a", roomCode: "A1B2C3", nickname: "Sam", agentName: "Gemini" },
    dependencies,
  );

  const locked = await lockRoster("host-a", store, dependencies.now);
  assert.equal(locked.status, "v1");
  assert.equal(locked.lockedSeatLimit, 3);
  const hostView = await getHostLobby("host-a", store, dependencies.now);
  assert.equal(hostView.activity.reviewStartedAt, null);
  await assert.rejects(
    joinLobby(
      { participantLinkToken: "event-a", roomCode: "A1B2C3", nickname: "Late", agentName: "Copilot" },
      dependencies,
    ),
    (error) => error instanceof LobbyError && error.code === "roster-locked",
  );

  await removeSeat("host-a", first.seat.id, store);
  const participantView = await getParticipantLobby("event-a", store);
  assert.equal(participantView.activity.lockedSeatLimit, 3);
  assert.equal(participantView.seatCount, 2);
  assert.equal(
    canJoinParticipantLobby(participantView.activity, participantView.seatCount),
    true,
  );
  await joinLobby(
    { participantLinkToken: "event-a", roomCode: "A1B2C3", nickname: "Gary", agentName: "Claude" },
    dependencies,
  );
  assert.equal((await store.listSeats("activity-a")).length, 3);
  assert.equal(
    canJoinParticipantLobby(participantView.activity, 3),
    false,
  );
});

test("invalid, duplicate, and over-capacity joins are rejected clearly", async () => {
  const store = new InMemoryLobbyStore([activity]);
  let sequence = 0;
  const dependencies = {
    store,
    now: () => new Date("2026-08-14T10:00:00.000Z"),
    token: () => `token-${sequence++}`,
  };
  const join = (nickname: string, agentName: string, roomCode = "A1B2C3") =>
    joinLobby(
      { participantLinkToken: "event-a", roomCode, nickname, agentName },
      dependencies,
    );

  await assert.rejects(
    join("Gary", "Claude", "WRONG"),
    (error) => error instanceof LobbyError && error.code === "invalid-entry",
  );
  await assert.rejects(
    join("G".repeat(41), "Claude"),
    (error) => error instanceof LobbyError && error.code === "invalid-entry",
  );
  await join("Gary", "Claude");
  await assert.rejects(
    join("gary", "Gemini"),
    (error) => error instanceof LobbyError && error.code === "duplicate-seat",
  );
  await assert.rejects(
    join("Alex", "claude"),
    (error) => error instanceof LobbyError && error.code === "duplicate-seat",
  );
  await join("Alex", "GPT");
  await join("Sam", "Gemini");
  await assert.rejects(
    join("Taylor", "Copilot"),
    (error) => error instanceof LobbyError && error.code === "lobby-full",
  );
});

test("anonymous review permanently blocks seat removal and replacement", async () => {
  const reviewedActivity: LobbyActivitySeed = {
    ...activity,
    status: "v1",
    rosterLockedAt: "2026-08-14T10:00:00.000Z",
    lockedSeatLimit: 3,
    reviewStartedAt: "2026-08-14T10:30:00.000Z",
  };
  const store = new InMemoryLobbyStore([reviewedActivity]);

  await assert.rejects(
    removeSeat("host-a", "seat-a", store),
    (error) => error instanceof LobbyError && error.code === "review-started",
  );
  await assert.rejects(
    joinLobby(
      {
        participantLinkToken: "event-a",
        roomCode: "A1B2C3",
        nickname: "Gary",
        agentName: "Claude",
      },
      {
        store,
        now: () => new Date("2026-08-14T10:31:00.000Z"),
        token: () => crypto.randomUUID(),
      },
    ),
    (error) => error instanceof LobbyError && error.code === "review-started",
  );
});
