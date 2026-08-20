export type LobbyStatus = "lobby" | "v1";

export interface LobbyActivity {
  id: string;
  name: string;
  roomCode: string;
  participantLimit: number;
  status: LobbyStatus;
  rosterLockedAt: string | null;
  lockedSeatLimit: number | null;
  reviewStartedAt: string | null;
}

export type LobbyActivitySeed = LobbyActivity & {
  participantLinkToken: string;
  hostLinkToken: string;
};

export interface ParticipantSeat {
  id: string;
  activityId: string;
  nickname: string;
  agentName: string;
  recoveryToken: string;
  joinedAt: string;
  lastSeenAt: string;
}

export interface JoinLobbyInput {
  participantLinkToken: string;
  roomCode: string;
  nickname: string;
  agentName: string;
  recoveryToken?: string;
}

export function canJoinParticipantLobby(
  activity: Pick<LobbyActivity, "rosterLockedAt" | "lockedSeatLimit">,
  seatCount: number,
) {
  return (
    !activity.rosterLockedAt ||
    (activity.lockedSeatLimit !== null && seatCount < activity.lockedSeatLimit)
  );
}

export interface LobbyStore {
  getByParticipantLink(token: string): Promise<LobbyActivity | undefined>;
  getByHostLink(token: string): Promise<LobbyActivity | undefined>;
  findSeatByRecoveryToken(
    activityId: string,
    recoveryToken: string,
  ): Promise<ParticipantSeat | undefined>;
  addSeat(activity: LobbyActivity, seat: ParticipantSeat): Promise<void>;
  listSeats(activityId: string): Promise<ParticipantSeat[]>;
  touchSeat(
    activityId: string,
    recoveryToken: string,
    seenAt: string,
  ): Promise<ParticipantSeat | undefined>;
  lockRoster(activityId: string, lockedAt: string): Promise<LobbyActivity>;
  removeSeat(activity: LobbyActivity, seatId: string): Promise<void>;
}

export async function getHostLobby(
  hostLinkToken: string,
  store: LobbyStore,
  now: () => Date,
) {
  const activity = await store.getByHostLink(clean(hostLinkToken));
  if (!activity) {
    throw new LobbyError("invalid-entry", "主持链接无效。");
  }
  const currentTime = now().getTime();
  const seats = (await store.listSeats(activity.id)).map((seat) => ({
    id: seat.id,
    nickname: seat.nickname,
    agentName: seat.agentName,
    connectionStatus:
      currentTime - Date.parse(seat.lastSeenAt) <= 15_000
        ? ("connected" as const)
        : ("disconnected" as const),
  }));
  return {
    activity: {
      id: activity.id,
      name: activity.name,
      roomCode: activity.roomCode,
      participantLimit: activity.participantLimit,
      status: activity.status,
      rosterLockedAt: activity.rosterLockedAt,
      lockedSeatLimit: activity.lockedSeatLimit,
      reviewStartedAt: activity.reviewStartedAt,
    },
    seats,
  };
}

export async function getParticipantLobby(
  participantLinkToken: string,
  store: LobbyStore,
) {
  const activity = await store.getByParticipantLink(
    clean(participantLinkToken),
  );
  if (!activity) {
    throw new LobbyError("invalid-entry", "活动链接无效。");
  }
  return {
    activity: {
      id: activity.id,
      name: activity.name,
      participantLimit: activity.participantLimit,
      status: activity.status,
      rosterLockedAt: activity.rosterLockedAt,
      lockedSeatLimit: activity.lockedSeatLimit,
    },
    seatCount: (await store.listSeats(activity.id)).length,
  };
}

export async function heartbeat(
  participantLinkToken: string,
  recoveryToken: string,
  store: LobbyStore,
  now: () => Date,
) {
  const activity = await store.getByParticipantLink(
    clean(participantLinkToken),
  );
  if (!activity) {
    throw new LobbyError("invalid-entry", "活动链接无效。");
  }
  const seat = await store.touchSeat(
    activity.id,
    clean(recoveryToken),
    now().toISOString(),
  );
  if (!seat) {
    throw new LobbyError("invalid-seat", "参赛席位无法恢复，请重新加入。");
  }
  return seat;
}

export class LobbyError extends Error {
  readonly code:
    | "invalid-entry"
    | "duplicate-seat"
    | "lobby-full"
    | "roster-locked"
    | "invalid-seat"
    | "not-enough-participants"
    | "review-started";

  constructor(code: LobbyError["code"], message: string) {
    super(message);
    this.code = code;
  }
}

export async function lockRoster(
  hostLinkToken: string,
  store: LobbyStore,
  now: () => Date,
) {
  const activity = await store.getByHostLink(clean(hostLinkToken));
  if (!activity) {
    throw new LobbyError("invalid-entry", "主持链接无效。");
  }
  return store.lockRoster(activity.id, now().toISOString());
}

export async function removeSeat(
  hostLinkToken: string,
  seatId: string,
  store: LobbyStore,
) {
  const activity = await store.getByHostLink(clean(hostLinkToken));
  if (!activity) {
    throw new LobbyError("invalid-entry", "主持链接无效。");
  }
  await store.removeSeat(activity, clean(seatId));
}

function clean(value: unknown) {
  return typeof value === "string" ? value.trim() : "";
}

export async function joinLobby(
  input: JoinLobbyInput,
  dependencies: {
    store: LobbyStore;
    now: () => Date;
    token: () => string;
  },
) {
  const activity = await dependencies.store.getByParticipantLink(
    clean(input.participantLinkToken),
  );
  if (!activity) {
    throw new LobbyError(
      "invalid-entry",
      "活动链接无效，请向主持人确认。",
    );
  }

  if (clean(input.recoveryToken)) {
    const recovered = await dependencies.store.findSeatByRecoveryToken(
      activity.id,
      clean(input.recoveryToken),
    );
    if (recovered) {
      return {
        activity: { id: activity.id, name: activity.name, status: activity.status },
        seat: recovered,
        recoveryToken: recovered.recoveryToken,
        recovered: true,
      };
    }
  }

  if (clean(input.roomCode).toUpperCase() !== activity.roomCode.toUpperCase()) {
    throw new LobbyError(
      "invalid-entry",
      "房间码无效，请向主持人确认。",
    );
  }

  const nickname = clean(input.nickname);
  const agentName = clean(input.agentName);
  if (!nickname || !agentName || nickname.length > 40 || agentName.length > 40) {
    throw new LobbyError(
      "invalid-entry",
      "请填写不超过 40 个字符的昵称和 Agent 名称。",
    );
  }

  const timestamp = dependencies.now().toISOString();
  const seat: ParticipantSeat = {
    id: dependencies.token(),
    activityId: activity.id,
    nickname,
    agentName,
    recoveryToken: dependencies.token(),
    joinedAt: timestamp,
    lastSeenAt: timestamp,
  };
  await dependencies.store.addSeat(activity, seat);
  return {
    activity: { id: activity.id, name: activity.name, status: activity.status },
    seat,
    recoveryToken: seat.recoveryToken,
    recovered: false,
  };
}

export class InMemoryLobbyStore implements LobbyStore {
  private readonly activities = new Map<string, LobbyActivity>();
  private readonly participantLinks = new Map<string, string>();
  private readonly hostLinks = new Map<string, string>();
  private readonly seats = new Map<string, ParticipantSeat>();

  constructor(activities: LobbyActivitySeed[]) {
    for (const activity of activities) {
      const { participantLinkToken, hostLinkToken, ...record } = activity;
      this.activities.set(activity.id, structuredClone(record));
      this.participantLinks.set(participantLinkToken, activity.id);
      this.hostLinks.set(hostLinkToken, activity.id);
    }
  }

  async getByParticipantLink(token: string) {
    const activity = this.activities.get(this.participantLinks.get(token) ?? "");
    return activity ? structuredClone(activity) : undefined;
  }

  async getByHostLink(token: string) {
    const activity = this.activities.get(this.hostLinks.get(token) ?? "");
    return activity ? structuredClone(activity) : undefined;
  }

  async findSeatByRecoveryToken(activityId: string, recoveryToken: string) {
    const seat = [...this.seats.values()].find(
      (candidate) =>
        candidate.activityId === activityId &&
        candidate.recoveryToken === recoveryToken,
    );
    return seat ? structuredClone(seat) : undefined;
  }

  async addSeat(activity: LobbyActivity, seat: ParticipantSeat) {
    if (activity.reviewStartedAt) {
      throw new LobbyError(
        "review-started",
        "匿名阅卷已经开始，不能加入或更换参赛席位。",
      );
    }
    const seats = await this.listSeats(activity.id);
    const normalizedNickname = seat.nickname.toLocaleLowerCase();
    const normalizedAgentName = seat.agentName.toLocaleLowerCase();
    if (
      seats.some(
        (candidate) =>
          candidate.nickname.toLocaleLowerCase() === normalizedNickname ||
          candidate.agentName.toLocaleLowerCase() === normalizedAgentName,
      )
    ) {
      throw new LobbyError(
        "duplicate-seat",
        "该昵称或 Agent 名称已被使用，请更换后重试。",
      );
    }

    const limit = activity.rosterLockedAt
      ? (activity.lockedSeatLimit ?? 0)
      : activity.participantLimit;
    if (seats.length >= limit) {
      throw new LobbyError(
        activity.rosterLockedAt ? "roster-locked" : "lobby-full",
        activity.rosterLockedAt
          ? "参赛名单已锁定，暂时没有可恢复的席位。"
          : "候场人数已满，请联系主持人。",
      );
    }
    this.seats.set(seat.id, structuredClone(seat));
  }

  async listSeats(activityId: string) {
    return [...this.seats.values()]
      .filter((seat) => seat.activityId === activityId)
      .map((seat) => structuredClone(seat));
  }

  async touchSeat(activityId: string, recoveryToken: string, seenAt: string) {
    const seat = [...this.seats.values()].find(
      (candidate) =>
        candidate.activityId === activityId &&
        candidate.recoveryToken === recoveryToken,
    );
    if (!seat) return undefined;
    seat.lastSeenAt = seenAt;
    return structuredClone(seat);
  }

  async lockRoster(activityId: string, lockedAt: string) {
    const activity = this.activities.get(activityId);
    if (!activity) {
      throw new LobbyError("invalid-entry", "活动不存在。");
    }
    if (activity.rosterLockedAt) return structuredClone(activity);
    const seats = await this.listSeats(activityId);
    if (seats.length < 3) {
      throw new LobbyError(
        "not-enough-participants",
        "至少需要 3 名参赛者才能启动第一版。",
      );
    }
    activity.rosterLockedAt = lockedAt;
    activity.lockedSeatLimit = seats.length;
    activity.status = "v1";
    return structuredClone(activity);
  }

  async removeSeat(activity: LobbyActivity, seatId: string) {
    if (activity.reviewStartedAt) {
      throw new LobbyError(
        "review-started",
        "匿名阅卷已经开始，不能移除或更换参赛席位。",
      );
    }
    const seat = this.seats.get(seatId);
    if (!seat || seat.activityId !== activity.id) {
      throw new LobbyError("invalid-seat", "参赛席位不存在。");
    }
    this.seats.delete(seatId);
  }
}
