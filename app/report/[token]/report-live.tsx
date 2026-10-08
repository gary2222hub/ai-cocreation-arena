"use client";

import { useCallback, useEffect, useState } from "react";
import type { AnonymousLiveReport } from "../../../src/live-event";

export function ReportLive({ token }: { token: string }) {
  const [data, setData] = useState<AnonymousLiveReport | null>(null);
  const [error, setError] = useState("");

  const refresh = useCallback(async () => {
    const response = await fetch(`/api/report-live/${token}`, { cache: "no-store" });
    const payload = (await response.json()) as AnonymousLiveReport & { error?: string };
    if (!response.ok) throw new Error(payload.error ?? "活动报告暂时不可用。");
    setData(payload);
  }, [token]);

  useEffect(() => {
    const initial = window.setTimeout(
      () => void refresh().catch((caught) => setError(caught instanceof Error ? caught.message : "活动报告暂时不可用。")),
      0,
    );
    const timer = window.setInterval(() => void refresh(), 5_000);
    return () => {
      window.clearTimeout(initial);
      window.clearInterval(timer);
    };
  }, [refresh]);

  function download() {
    if (!data) return;
    const blob = new Blob([JSON.stringify(data, null, 2)], { type: "application/json;charset=utf-8" });
    const url = URL.createObjectURL(blob);
    const link = document.createElement("a");
    link.href = url;
    link.download = `${data.activity.name.replace(/[\\/:*?"<>|]/g, "-")}-完整导出.json`;
    link.click();
    URL.revokeObjectURL(url);
  }

  if (!data) return <main className="surface"><div className="surface-card"><p>{error || "正在整理活动报告…"}</p></div></main>;

  return (
    <main className="surface report-surface">
      <div className="surface-card">
        <div className="surface-meta"><span>活动报告</span><span>{data.activity.stage === "complete" ? "已完成" : "进行中"}</span></div>
        <h1>{data.activity.name}</h1>
        <p className="hero-copy">匿名报告包含匿名编号、两轮题目、作品、互评票数、可选外部评分和总成绩；不包含昵称或 Agent 名称。</p>
        <div className="surface-info">
          <div><small>参赛者</small><b>{data.participants.length} 人</b></div>
          <div><small>轮次</small><b>{data.activity.roundCount} 轮</b></div>
          <div><small>当前状态</small><b>{data.activity.stage === "complete" ? "活动完成" : "活动进行中"}</b></div>
        </div>
        <button className="primary-button report-download" onClick={download}>下载整场 JSON</button>
        <p className="recovery-note">活动进行中也可以导出快照；结束后请再下载一次最终版本。</p>
      </div>
    </main>
  );
}
