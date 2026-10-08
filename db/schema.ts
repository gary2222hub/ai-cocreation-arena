import { sql } from "drizzle-orm";
import {
  integer,
  sqliteTable,
  text,
  uniqueIndex,
} from "drizzle-orm/sqlite-core";

export const invitations = sqliteTable("invitations", {
  code: text("code").primaryKey(),
  status: text("status", { enum: ["active", "revoked", "used"] })
    .notNull()
    .default("active"),
  usedAt: text("used_at"),
});

export const activities = sqliteTable("activities", {
  id: text("id").primaryKey(),
  roomCode: text("room_code").notNull(),
  invitationCode: text("invitation_code")
    .notNull()
    .unique()
    .references(() => invitations.code),
  template: text("template", { enum: ["prompt-challenge", "blank"] }).notNull(),
  name: text("name").notNull(),
  startsAt: text("starts_at").notNull(),
  endsAt: text("ends_at").notNull(),
  participantLimit: integer("participant_limit").notNull(),
  roundsJson: text("rounds_json").notNull(),
  status: text("status", { enum: ["lobby", "v1"] }).notNull().default("lobby"),
  createdAt: text("created_at").notNull().default(sql`CURRENT_TIMESTAMP`),
  rosterLockedAt: text("roster_locked_at"),
  lockedSeatLimit: integer("locked_seat_limit"),
  reviewStartedAt: text("review_started_at"),
  currentRoundIndex: integer("current_round_index").notNull().default(0),
  currentStage: text("current_stage", {
    enum: [
      "lobby",
      "v1",
      "v2",
      "voting",
      "reveal",
      "discussion",
      "scoring",
      "results",
      "complete",
    ],
  }).notNull().default("lobby"),
});

export const capabilities = sqliteTable("capabilities", {
  token: text("token").primaryKey(),
  activityId: text("activity_id")
    .notNull()
    .references(() => activities.id, { onDelete: "cascade" }),
  purpose: text("purpose", {
    enum: ["organizer", "host", "participant", "display", "report"],
  }).notNull(),
});

export const participantSeats = sqliteTable(
  "participant_seats",
  {
    id: text("id").primaryKey(),
    activityId: text("activity_id")
      .notNull()
      .references(() => activities.id, { onDelete: "cascade" }),
    nickname: text("nickname").notNull(),
    nicknameNormalized: text("nickname_normalized").notNull(),
    agentName: text("agent_name").notNull(),
    agentNameNormalized: text("agent_name_normalized").notNull(),
    recoveryToken: text("recovery_token").notNull().unique(),
    joinedAt: text("joined_at").notNull(),
    lastSeenAt: text("last_seen_at").notNull(),
  },
  (table) => [
    uniqueIndex("participant_seats_activity_nickname_unique").on(
      table.activityId,
      table.nicknameNormalized,
    ),
    uniqueIndex("participant_seats_activity_agent_unique").on(
      table.activityId,
      table.agentNameNormalized,
    ),
  ],
);

export const liveRoundEntries = sqliteTable(
  "live_round_entries",
  {
    id: text("id").primaryKey(),
    activityId: text("activity_id")
      .notNull()
      .references(() => activities.id, { onDelete: "cascade" }),
    roundIndex: integer("round_index").notNull(),
    seatId: text("seat_id")
      .notNull()
      .references(() => participantSeats.id, { onDelete: "cascade" }),
    v1: text("v1").notNull().default(""),
    improvementPrompt: text("improvement_prompt").notNull().default(""),
    v2: text("v2").notNull().default(""),
    updatedAt: text("updated_at").notNull(),
  },
  (table) => [
    uniqueIndex("live_round_entries_activity_round_seat_unique").on(
      table.activityId,
      table.roundIndex,
      table.seatId,
    ),
  ],
);

export const liveVotes = sqliteTable(
  "live_votes",
  {
    id: text("id").primaryKey(),
    activityId: text("activity_id")
      .notNull()
      .references(() => activities.id, { onDelete: "cascade" }),
    roundIndex: integer("round_index").notNull(),
    voterSeatId: text("voter_seat_id")
      .notNull()
      .references(() => participantSeats.id, { onDelete: "cascade" }),
    candidateSeatId: text("candidate_seat_id")
      .notNull()
      .references(() => participantSeats.id, { onDelete: "cascade" }),
  },
  (table) => [
    uniqueIndex("live_votes_activity_round_voter_unique").on(
      table.activityId,
      table.roundIndex,
      table.voterSeatId,
    ),
  ],
);

export const liveAiScores = sqliteTable(
  "live_ai_scores",
  {
    id: text("id").primaryKey(),
    activityId: text("activity_id")
      .notNull()
      .references(() => activities.id, { onDelete: "cascade" }),
    roundIndex: integer("round_index").notNull(),
    seatId: text("seat_id")
      .notNull()
      .references(() => participantSeats.id, { onDelete: "cascade" }),
    score: integer("score").notNull(),
  },
  (table) => [
    uniqueIndex("live_ai_scores_activity_round_seat_unique").on(
      table.activityId,
      table.roundIndex,
      table.seatId,
    ),
  ],
);
