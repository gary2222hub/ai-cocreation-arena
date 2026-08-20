export type LiveStage =
  | "lobby"
  | "v1"
  | "v2"
  | "voting"
  | "reveal"
  | "discussion"
  | "scoring"
  | "results"
  | "complete";

export interface LiveRound {
  title: string;
  prompt: string;
}

export interface LiveActivity {
  id: string;
  name: string;
  currentRoundIndex: number;
  currentStage: LiveStage;
  rounds: LiveRound[];
}

export interface LiveSeat {
  id: string;
  activityId: string;
  nickname: string;
  agentName: string;
  recoveryToken: string;
}

export interface LiveRoundEntry {
  activityId: string;
  roundIndex: number;
  seatId: string;
  v1: string;
  improvementPrompt: string;
  v2: string;
  updatedAt: string;
}

export interface LiveVote {
  activityId: string;
  roundIndex: number;
  voterSeatId: string;
  candidateSeatId: string;
}

export interface LiveAiScore {
  activityId: string;
  roundIndex: number;
  seatId: string;
  score: number;
}

export interface LiveEventStore {
  getActivityByCapability(
    token: string,
    purpose: "participant" | "host" | "display" | "report",
  ): Promise<LiveActivity | undefined>;
  findSeat(activityId: string, recoveryToken: string): Promise<LiveSeat | undefined>;
  listSeats(activityId: string): Promise<LiveSeat[]>;
  getEntry(activityId: string, roundIndex: number, seatId: string): Promise<LiveRoundEntry | undefined>;
  listEntries(activityId: string, roundIndex: number): Promise<LiveRoundEntry[]>;
  saveEntry(entry: LiveRoundEntry): Promise<void>;
  saveVote(vote: LiveVote): Promise<void>;
  listVotes(activityId: string, roundIndex: number): Promise<LiveVote[]>;
  saveScore(score: LiveAiScore): Promise<void>;
  listScores(activityId: string, roundIndex: number): Promise<LiveAiScore[]>;
  setProgress(activityId: string, roundIndex: number, stage: LiveStage): Promise<void>;
}

export class LiveEventError extends Error {
  readonly code:
    | "invalid-entry"
    | "invalid-seat"
    | "stage-closed"
    | "self-vote"
    | "invalid-score";

  constructor(code: LiveEventError["code"], message: string) {
    super(message);
    this.code = code;
  }
}

const stageLabels: Record<LiveStage, string> = {
  lobby: "候场",
  v1: "第一版回答",
  v2: "改进回答",
  voting: "匿名互评",
  reveal: "身份揭晓",
  discussion: "自由交流",
  scoring: "AI 评分",
  results: "本轮结果",
  complete: "活动完成",
};

export function liveStageLabel(stage: LiveStage) {
  return stageLabels[stage];
}

function clean(value: unknown) {
  return typeof value === "string" ? value.trim() : "";
}

async function requireActivity(
  token: string,
  purpose: "participant" | "host" | "display" | "report",
  store: LiveEventStore,
) {
  const activity = await store.getActivityByCapability(clean(token), purpose);
  if (!activity) {
    throw new LiveEventError("invalid-entry", "活动入口无效。");
  }
  return activity;
}

async function requireSeat(
  activityId: string,
  recoveryToken: string,
  store: LiveEventStore,
) {
  const seat = await store.findSeat(activityId, clean(recoveryToken));
  if (!seat) {
    throw new LiveEventError("invalid-seat", "参赛席位无法恢复，请重新加入。");
  }
  return seat;
}

function labelsFor(seats: LiveSeat[], roundIndex: number) {
  const alphabet = "ABCDEFGHIJKLMNOPQRSTUVWXYZ";
  return new Map(
    seats.map((seat, index) => [
      seat.id,
      alphabet[(index + roundIndex) % seats.length] ?? String(index + 1),
    ]),
  );
}

async function roundResults(activity: LiveActivity, store: LiveEventStore, roundIndex: number) {
  const [seats, votes, scores] = await Promise.all([
    store.listSeats(activity.id),
    store.listVotes(activity.id, roundIndex),
    store.listScores(activity.id, roundIndex),
  ]);
  const voteCounts = new Map<string, number>();
  for (const vote of votes) {
    voteCounts.set(vote.candidateSeatId, (voteCounts.get(vote.candidateSeatId) ?? 0) + 1);
  }
  const scoreBySeat = new Map(scores.map((score) => [score.seatId, score.score]));
  return seats
    .map((seat) => {
      const aiScore = scoreBySeat.get(seat.id) ?? 0;
      const peerVotes = voteCounts.get(seat.id) ?? 0;
      return {
        seatId: seat.id,
        nickname: seat.nickname,
        agentName: seat.agentName,
        aiScore,
        votes: peerVotes,
        roundScore: aiScore + peerVotes,
      };
    })
    .sort(
      (left, right) =>
        right.roundScore - left.roundScore ||
        right.aiScore - left.aiScore ||
        left.nickname.localeCompare(right.nickname, "zh-CN"),
    );
}

async function totalResults(activity: LiveActivity, store: LiveEventStore) {
  const seats = await store.listSeats(activity.id);
  const totals = new Map(seats.map((seat) => [seat.id, 0]));
  for (let roundIndex = 0; roundIndex < activity.rounds.length; roundIndex += 1) {
    for (const result of await roundResults(activity, store, roundIndex)) {
      totals.set(result.seatId, (totals.get(result.seatId) ?? 0) + result.roundScore);
    }
  }
  return seats
    .map((seat) => ({
      seatId: seat.id,
      nickname: seat.nickname,
      agentName: seat.agentName,
      totalScore: totals.get(seat.id) ?? 0,
    }))
    .sort(
      (left, right) =>
        right.totalScore - left.totalScore ||
        left.nickname.localeCompare(right.nickname, "zh-CN"),
    );
}

const awardTitles = [
  "共创总冠军",
  "共创亚军",
  "共创季军",
  "最幽默表达奖",
  "最犀利批判奖",
  "最像老板奖",
  "最佳战略奖",
  "最严谨论证奖",
  "最清晰表达奖",
  "最有画面奖",
  "最敢说真话奖",
  "最会讲故事奖",
];

function awardsFor(totals: Awaited<ReturnType<typeof totalResults>>) {
  return totals.map((result, index) => ({
    seatId: result.seatId,
    nickname: result.nickname,
    agentName: result.agentName,
    title: awardTitles[index] ?? `共创荣誉奖 ${index + 1}`,
    type: index < 3 ? ("ranking" as const) : ("special" as const),
  }));
}

async function snapshot(
  activity: LiveActivity,
  store: LiveEventStore,
  ownSeat?: LiveSeat,
) {
  const round = activity.rounds[activity.currentRoundIndex] ?? activity.rounds.at(-1);
  const [seats, entries, votes, scores] = await Promise.all([
    store.listSeats(activity.id),
    store.listEntries(activity.id, activity.currentRoundIndex),
    store.listVotes(activity.id, activity.currentRoundIndex),
    store.listScores(activity.id, activity.currentRoundIndex),
  ]);
  const entryBySeat = new Map(entries.map((entry) => [entry.seatId, entry]));
  const labels = labelsFor(seats, activity.currentRoundIndex);
  const identitiesVisible = ["reveal", "discussion", "scoring", "results", "complete"].includes(
    activity.currentStage,
  );
  const answers = seats.map((seat) => {
    const entry = entryBySeat.get(seat.id);
    return {
      seatId: seat.id,
      anonymousLabel: labels.get(seat.id) ?? "?",
      isOwn: seat.id === ownSeat?.id,
      ...(identitiesVisible
        ? { nickname: seat.nickname, agentName: seat.agentName }
        : {}),
      v1: entry?.v1 ?? "",
      improvementPrompt: entry?.improvementPrompt ?? "",
      v2: entry?.v2 ?? "",
    };
  });
  const visibleSeats = seats.map(({ id, nickname, agentName }) => ({
    id,
    nickname,
    agentName,
  }));
  const totals = await totalResults(activity, store);
  return {
    activity: {
      id: activity.id,
      name: activity.name,
      stage: activity.currentStage,
      stageLabel: liveStageLabel(activity.currentStage),
      roundIndex: activity.currentRoundIndex,
      roundNumber: activity.currentRoundIndex + 1,
      roundCount: activity.rounds.length,
      round,
    },
    seats: visibleSeats,
    answers,
    votes,
    scores,
    results: await roundResults(activity, store, activity.currentRoundIndex),
    totals,
    awards: awardsFor(totals),
    ownSeat: ownSeat
      ? { id: ownSeat.id, nickname: ownSeat.nickname, agentName: ownSeat.agentName }
      : undefined,
    ownEntry: ownSeat ? entryBySeat.get(ownSeat.id) : undefined,
    ownVote: ownSeat
      ? votes.find((vote) => vote.voterSeatId === ownSeat.id)
      : undefined,
  };
}

export type LiveEventSnapshot = Awaited<ReturnType<typeof snapshot>>;

export async function getParticipantLiveEvent(
  participantToken: string,
  recoveryToken: string,
  store: LiveEventStore,
) {
  const activity = await requireActivity(participantToken, "participant", store);
  const seat = await requireSeat(activity.id, recoveryToken, store);
  return snapshot(activity, store, seat);
}

export async function getHostLiveEvent(hostToken: string, store: LiveEventStore) {
  const activity = await requireActivity(hostToken, "host", store);
  return snapshot(activity, store);
}

export async function getDisplayLiveEvent(displayToken: string, store: LiveEventStore) {
  const activity = await requireActivity(displayToken, "display", store);
  const view = await snapshot(activity, store);
  return { ...view, seats: undefined, votes: undefined, scores: undefined };
}

export async function getFullReport(reportToken: string, store: LiveEventStore) {
  const activity = await requireActivity(reportToken, "report", store);
  const seats = await store.listSeats(activity.id);
  const rounds = await Promise.all(
    activity.rounds.map(async (round, roundIndex) => {
      const [entries, votes, scores, results] = await Promise.all([
        store.listEntries(activity.id, roundIndex),
        store.listVotes(activity.id, roundIndex),
        store.listScores(activity.id, roundIndex),
        roundResults(activity, store, roundIndex),
      ]);
      const entryBySeat = new Map(entries.map((entry) => [entry.seatId, entry]));
      const labels = labelsFor(seats, roundIndex);
      return {
        roundNumber: roundIndex + 1,
        title: round.title,
        prompt: round.prompt,
        answers: seats.map((seat) => {
          const entry = entryBySeat.get(seat.id);
          return {
            seatId: seat.id,
            anonymousLabel: labels.get(seat.id) ?? "?",
            nickname: seat.nickname,
            agentName: seat.agentName,
            v1: entry?.v1 ?? "",
            improvementPrompt: entry?.improvementPrompt ?? "",
            v2: entry?.v2 ?? "",
          };
        }),
        votes,
        scores,
        results,
      };
    }),
  );
  const totals = await totalResults(activity, store);
  return {
    exportedAt: new Date().toISOString(),
    activity: {
      id: activity.id,
      name: activity.name,
      stage: activity.currentStage,
      roundCount: activity.rounds.length,
    },
    participants: seats.map(({ id, nickname, agentName }) => ({ id, nickname, agentName })),
    rounds,
    totals,
    awards: awardsFor(totals),
  };
}

export type FullLiveReport = Awaited<ReturnType<typeof getFullReport>>;

function validateContent(value: unknown, label: string, maxLength: number) {
  const content = clean(value);
  if (!content || [...content].length > maxLength) {
    throw new LiveEventError("invalid-entry", `${label}需要填写，且不能超过 ${maxLength} 个字符。`);
  }
  return content;
}

export async function saveRoundEntry(
  participantToken: string,
  recoveryToken: string,
  input: { v1?: unknown; improvementPrompt?: unknown; v2?: unknown },
  store: LiveEventStore,
) {
  const activity = await requireActivity(participantToken, "participant", store);
  const seat = await requireSeat(activity.id, recoveryToken, store);
  const existing = await store.getEntry(activity.id, activity.currentRoundIndex, seat.id);
  if (input.v1 !== undefined && activity.currentStage !== "v1") {
    throw new LiveEventError("stage-closed", "第一版阶段已经结束，不能再修改。");
  }
  if (
    (input.improvementPrompt !== undefined || input.v2 !== undefined) &&
    activity.currentStage !== "v2"
  ) {
    throw new LiveEventError("stage-closed", "改进回答阶段已经结束，不能再修改。");
  }
  const next: LiveRoundEntry = {
    activityId: activity.id,
    roundIndex: activity.currentRoundIndex,
    seatId: seat.id,
    v1: input.v1 === undefined ? (existing?.v1 ?? "") : validateContent(input.v1, "V1", 700),
    improvementPrompt:
      input.improvementPrompt === undefined
        ? (existing?.improvementPrompt ?? "")
        : validateContent(input.improvementPrompt, "追加 Prompt", 500),
    v2: input.v2 === undefined ? (existing?.v2 ?? "") : validateContent(input.v2, "V2", 700),
    updatedAt: new Date().toISOString(),
  };
  await store.saveEntry(next);
  return next;
}

export async function saveVote(
  participantToken: string,
  recoveryToken: string,
  candidateSeatId: string,
  store: LiveEventStore,
) {
  const activity = await requireActivity(participantToken, "participant", store);
  if (activity.currentStage !== "voting") {
    throw new LiveEventError("stage-closed", "匿名互评已经结束。");
  }
  const voter = await requireSeat(activity.id, recoveryToken, store);
  const seats = await store.listSeats(activity.id);
  const candidate = seats.find((seat) => seat.id === clean(candidateSeatId));
  if (!candidate) {
    throw new LiveEventError("invalid-seat", "被投票的作品不存在。");
  }
  if (candidate.id === voter.id) {
    throw new LiveEventError("self-vote", "不能投给自己的作品。");
  }
  await store.saveVote({
    activityId: activity.id,
    roundIndex: activity.currentRoundIndex,
    voterSeatId: voter.id,
    candidateSeatId: candidate.id,
  });
}

export async function saveAiScore(
  hostToken: string,
  seatId: string,
  score: number,
  store: LiveEventStore,
) {
  const activity = await requireActivity(hostToken, "host", store);
  if (activity.currentStage !== "scoring") {
    throw new LiveEventError("stage-closed", "当前不是 AI 评分阶段。");
  }
  if (!Number.isInteger(score) || score < 0 || score > 10) {
    throw new LiveEventError("invalid-score", "AI 评分必须是 0–10 的整数。");
  }
  const seats = await store.listSeats(activity.id);
  if (!seats.some((seat) => seat.id === clean(seatId))) {
    throw new LiveEventError("invalid-seat", "参赛作品不存在。");
  }
  await store.saveScore({
    activityId: activity.id,
    roundIndex: activity.currentRoundIndex,
    seatId: clean(seatId),
    score,
  });
}

export async function saveHistoricalAiScore(
  hostToken: string,
  roundIndex: number,
  seatId: string,
  score: number,
  store: LiveEventStore,
) {
  const activity = await requireActivity(hostToken, "host", store);
  if (!Number.isInteger(roundIndex) || roundIndex < 0 || roundIndex >= activity.currentRoundIndex) {
    throw new LiveEventError("stage-closed", "只能补录已经完成轮次的 AI 评分。");
  }
  if (!Number.isInteger(score) || score < 0 || score > 10) {
    throw new LiveEventError("invalid-score", "AI 评分必须是 0–10 的整数。");
  }
  const seats = await store.listSeats(activity.id);
  if (!seats.some((seat) => seat.id === clean(seatId))) {
    throw new LiveEventError("invalid-seat", "参赛作品不存在。");
  }
  await store.saveScore({
    activityId: activity.id,
    roundIndex,
    seatId: clean(seatId),
    score,
  });
}

export async function advanceLiveEvent(hostToken: string, store: LiveEventStore) {
  const activity = await requireActivity(hostToken, "host", store);
  if (activity.currentStage === "scoring") {
    const [seats, scores] = await Promise.all([
      store.listSeats(activity.id),
      store.listScores(activity.id, activity.currentRoundIndex),
    ]);
    if (scores.length < seats.length) {
      throw new LiveEventError("invalid-score", "请先完成全部 AI 评分，再公布本轮结果。");
    }
  }
  const nextStage: Record<Exclude<LiveStage, "complete">, LiveStage> = {
    lobby: "v1",
    v1: "v2",
    v2: "voting",
    voting: "reveal",
    reveal: "discussion",
    discussion: "scoring",
    scoring: "results",
    results:
      activity.currentRoundIndex + 1 < activity.rounds.length ? "v1" : "complete",
  };
  if (activity.currentStage === "complete") {
    return activity;
  }
  const stage = nextStage[activity.currentStage];
  const roundIndex =
    activity.currentStage === "results" && stage === "v1"
      ? activity.currentRoundIndex + 1
      : activity.currentRoundIndex;
  await store.setProgress(activity.id, roundIndex, stage);
  return { ...activity, currentRoundIndex: roundIndex, currentStage: stage };
}

export interface InMemoryLiveEventSeed {
  activity: Omit<LiveActivity, "id"> & {
    id: string;
    participantToken: string;
    hostToken: string;
    displayToken: string;
    reportToken?: string;
  };
  seats: Array<Omit<LiveSeat, "activityId">>;
}

export class InMemoryLiveEventStore implements LiveEventStore {
  private activity: LiveActivity;
  private readonly tokens: Record<"participant" | "host" | "display" | "report", string>;
  private readonly seats: LiveSeat[];
  private readonly entries = new Map<string, LiveRoundEntry>();
  private readonly votes = new Map<string, LiveVote>();
  private readonly scores = new Map<string, LiveAiScore>();

  constructor(seed: InMemoryLiveEventSeed) {
    const { participantToken, hostToken, displayToken, reportToken, ...activity } = seed.activity;
    this.activity = structuredClone(activity);
    this.tokens = { participant: participantToken, host: hostToken, display: displayToken, report: reportToken ?? "report-a" };
    this.seats = seed.seats.map((seat) => ({ ...structuredClone(seat), activityId: activity.id }));
  }

  async getActivityByCapability(token: string, purpose: "participant" | "host" | "display" | "report") {
    return this.tokens[purpose] === token ? structuredClone(this.activity) : undefined;
  }

  async findSeat(activityId: string, recoveryToken: string) {
    const seat = this.seats.find(
      (candidate) => candidate.activityId === activityId && candidate.recoveryToken === recoveryToken,
    );
    return seat ? structuredClone(seat) : undefined;
  }

  async listSeats(activityId: string) {
    return this.seats.filter((seat) => seat.activityId === activityId).map((seat) => structuredClone(seat));
  }

  private key(activityId: string, roundIndex: number, seatId: string) {
    return `${activityId}:${roundIndex}:${seatId}`;
  }

  async getEntry(activityId: string, roundIndex: number, seatId: string) {
    const entry = this.entries.get(this.key(activityId, roundIndex, seatId));
    return entry ? structuredClone(entry) : undefined;
  }

  async listEntries(activityId: string, roundIndex: number) {
    return [...this.entries.values()]
      .filter((entry) => entry.activityId === activityId && entry.roundIndex === roundIndex)
      .map((entry) => structuredClone(entry));
  }

  async saveEntry(entry: LiveRoundEntry) {
    this.entries.set(this.key(entry.activityId, entry.roundIndex, entry.seatId), structuredClone(entry));
  }

  async saveVote(vote: LiveVote) {
    this.votes.set(this.key(vote.activityId, vote.roundIndex, vote.voterSeatId), structuredClone(vote));
  }

  async listVotes(activityId: string, roundIndex: number) {
    return [...this.votes.values()]
      .filter((vote) => vote.activityId === activityId && vote.roundIndex === roundIndex)
      .map((vote) => structuredClone(vote));
  }

  async saveScore(score: LiveAiScore) {
    this.scores.set(this.key(score.activityId, score.roundIndex, score.seatId), structuredClone(score));
  }

  async listScores(activityId: string, roundIndex: number) {
    return [...this.scores.values()]
      .filter((score) => score.activityId === activityId && score.roundIndex === roundIndex)
      .map((score) => structuredClone(score));
  }

  async setProgress(activityId: string, roundIndex: number, stage: LiveStage) {
    if (activityId !== this.activity.id) return;
    this.activity = { ...this.activity, currentRoundIndex: roundIndex, currentStage: stage };
  }
}
