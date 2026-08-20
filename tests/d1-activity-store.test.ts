import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import {
  DatabaseSync,
  type SQLInputValue,
  type StatementSync,
} from "node:sqlite";
import test from "node:test";

import {
  ActivityCreationError,
  createActivity,
  resolveCapability,
  type CreateActivityInput,
} from "../src/activity-creation.ts";
import { D1ActivityStore } from "../src/d1-activity-store.ts";
import { D1LiveEventStore } from "../src/d1-live-event-store.ts";
import { D1LobbyStore } from "../src/d1-lobby-store.ts";
import {
  advanceLiveEvent,
  getHostLiveEvent,
  saveRoundEntry,
} from "../src/live-event.ts";
import { joinLobby, lockRoster } from "../src/lobby.ts";

class SqliteStatement {
  private values: SQLInputValue[] = [];
  private readonly statement: StatementSync;

  constructor(statement: StatementSync) {
    this.statement = statement;
  }

  bind(...values: SQLInputValue[]) {
    this.values = values;
    return this;
  }

  async first<T>() {
    return (this.statement.get(...this.values) as T | undefined) ?? null;
  }

  async all<T>() {
    return { results: this.statement.all(...this.values) as T[] };
  }

  run() {
    const result = this.statement.run(...this.values);
    return {
      success: true,
      meta: { changes: Number(result.changes) },
    };
  }
}

class SqliteD1Database {
  readonly sqlite = new DatabaseSync(":memory:");

  prepare(query: string) {
    return new SqliteStatement(this.sqlite.prepare(query));
  }

  async batch(statements: SqliteStatement[]) {
    this.sqlite.exec("BEGIN");
    try {
      const results = statements.map((statement) => statement.run());
      this.sqlite.exec("COMMIT");
      return results;
    } catch (error) {
      this.sqlite.exec("ROLLBACK");
      throw error;
    }
  }
}

const input: CreateActivityInput = {
  invitationCode: "D1-INVITE",
  template: "blank",
  name: "D1 隔离测试",
  startsAt: "2026-08-20T10:00:00.000Z",
  endsAt: "2026-08-20T11:00:00.000Z",
  participantLimit: 6,
  rounds: [{
    title: "第一轮",
    prompt: "测试题目",
    submitMinutes: 5,
    reviewMinutes: 3,
    scoring: "清晰度",
    award: "最佳方案",
  }],
};

function setup() {
  const database = new SqliteD1Database();
  for (const migrationName of [
    "0000_windy_quentin_quire.sql",
    "0001_orange_liz_osborn.sql",
    "0002_chunky_lockjaw.sql",
    "0003_unknown_chat.sql",
    "0004_hard_arclight.sql",
    "0005_seed_live_invitations.sql",
  ]) {
    const migration = readFileSync(
      new URL(`../drizzle/${migrationName}`, import.meta.url),
      "utf8",
    ).replaceAll("--> statement-breakpoint", "");
    database.sqlite.exec(migration);
  }
  database.sqlite.prepare(
    "INSERT INTO invitations (code, status) VALUES (?, 'active')",
  ).run(input.invitationCode);
  return database;
}

test("public migrations do not include organizer invitations", () => {
  const database = setup();
  assert.equal(
    database.sqlite
      .prepare("SELECT COUNT(*) AS count FROM invitations WHERE code LIKE 'LIVE-%' AND status = 'active'")
      .get()?.count,
    0,
  );
});

test("migrations assign existing activities a usable room code", () => {
  const database = new SqliteD1Database();
  database.sqlite.exec("PRAGMA foreign_keys = ON");
  const apply = (migrationName: string) => {
    const migration = readFileSync(
      new URL(`../drizzle/${migrationName}`, import.meta.url),
      "utf8",
    ).replaceAll("--> statement-breakpoint", "");
    database.sqlite.exec(migration);
  };
  apply("0000_windy_quentin_quire.sql");
  database.sqlite.exec(`
    INSERT INTO invitations (code, status) VALUES ('LEGACY', 'used');
    INSERT INTO activities
      (id, invitation_code, template, name, starts_at, ends_at,
       participant_limit, rounds_json, status, created_at)
    VALUES
      ('abc12345-legacy', 'LEGACY', 'blank', '旧活动',
       '2026-08-20T10:00:00.000Z', '2026-08-20T11:00:00.000Z',
       3, '[]', 'lobby', '2026-08-14T10:00:00.000Z');
  `);
  apply("0001_orange_liz_osborn.sql");
  apply("0002_chunky_lockjaw.sql");
  database.sqlite.exec(`
    INSERT INTO capabilities (token, activity_id, purpose)
    VALUES ('legacy-event', 'abc12345-legacy', 'participant');
    INSERT INTO participant_seats
      (id, activity_id, nickname, nickname_normalized, agent_name,
       agent_name_normalized, recovery_token, joined_at, last_seen_at)
    VALUES
      ('legacy-seat', 'abc12345-legacy', 'Gary', 'gary', 'Claude',
       'claude', 'legacy-recovery', '2026-08-14T10:05:00.000Z',
       '2026-08-14T10:05:00.000Z');
  `);
  apply("0003_unknown_chat.sql");

  assert.equal(
    database.sqlite.prepare("SELECT room_code FROM activities WHERE id = ?").get("abc12345-legacy")?.room_code,
    "ABC123",
  );
  assert.equal(
    database.sqlite.prepare("SELECT COUNT(*) AS count FROM capabilities WHERE activity_id = ?").get("abc12345-legacy")?.count,
    1,
  );
  assert.equal(
    database.sqlite.prepare("SELECT COUNT(*) AS count FROM participant_seats WHERE activity_id = ?").get("abc12345-legacy")?.count,
    1,
  );
});

test("D1 persists one activity, consumes the invitation, and resolves its capability", async () => {
  const database = setup();
  const store = new D1ActivityStore(database as unknown as D1Database);
  const tokens = ["activity", "organizer", "host", "event", "display", "report"];
  const result = await createActivity(input, {
    store,
    now: () => new Date("2026-08-14T10:00:00.000Z"),
    token: () => tokens.shift()!,
    baseUrl: "https://arena.example",
  });

  assert.equal(
    database.sqlite.prepare("SELECT status FROM invitations WHERE code = ?").get(input.invitationCode)?.status,
    "used",
  );
  assert.equal((await resolveCapability("host", "host", store)).activity.id, result.activity.id);
});

test("D1 lobby joins three seats and locks the roster through capability links", async () => {
  const database = setup();
  const activityStore = new D1ActivityStore(database as unknown as D1Database);
  const lobbyStore = new D1LobbyStore(database as unknown as D1Database);
  const activityTokens = ["activity", "organizer", "host", "event", "display", "report"];
  await createActivity(input, {
    store: activityStore,
    now: () => new Date("2026-08-14T10:00:00.000Z"),
    token: () => activityTokens.shift()!,
    baseUrl: "https://arena.example",
  });
  let seatSequence = 0;
  const joinDependencies = {
    store: lobbyStore,
    now: () => new Date("2026-08-14T10:05:00.000Z"),
    token: () => `seat-token-${seatSequence++}`,
  };
  for (const [nickname, agentName] of [
    ["Gary", "Claude"],
    ["Alex", "GPT"],
    ["Sam", "Gemini"],
  ]) {
    await joinLobby(
      {
        participantLinkToken: "event",
        roomCode: "ACTIVI",
        nickname,
        agentName,
      },
      joinDependencies,
    );
  }

  const locked = await lockRoster(
    "host",
    lobbyStore,
    () => new Date("2026-08-14T10:10:00.000Z"),
  );
  assert.equal(locked.status, "v1");
  assert.equal(locked.lockedSeatLimit, 3);
});

test("D1 persists manual live stages and freezes V1 after the host advances", async () => {
  const database = setup();
  const activityStore = new D1ActivityStore(database as unknown as D1Database);
  const lobbyStore = new D1LobbyStore(database as unknown as D1Database);
  const liveStore = new D1LiveEventStore(database as unknown as D1Database);
  const activityTokens = ["activity", "organizer", "host", "event", "display", "report"];
  await createActivity(input, {
    store: activityStore,
    now: () => new Date("2026-08-14T10:00:00.000Z"),
    token: () => activityTokens.shift()!,
    baseUrl: "https://arena.example",
  });
  let sequence = 0;
  for (const [nickname, agentName] of [
    ["Gary", "Claude"],
    ["Alex", "GPT"],
    ["Sam", "Gemini"],
  ]) {
    await joinLobby(
      { participantLinkToken: "event", roomCode: "ACTIVI", nickname, agentName },
      {
        store: lobbyStore,
        now: () => new Date("2026-08-14T10:05:00.000Z"),
        token: () => `live-seat-${sequence++}`,
      },
    );
  }
  await lockRoster("host", lobbyStore, () => new Date("2026-08-14T10:10:00.000Z"));
  const recoveryToken = database.sqlite
    .prepare("SELECT recovery_token FROM participant_seats WHERE nickname = ?")
    .get("Gary")?.recovery_token as string;
  await saveRoundEntry("event", recoveryToken, { v1: "持久化回答" }, liveStore);
  await advanceLiveEvent("host", liveStore);

  const snapshot = await getHostLiveEvent("host", liveStore);
  assert.equal(snapshot.activity.stage, "v2");
  assert.deepEqual(Object.keys(snapshot.seats[0]).sort(), ["agentName", "id", "nickname"]);
  assert.equal(snapshot.answers.find((answer) => answer.nickname === undefined)?.v1, "持久化回答");
});

test("concurrent redemption gives the loser a clear invitation error and leaves one activity", async () => {
  const database = setup();
  const store = new D1ActivityStore(database as unknown as D1Database);
  let sequence = 0;
  const dependencies = {
    store,
    now: () => new Date("2026-08-14T10:00:00.000Z"),
    token: () => `token-${sequence++}`,
    baseUrl: "https://arena.example",
  };

  const results = await Promise.allSettled([
    createActivity(input, dependencies),
    createActivity(input, dependencies),
  ]);
  assert.equal(results.filter((result) => result.status === "fulfilled").length, 1);
  const rejected = results.find((result) => result.status === "rejected");
  assert.ok(rejected?.status === "rejected");
  assert.ok(rejected.reason instanceof ActivityCreationError);
  assert.equal(rejected.reason.code, "invalid-invitation");
  assert.equal(database.sqlite.prepare("SELECT COUNT(*) AS count FROM activities").get()?.count, 1);
});
