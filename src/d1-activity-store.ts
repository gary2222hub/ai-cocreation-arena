import {
  ActivityCreationError,
  type ActivityRecord,
  type ActivityStore,
  type CapabilityRecord,
  type LinkPurpose,
} from "./activity-creation.ts";

interface CapabilityRow {
  purpose: LinkPurpose;
  id: string;
  room_code: string;
  template: ActivityRecord["template"];
  name: string;
  starts_at: string;
  ends_at: string;
  participant_limit: number;
  rounds_json: string;
  status: ActivityRecord["status"];
  created_at: string;
}

export class D1ActivityStore implements ActivityStore {
  private readonly database: D1Database;

  constructor(database: D1Database) {
    this.database = database;
  }

  async redeemInvitationAndCreate(
    invitationCode: string,
    activity: ActivityRecord,
    capabilities: CapabilityRecord[],
  ) {
    const invitation = await this.database
      .prepare("SELECT status FROM invitations WHERE code = ?")
      .bind(invitationCode)
      .first<{ status: string }>();
    if (invitation?.status !== "active") {
      throw new ActivityCreationError(
        "invalid-invitation",
        "邀请码无效、已撤销或已被使用。",
      );
    }

    const statements = [
      this.database
        .prepare(
          `INSERT INTO activities
            (id, room_code, invitation_code, template, name, starts_at, ends_at,
             participant_limit, rounds_json, status, created_at)
           SELECT ?, ?, code, ?, ?, ?, ?, ?, ?, ?, ?
           FROM invitations WHERE code = ? AND status = 'active'`,
        )
        .bind(
          activity.id,
          activity.roomCode,
          activity.template,
          activity.name,
          activity.startsAt,
          activity.endsAt,
          activity.participantLimit,
          JSON.stringify(activity.rounds),
          activity.status,
          activity.createdAt,
          invitationCode,
        ),
      ...capabilities.map((capability) =>
        this.database
          .prepare(
            `INSERT INTO capabilities (token, activity_id, purpose)
             VALUES (?, ?, ?)`,
          )
          .bind(capability.token, capability.activityId, capability.purpose),
      ),
      this.database
        .prepare(
          `UPDATE invitations SET status = 'used', used_at = ?
           WHERE code = ? AND status = 'active'`,
        )
        .bind(activity.createdAt, invitationCode),
    ];

    try {
      await this.database.batch(statements);
    } catch (error) {
      const latest = await this.database
        .prepare("SELECT status FROM invitations WHERE code = ?")
        .bind(invitationCode)
        .first<{ status: string }>();
      if (latest?.status !== "active") {
        throw new ActivityCreationError(
          "invalid-invitation",
          "邀请码无效、已撤销或已被使用。",
        );
      }
      throw error;
    }
  }

  async getActivityForCapability(token: string) {
    const row = await this.database
      .prepare(
        `SELECT c.purpose, a.id, a.room_code, a.template, a.name, a.starts_at, a.ends_at,
                a.participant_limit, a.rounds_json, a.status, a.created_at
         FROM capabilities c
         JOIN activities a ON a.id = c.activity_id
         WHERE c.token = ?`,
      )
      .bind(token)
      .first<CapabilityRow>();

    if (!row) return undefined;
    return {
      purpose: row.purpose,
      activity: {
        id: row.id,
        roomCode: row.room_code,
        template: row.template,
        name: row.name,
        startsAt: row.starts_at,
        endsAt: row.ends_at,
        participantLimit: row.participant_limit,
        rounds: JSON.parse(row.rounds_json) as ActivityRecord["rounds"],
        status: row.status,
        createdAt: row.created_at,
      },
    };
  }
}
