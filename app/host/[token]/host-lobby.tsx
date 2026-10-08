"use client";

import { useCallback, useEffect, useState } from "react";
import { buildOpeningScript } from "../../../src/live-guidance";
import { HostLive } from "./host-live";

interface HostLobbyData {
  activity: {
    name: string;
    roomCode: string;
    participantLimit: number;
    status: "lobby" | "v1";
    rosterLockedAt: string | null;
    lockedSeatLimit: number | null;
    reviewStartedAt: string | null;
  };
  seats: Array<{
    id: string;
    nickname: string;
    agentName: string;
    connectionStatus: "connected" | "disconnected";
  }>;
}

export function HostLobby({ token }: { token: string }) {
  const [data, setData] = useState<HostLobbyData | null>(null);
  const [error, setError] = useState("");
  const [working, setWorking] = useState(false);
  const [openingStatus, setOpeningStatus] = useState("");
  const [continueToLive, setContinueToLive] = useState(false);

  const refresh = useCallback(async () => {
    const response = await fetch(`/api/host-lobbies/${token}`, { cache: "no-store" });
    const payload = (await response.json()) as HostLobbyData & { error?: string };
    if (!response.ok) throw new Error(payload.error ?? "主持入口不可用。");
    setData(payload);
  }, [token]);

  useEffect(() => {
    const initial = window.setTimeout(
      () => void refresh().catch((caught) => setError(caught instanceof Error ? caught.message : "主持入口不可用。")),
      0,
    );
    const timer = window.setInterval(() => void refresh(), 3_000);
    return () => {
      window.clearTimeout(initial);
      window.clearInterval(timer);
    };
  }, [refresh]);

  async function lock() {
    setWorking(true);
    setError("");
    try {
      const response = await fetch(`/api/host-lobbies/${token}`, { method: "POST" });
      const payload = (await response.json()) as { error?: string };
      if (!response.ok) throw new Error(payload.error ?? "名单锁定失败。");
      await refresh();
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : "名单锁定失败。");
    } finally {
      setWorking(false);
    }
  }

  async function remove(seatId: string) {
    setError("");
    try {
      const response = await fetch(`/api/host-lobbies/${token}`, {
        method: "DELETE",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ seatId }),
      });
      const payload = (await response.json()) as { error?: string };
      if (!response.ok) throw new Error(payload.error ?? "席位移除失败。");
      await refresh();
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : "席位移除失败。");
    }
  }

  async function copyOpening() {
    if (!data) return;
    await navigator.clipboard.writeText(buildOpeningScript(data.activity.name));
    setOpeningStatus("开场词已复制");
  }

  function playOpening() {
    if (!data || !("speechSynthesis" in window)) {
      setOpeningStatus("当前浏览器不支持语音朗读，请复制开场词由主持人介绍。");
      return;
    }
    window.speechSynthesis.cancel();
    const utterance = new SpeechSynthesisUtterance(buildOpeningScript(data.activity.name));
    utterance.lang = "zh-CN";
    utterance.rate = 0.95;
    const voice = window.speechSynthesis.getVoices().find((candidate) => candidate.lang.startsWith("zh"));
    if (voice) utterance.voice = voice;
    utterance.onstart = () => setOpeningStatus("正在使用浏览器内置语音开场");
    utterance.onend = () => setOpeningStatus("开场介绍已完成");
    utterance.onerror = () => setOpeningStatus("语音朗读未完成，请使用复制开场词作为备用。");
    window.speechSynthesis.speak(utterance);
  }

  if (!data) {
    return <main className="surface"><div className="surface-card"><p>{error || "正在加载主持控制台…"}</p></div></main>;
  }

  const locked = Boolean(data.activity.rosterLockedAt);
  if (locked && continueToLive) {
    return <HostLive token={token} />;
  }
  const rescueOpen = !data.activity.reviewStartedAt;
  return (
    <main className="host-surface">
      <header className="host-header">
        <div><p className="eyebrow">HOST CONSOLE</p><h1>{data.activity.name}</h1></div>
        <div className="room-code"><small>房间码</small><b>{data.activity.roomCode}</b></div>
      </header>
      <section className="host-grid">
        <div className="host-panel roster-panel">
          <div className="panel-heading"><div><h2>参赛名单</h2><p>{data.seats.length} / {data.activity.participantLimit} 个席位</p></div><span className={`status-pill ${locked ? "locked" : ""}`}>{locked ? `已锁定 ${data.activity.lockedSeatLimit} 人` : "候场开放"}</span></div>
          <div className="seat-list">
            {data.seats.length === 0 && <p className="empty-state">等待参赛者通过活动入口加入。</p>}
            {data.seats.map((seat, index) => (
              <div className="seat-row" key={seat.id}>
                <span className="seat-number">{String(index + 1).padStart(2, "0")}</span>
                <div><b>{seat.nickname}</b><small>{seat.agentName}</small></div>
                <span className={`connection ${seat.connectionStatus}`}>● {seat.connectionStatus === "connected" ? "在线" : "离线"}</span>
                <button type="button" disabled={!rescueOpen} onClick={() => void remove(seat.id)}>{rescueOpen ? "移除席位" : "阅卷已开始"}</button>
              </div>
            ))}
          </div>
        </div>
        <aside className="host-panel action-panel">
          <p className="eyebrow">NEXT ACTION</p>
          <h2>{locked ? "名单已锁定" : "确认名单后启动"}</h2>
          <p>{locked ? rescueOpen ? "第一版已经启动。匿名阅卷开始前，你仍可移除故障席位，让原参赛者重新加入空位。" : "匿名阅卷已经开始，席位不能再移除或替换。" : "启动第一版会锁定当前人数上限。之后只能通过移除故障席位来腾出恢复位置。"}</p>
          <div className="opening-tools">
            <b>开场介绍</b>
            <p>使用浏览器内置中文语音；若听感不合适，复制后由主持人朗读。</p>
            <div><button type="button" onClick={playOpening}>播放语音开场</button><button type="button" onClick={() => void copyOpening()}>复制开场词</button></div>
            {openingStatus && <small>{openingStatus}</small>}
          </div>
          {error && <p className="form-error" role="alert">{error}</p>}
          <button className="primary-button" disabled={working || locked || data.seats.length < 3} onClick={() => void lock()}>{locked ? "第一版已启动" : working ? "正在启动…" : "启动第一版并锁定名单"}</button>
          {locked && <button className="secondary-button" type="button" onClick={() => setContinueToLive(true)}>进入现场控制台</button>}
          {!locked && data.seats.length < 3 && <small>至少 3 名参赛者才能启动。</small>}
        </aside>
      </section>
    </main>
  );
}
