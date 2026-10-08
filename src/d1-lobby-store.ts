import {
  LobbyError,
  type LobbyActivity,
  type LobbyStore,
  type ParticipantSeat,
} from "./lobby.ts";

interface ActivityRow {
  id: string;
  name: string;
  room_code: string;
  participant_limit: number;
  status: LobbyActivity["status"];
  roster_locked_at: string | null;
  locked_seat_limit: number | null;
  review_started_at: string | null;
}

interface SeatRow {
  id: string;
  activity_id: string;
  nickname: string;
  agent_name: string;
  recovery_token: string;
  joined_at: string;
  last_seen_at: string;
}

function toActivity(row: ActivityRow): LobbyActivity {
  return {
    id: row.id,
    name: row.name,
    roomCode: row.room_code,
    participantLimit: row.participant_limit,
    status: row.status,
    rosterLockedAt: row.roster_locked_at,
    lockedSeatLimit: row.locked_seat_limit,
    reviewStartedAt: row.review_started_at,
  };
}

function toSeat(row: SeatRow): ParticipantSeat {
  return {
    id: row.id,
    activityId: row.activity_id,
    nickname: row.nickname,
    agentName: row.agent_name,
    recoveryToken: row.recovery_token,
    joinedAt: row.joined_at,
    lastSeenAt: row.last_seen_at,
  };
}

const activitySelect = `
  SELECT a.id, a.name, a.room_code, a.participant_limit, a.status,
         a.roster_locked_at, a.locked_seat_limit, a.review_started_at
  FROM activities a`;

export class D1LobbyStore implements LobbyStore {
  private readonly database: D1Database;

  constructor(database: D1Database) {
    this.database = database;
  }

  private async getByCapability(token: string, purpose: "participant" | "host") {
    const row = await this.database
      .prepare(
        `${activitySelect}
         JOIN capabilities requested ON requested.activity_id = a.id
         WHERE requested.token = ? AND requested.purpose = ?`,
      )
      .bind(token, purpose)
      .first<ActivityRow>();
    return row ? toActivity(row) : undefined;
  }

  private async getById(activityId: string) {
    const row = await this.database
      .prepare(`${activitySelect} WHERE a.id = ?`)
      .bind(activityId)
      .first<ActivityRow>();
    return row ? toActivity(row) : undefined;
  }

  getByParticipantLink(token: string) {
    return this.getByCapability(token, "participant");
  }

  getByHostLink(token: string) {
    return this.getByCapability(token, "host");
  }

  async findSeatByRecoveryToken(activityId: string, recoveryToken: string) {
    const row = await this.database
      .prepare(
        `SELECT id, activity_id, nickname, agent_name, recovery_token,
                joined_at, last_seen_at
         FROM participant_seats
         WHERE activity_id = ? AND recovery_token = ?`,
      )
      .bind(activityId, recoveryToken)
      .first<SeatRow>();
    return row ? toSeat(row) : undefined;
  }

  async addSeat(activity: LobbyActivity, seat: ParticipantSeat) {
    try {
      const result = await this.database
        .prepare(
          `INSERT INTO participant_seats
            (id, activity_id, nickname, nickname_normalized, agent_name,
             agent_name_normalized, recovery_token, joined_at, last_seen_at)
           SELECT ?, a.id, ?, ?, ?, ?, ?, ?, ?
           FROM activities a
           WHERE a.id = ?
             AND a.review_started_at IS NULL
             AND (SELECT COUNT(*) FROM participant_seats WHERE activity_id = a.id)
                 < CASE
                     WHEN a.roster_locked_at IS NULL THEN a.participant_limit
                     ELSE COALESCE(a.locked_seat_limit, 0)
                   END`,
        )
        .bind(
          seat.id,
          seat.nickname,
          seat.nickname.toLocaleLowerCase(),
          seat.agentName,
          seat.agentName.toLocaleLowerCase(),
          seat.recoveryToken,
          seat.joinedAt,
          seat.lastSeenAt,
          activity.id,
        )
        .run();
      if (result.meta.changes > 0) return;
    } catch (error) {
      const message = error instanceof Error ? error.message : "";
      if (message.includes("UNIQUE constraint failed")) {
        throw new LobbyError(
          "duplicate-seat",
          "该昵称或 Agent 名称已被使用，请更换后重试。",
        );
      }
      throw error;
    }

    const latest = await this.getById(activity.id);
    if (latest?.reviewStartedAt) {
      throw new LobbyError(
        "review-started",
        "匿名阅卷已经开始，不能加入或更换参赛席位。",
      );
    }
    throw new LobbyError(
      latest?.rosterLockedAt ? "roster-locked" : "lobby-full",
      latest?.rosterLockedAt
        ? "参赛名单已锁定，暂时没有可恢复的席位。"
        : "候场人数已满，请联系主持人。",
    );
  }

  async listSeats(activityId: string) {
    const { results } = await this.database
      .prepare(
        `SELECT id, activity_id, nickname, agent_name, recovery_token,
                joined_at, last_seen_at
         FROM participant_seats WHERE activity_id = ? ORDER BY joined_at, id`,
      )
      .bind(activityId)
      .all<SeatRow>();
    return results.map(toSeat);
  }

  async touchSeat(activityId: string, recoveryToken: string, seenAt: string) {
    const result = await this.database
      .prepare(
        `UPDATE participant_seats SET last_seen_at = ?
         WHERE activity_id = ? AND recovery_token = ?`,
      )
      .bind(seenAt, activityId, recoveryToken)
      .run();
    if (result.meta.changes === 0) return undefined;
    return this.findSeatByRecoveryToken(activityId, recoveryToken);
  }

  async lockRoster(activityId: string, lockedAt: string) {
    const result = await this.database
      .prepare(
        `UPDATE activities
         SET status = 'v1', roster_locked_at = ?,
             current_stage = 'v1', current_round_index = 0,
             locked_seat_limit = (
               SELECT COUNT(*) FROM participant_seats WHERE activity_id = ?
             )
         WHERE id = ? AND roster_locked_at IS NULL
           AND (SELECT COUNT(*) FROM participant_seats WHERE activity_id = ?) >= 3`,
      )
      .bind(lockedAt, activityId, activityId, activityId)
      .run();
    const activity = await this.getById(activityId);
    if (!activity) {
      throw new LobbyError("invalid-entry", "活动不存在。");
    }
    if (result.meta.changes === 0 && !activity.rosterLockedAt) {
      throw new LobbyError(
        "not-enough-participants",
        "至少需要 3 名参赛者才能启动第一版。",
      );
    }
    return activity;
  }

  async removeSeat(activity: LobbyActivity, seatId: string) {
    const result = await this.database
      .prepare(
        `DELETE FROM participant_seats
         WHERE id = ? AND activity_id = ?
           AND EXISTS (
             SELECT 1 FROM activities
             WHERE id = ? AND review_started_at IS NULL
           )`,
      )
      .bind(seatId, activity.id, activity.id)
      .run();
    if (result.meta.changes > 0) return;
    const latest = await this.getById(activity.id);
    if (latest?.reviewStartedAt) {
      throw new LobbyError(
        "review-started",
        "匿名阅卷已经开始，不能移除或更换参赛席位。",
      );
    }
    throw new LobbyError("invalid-seat", "参赛席位不存在。");
  }
}
