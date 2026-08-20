export type InvitationStatus = "active" | "revoked" | "used";
export type ActivityTemplate = "prompt-challenge" | "blank";
export type ActivityStatus = "lobby" | "v1";
export type LinkPurpose =
  | "organizer"
  | "host"
  | "participant"
  | "display"
  | "report";

export interface RoundConfiguration {
  title: string;
  prompt: string;
  submitMinutes: number;
  reviewMinutes: number;
  scoring: string;
  award: string;
}

export interface CreateActivityInput {
  /** Legacy field; public deployments no longer require an invitation. */
  invitationCode?: string;
  template: ActivityTemplate;
  name: string;
  startsAt: string;
  endsAt: string;
  participantLimit: number;
  rounds: RoundConfiguration[];
}

export interface ActivityRecord extends Omit<CreateActivityInput, "invitationCode"> {
  id: string;
  roomCode: string;
  status: ActivityStatus;
  createdAt: string;
}

export interface CapabilityRecord {
  activityId: string;
  purpose: LinkPurpose;
  token: string;
}

export interface ActivityStore {
  redeemInvitationAndCreate(
    invitationCode: string | undefined,
    activity: ActivityRecord,
    capabilities: CapabilityRecord[],
  ): Promise<void>;
  getActivityForCapability(
    token: string,
  ): Promise<{ activity: ActivityRecord; purpose: LinkPurpose } | undefined>;
}

export interface CreateActivityDependencies {
  store: ActivityStore;
  now: () => Date;
  token: () => string;
  baseUrl: string;
}

export class ActivityCreationError extends Error {
  readonly code:
    | "invalid-invitation"
    | "invalid-configuration"
    | "invalid-capability";

  constructor(
    code:
      | "invalid-invitation"
      | "invalid-configuration"
      | "invalid-capability",
    message: string,
  ) {
    super(message);
    this.code = code;
  }
}

export async function resolveCapability(
  token: string,
  expectedPurpose: LinkPurpose,
  store: ActivityStore,
) {
  const result = await store.getActivityForCapability(token);
  if (!result || result.purpose !== expectedPurpose) {
    throw new ActivityCreationError(
      "invalid-capability",
      "此链接无效，或无权访问当前页面。",
    );
  }
  return {
    purpose: result.purpose,
    activity: {
      id: result.activity.id,
      name: result.activity.name,
      status: result.activity.status,
      startsAt: result.activity.startsAt,
      participantLimit: result.activity.participantLimit,
      roundCount: result.activity.rounds.length,
    },
  };
}

export async function resolveOrganizerActivity(token: string, store: ActivityStore) {
  const result = await store.getActivityForCapability(token);
  if (!result || result.purpose !== "organizer") {
    throw new ActivityCreationError("invalid-capability", "此链接无效，或无权复制当前活动。");
  }
  return result.activity;
}

const paths: Record<LinkPurpose, string> = {
  organizer: "organizer",
  host: "host",
  participant: "event",
  display: "display",
  report: "report",
};

function required(value: unknown): value is string {
  return typeof value === "string" && value.trim().length > 0;
}

function validate(input: unknown): asserts input is CreateActivityInput {
  if (!input || typeof input !== "object") {
    throw new ActivityCreationError("invalid-configuration", "请完整填写活动配置。");
  }

  const candidate = input as Partial<CreateActivityInput>;
  const startsAt = required(candidate.startsAt) ? Date.parse(candidate.startsAt) : Number.NaN;
  const endsAt = required(candidate.endsAt) ? Date.parse(candidate.endsAt) : Number.NaN;
  const roundsComplete =
    Array.isArray(candidate.rounds) &&
    candidate.rounds.every(
      (round) =>
        round !== null &&
        typeof round === "object" &&
        required(round.title) &&
        required(round.prompt) &&
        required(round.scoring) &&
        required(round.award) &&
        Number.isInteger(round.submitMinutes) &&
        round.submitMinutes > 0 &&
        Number.isInteger(round.reviewMinutes) &&
        round.reviewMinutes > 0,
    );

  if (
    (candidate.template !== "prompt-challenge" && candidate.template !== "blank") ||
    !required(candidate.name) ||
    !Number.isFinite(startsAt) ||
    !Number.isFinite(endsAt) ||
    endsAt <= startsAt ||
    !Number.isInteger(candidate.participantLimit) ||
    candidate.participantLimit! < 3 ||
    candidate.participantLimit! > 12 ||
    !Array.isArray(candidate.rounds) ||
    candidate.rounds.length < 1 ||
    candidate.rounds.length > 2 ||
    !roundsComplete
  ) {
    throw new ActivityCreationError(
      "invalid-configuration",
      "请完整填写活动时间、3–12 人规模及 1–2 轮题目、时长、计分与奖项。",
    );
  }
}

export async function createActivity(
  input: unknown,
  dependencies: CreateActivityDependencies,
) {
  validate(input);

  const id = dependencies.token();
  const activity: ActivityRecord = {
    id,
    roomCode: id.replace(/[^a-z0-9]/gi, "").slice(0, 6).toUpperCase().padEnd(6, "0"),
    template: input.template,
    name: input.name.trim(),
    startsAt: new Date(input.startsAt).toISOString(),
    endsAt: new Date(input.endsAt).toISOString(),
    participantLimit: input.participantLimit,
    rounds: input.rounds,
    status: "lobby",
    createdAt: dependencies.now().toISOString(),
  };

  const purposes: LinkPurpose[] = [
    "organizer",
    "host",
    "participant",
    "display",
    "report",
  ];
  const capabilities = purposes.map((purpose) => ({
    activityId: id,
    purpose,
    token: dependencies.token(),
  }));

  await dependencies.store.redeemInvitationAndCreate(
    input.invitationCode?.trim(),
    activity,
    capabilities,
  );

  const baseUrl = dependencies.baseUrl.replace(/\/$/, "");
  const links = Object.fromEntries(
    capabilities.map(({ purpose, token }) => [
      purpose,
      `${baseUrl}/${paths[purpose]}/${token}`,
    ]),
  ) as Record<LinkPurpose, string>;

  return { activity, links };
}

export class InMemoryActivityStore implements ActivityStore {
  private readonly invitations = new Map<string, InvitationStatus>();
  private readonly activities = new Map<string, ActivityRecord>();
  private readonly capabilities = new Map<string, CapabilityRecord>();

  constructor(invitations: Array<{ code: string; status: InvitationStatus }> = []) {
    for (const invitation of invitations) {
      this.invitations.set(invitation.code, invitation.status);
    }
  }

  async redeemInvitationAndCreate(
    invitationCode: string | undefined,
    activity: ActivityRecord,
    capabilities: CapabilityRecord[],
  ) {
    if (invitationCode && this.invitations.get(invitationCode) !== "active") {
      throw new ActivityCreationError(
        "invalid-invitation",
        "邀请码无效、已撤销或已被使用。",
      );
    }

    if (invitationCode) this.invitations.set(invitationCode, "used");
    this.activities.set(activity.id, structuredClone(activity));
    for (const capability of capabilities) {
      this.capabilities.set(capability.token, { ...capability });
    }
  }

  async getInvitationStatus(code: string) {
    return this.invitations.get(code);
  }

  async getActivityForCapability(token: string) {
    const capability = this.capabilities.get(token);
    const activity = capability
      ? this.activities.get(capability.activityId)
      : undefined;
    if (!capability || !activity) return undefined;
    return {
      activity: structuredClone(activity),
      purpose: capability.purpose,
    };
  }
}
