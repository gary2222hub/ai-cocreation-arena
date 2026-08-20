import type {
  LiveActivity,
  LiveAiScore,
  LiveEventStore,
  LiveRoundEntry,
  LiveSeat,
  LiveStage,
  LiveVote,
} from "./live-event.ts";

interface ActivityRow {
  id: string;
  name: string;
  rounds_json: string;
  current_round_index: number;
  current_stage: LiveStage;
}

interface SeatRow {
  id: string;
  activity_id: string;
  nickname: string;
  agent_name: string;
  recovery_token: string;
}

interface EntryRow {
  activity_id: string;
  round_index: number;
  seat_id: string;
  v1: string;
  improvement_prompt: string;
  v2: string;
  updated_at: string;
}

interface VoteRow {
  activity_id: string;
  round_index: number;
  voter_seat_id: string;
  candidate_seat_id: string;
}

interface ScoreRow {
  activity_id: string;
  round_index: number;
  seat_id: string;
  score: number;
}

function toActivity(row: ActivityRow): LiveActivity {
  const rounds = JSON.parse(row.rounds_json) as Array<{ title: string; prompt: string }>;
  return {
    id: row.id,
    name: row.name,
    currentRoundIndex: row.current_round_index,
    currentStage: row.current_stage,
    rounds: rounds.map(({ title, prompt }) => ({ title, prompt })),
  };
}

function toSeat(row: SeatRow): LiveSeat {
  return {
    id: row.id,
    activityId: row.activity_id,
    nickname: row.nickname,
    agentName: row.agent_name,
    recoveryToken: row.recovery_token,
  };
}

function toEntry(row: EntryRow): LiveRoundEntry {
  return {
    activityId: row.activity_id,
    roundIndex: row.round_index,
    seatId: row.seat_id,
    v1: row.v1,
    improvementPrompt: row.improvement_prompt,
    v2: row.v2,
    updatedAt: row.updated_at,
  };
}

function toVote(row: VoteRow): LiveVote {
  return {
    activityId: row.activity_id,
    roundIndex: row.round_index,
    voterSeatId: row.voter_seat_id,
    candidateSeatId: row.candidate_seat_id,
  };
}

function toScore(row: ScoreRow): LiveAiScore {
  return {
    activityId: row.activity_id,
    roundIndex: row.round_index,
    seatId: row.seat_id,
    score: row.score,
  };
}

export class D1LiveEventStore implements LiveEventStore {
  private readonly database: D1Database;

  constructor(database: D1Database) {
    this.database = database;
  }

  async getActivityByCapability(
    token: string,
    purpose: "organizer" | "participant" | "host" | "display" | "report",
  ) {
    const row = await this.database
      .prepare(
        `SELECT a.id, a.name, a.rounds_json, a.current_round_index, a.current_stage
         FROM activities a
         JOIN capabilities requested ON requested.activity_id = a.id
         WHERE requested.token = ? AND requested.purpose = ?`,
      )
      .bind(token, purpose)
      .first<ActivityRow>();
    return row ? toActivity(row) : undefined;
  }

  async findSeat(activityId: string, recoveryToken: string) {
    const row = await this.database
      .prepare(
        `SELECT id, activity_id, nickname, agent_name, recovery_token
         FROM participant_seats
         WHERE activity_id = ? AND recovery_token = ?`,
      )
      .bind(activityId, recoveryToken)
      .first<SeatRow>();
    return row ? toSeat(row) : undefined;
  }

  async listSeats(activityId: string) {
    const { results } = await this.database
      .prepare(
        `SELECT id, activity_id, nickname, agent_name, recovery_token
         FROM participant_seats WHERE activity_id = ? ORDER BY joined_at, id`,
      )
      .bind(activityId)
      .all<SeatRow>();
    return results.map(toSeat);
  }

  async getEntry(activityId: string, roundIndex: number, seatId: string) {
    const row = await this.database
      .prepare(
        `SELECT activity_id, round_index, seat_id, v1, improvement_prompt, v2, updated_at
         FROM live_round_entries
         WHERE activity_id = ? AND round_index = ? AND seat_id = ?`,
      )
      .bind(activityId, roundIndex, seatId)
      .first<EntryRow>();
    return row ? toEntry(row) : undefined;
  }

  async listEntries(activityId: string, roundIndex: number) {
    const { results } = await this.database
      .prepare(
        `SELECT activity_id, round_index, seat_id, v1, improvement_prompt, v2, updated_at
         FROM live_round_entries WHERE activity_id = ? AND round_index = ?`,
      )
      .bind(activityId, roundIndex)
      .all<EntryRow>();
    return results.map(toEntry);
  }

  async saveEntry(entry: LiveRoundEntry) {
    await this.database
      .prepare(
        `INSERT INTO live_round_entries
          (id, activity_id, round_index, seat_id, v1, improvement_prompt, v2, updated_at)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?)
         ON CONFLICT(activity_id, round_index, seat_id) DO UPDATE SET
           v1 = excluded.v1,
           improvement_prompt = excluded.improvement_prompt,
           v2 = excluded.v2,
           updated_at = excluded.updated_at`,
      )
      .bind(
        crypto.randomUUID(),
        entry.activityId,
        entry.roundIndex,
        entry.seatId,
        entry.v1,
        entry.improvementPrompt,
        entry.v2,
        entry.updatedAt,
      )
      .run();
  }

  async saveVote(vote: LiveVote) {
    await this.database
      .prepare(
        `INSERT INTO live_votes
          (id, activity_id, round_index, voter_seat_id, candidate_seat_id)
         VALUES (?, ?, ?, ?, ?)
         ON CONFLICT(activity_id, round_index, voter_seat_id) DO UPDATE SET
           candidate_seat_id = excluded.candidate_seat_id`,
      )
      .bind(
        crypto.randomUUID(),
        vote.activityId,
        vote.roundIndex,
        vote.voterSeatId,
        vote.candidateSeatId,
      )
      .run();
  }

  async listVotes(activityId: string, roundIndex: number) {
    const { results } = await this.database
      .prepare(
        `SELECT activity_id, round_index, voter_seat_id, candidate_seat_id
         FROM live_votes WHERE activity_id = ? AND round_index = ?`,
      )
      .bind(activityId, roundIndex)
      .all<VoteRow>();
    return results.map(toVote);
  }

  async saveScore(score: LiveAiScore) {
    await this.database
      .prepare(
        `INSERT INTO live_ai_scores (id, activity_id, round_index, seat_id, score)
         VALUES (?, ?, ?, ?, ?)
         ON CONFLICT(activity_id, round_index, seat_id) DO UPDATE SET
           score = excluded.score`,
      )
      .bind(
        crypto.randomUUID(),
        score.activityId,
        score.roundIndex,
        score.seatId,
        score.score,
      )
      .run();
  }

  async listScores(activityId: string, roundIndex: number) {
    const { results } = await this.database
      .prepare(
        `SELECT activity_id, round_index, seat_id, score
         FROM live_ai_scores WHERE activity_id = ? AND round_index = ?`,
      )
      .bind(activityId, roundIndex)
      .all<ScoreRow>();
    return results.map(toScore);
  }

  async setProgress(activityId: string, roundIndex: number, stage: LiveStage) {
    await this.database
      .prepare(
        `UPDATE activities
         SET current_round_index = ?, current_stage = ?,
             review_started_at = CASE
               WHEN ? = 'voting' THEN COALESCE(review_started_at, CURRENT_TIMESTAMP)
               ELSE review_started_at
             END
         WHERE id = ?`,
      )
      .bind(roundIndex, stage, stage, activityId)
      .run();
  }
}
