"use client";

import { useCallback, useEffect, useState, type FormEvent } from "react";
import { canJoinParticipantLobby } from "../../../src/lobby";
import { ParticipantLive } from "./participant-live";

interface LobbySummary {
  activity: {
    id: string;
    name: string;
    participantLimit: number;
    status: "lobby" | "v1";
    rosterLockedAt: string | null;
    lockedSeatLimit: number | null;
  };
  seatCount: number;
}

interface OwnSeat {
  id: string;
  nickname: string;
  agentName: string;
  recoveryToken: string;
}

export function ParticipantLobby({ token }: { token: string }) {
  const storageKey = `arena-seat:${token}`;
  const [lobby, setLobby] = useState<LobbySummary | null>(null);
  const [seat, setSeat] = useState<OwnSeat | null>(null);
  const [loading, setLoading] = useState(true);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState("");

  const refreshLobby = useCallback(async () => {
    const response = await fetch(`/api/lobbies/${token}`);
    const payload = (await response.json()) as LobbySummary & { error?: string };
    if (!response.ok) throw new Error(payload.error ?? "活动入口不可用。");
    setLobby(payload);
    return payload;
  }, [token]);

  const acceptSeat = useCallback((payload: { seat: OwnSeat; recoveryToken: string }) => {
    localStorage.setItem(storageKey, payload.recoveryToken);
    setSeat(payload.seat);
  }, [storageKey]);

  useEffect(() => {
    let active = true;
    async function load() {
      try {
        await refreshLobby();
        const recoveryToken = localStorage.getItem(storageKey);
        if (recoveryToken) {
          const response = await fetch(`/api/lobbies/${token}`, {
            method: "POST",
            headers: { "content-type": "application/json" },
            body: JSON.stringify({ recoveryToken }),
          });
          const payload = (await response.json()) as {
            seat?: OwnSeat;
            recoveryToken?: string;
          };
          if (response.ok && payload.seat && payload.recoveryToken && active) {
            acceptSeat({ seat: payload.seat, recoveryToken: payload.recoveryToken });
          } else {
            localStorage.removeItem(storageKey);
          }
        }
      } catch (caught) {
        if (active) setError(caught instanceof Error ? caught.message : "活动入口不可用。");
      } finally {
        if (active) setLoading(false);
      }
    }
    void load();
    return () => { active = false; };
  }, [acceptSeat, refreshLobby, storageKey, token]);

  useEffect(() => {
    if (!seat) return;
    const sendHeartbeat = () =>
      fetch(`/api/lobbies/${token}`, {
        method: "PATCH",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ recoveryToken: seat.recoveryToken }),
      }).catch(() => undefined);
    void sendHeartbeat();
    const timer = window.setInterval(sendHeartbeat, 8_000);
    return () => window.clearInterval(timer);
  }, [seat, token]);

  useEffect(() => {
    if (!seat) return;
    const timer = window.setInterval(
      () => void refreshLobby().catch(() => undefined),
      2_000,
    );
    return () => window.clearInterval(timer);
  }, [refreshLobby, seat]);

  async function join(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setSubmitting(true);
    setError("");
    const form = new FormData(event.currentTarget);
    try {
      const response = await fetch(`/api/lobbies/${token}`, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          roomCode: form.get("roomCode"),
          nickname: form.get("nickname"),
          agentName: form.get("agentName"),
        }),
      });
      const payload = (await response.json()) as {
        seat?: OwnSeat;
        recoveryToken?: string;
        error?: string;
      };
      if (!response.ok || !payload.seat || !payload.recoveryToken) {
        throw new Error(payload.error ?? "加入失败，请检查信息。");
      }
      acceptSeat({ seat: payload.seat, recoveryToken: payload.recoveryToken });
      await refreshLobby();
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : "加入失败，请稍后重试。");
    } finally {
      setSubmitting(false);
    }
  }

  if (loading) {
    return <main className="surface"><div className="surface-card"><p>正在进入活动…</p></div></main>;
  }
  if (!lobby) {
    return <main className="surface"><div className="surface-card"><h1>活动入口不可用</h1><p className="form-error">{error}</p></div></main>;
  }
  if (seat) {
    if (lobby.activity.status === "v1") {
      return <ParticipantLive token={token} recoveryToken={seat.recoveryToken} />;
    }
    return (
      <main className="surface participant-surface">
        <div className="surface-card lobby-welcome">
          <div className="surface-meta"><span>参赛席位已连接</span><span className="connected-label">● 在线</span></div>
          <p className="eyebrow">WAITING ROOM</p>
          <h1>你好，{seat.nickname}</h1>
          <p className="hero-copy">你的 Agent 是 <b>{seat.agentName}</b>。请保持此页面打开，主持人启动第一版后会自动进入下一阶段。</p>
          <div className="surface-info">
            <div><small>当前活动</small><b>{lobby.activity.name}</b></div>
            <div><small>候场人数</small><b>{lobby.seatCount} / {lobby.activity.participantLimit}</b></div>
            <div><small>名单状态</small><b>{lobby.activity.rosterLockedAt ? "已锁定" : "等待主持人"}</b></div>
          </div>
          <p className="recovery-note">此浏览器会自动恢复你的席位。更换浏览器或设备时，需要重新加入并自行复制已有信息。</p>
        </div>
      </main>
    );
  }

  const canJoin = canJoinParticipantLobby(lobby.activity, lobby.seatCount);
  const hasReplacementSlot = Boolean(lobby.activity.rosterLockedAt && canJoin);

  return (
    <main className="surface participant-surface">
      <form className="surface-card join-card" onSubmit={join}>
        <div className="surface-meta"><span>参赛者入口</span><span>{lobby.seatCount} / {lobby.activity.participantLimit} 人</span></div>
        <p className="eyebrow">JOIN THE LOBBY</p>
        <h1>{lobby.activity.name}</h1>
        {!canJoin ? (
          <p className="form-error">参赛名单已经锁定。若你是原参赛者，请联系主持人移除故障席位后再重新加入。</p>
        ) : (
          <>
            {hasReplacementSlot && <p className="recovery-note">主持人已释放一个故障席位。此空位仅用于原参赛者重新加入，并自行复制已有信息。</p>}
            <div className="field-grid join-fields">
              <label className="full">房间码<input name="roomCode" placeholder="例如 A1B2C3" autoCapitalize="characters" required /></label>
              <label>你的昵称<input name="nickname" maxLength={40} autoComplete="nickname" required /></label>
              <label>Agent 名称<input name="agentName" maxLength={40} placeholder="例如 Claude" required /></label>
            </div>
          </>
        )}
        {error && <p className="form-error" role="alert">{error}</p>}
        {canJoin && <button className="primary-button join-button" disabled={submitting}>{submitting ? "正在加入…" : hasReplacementSlot ? "恢复参赛席位" : "进入候场"}</button>}
        <p className="recovery-note">无需账号。同一浏览器会自动恢复；其他浏览器或设备需要重新输入信息。</p>
      </form>
    </main>
  );
}
