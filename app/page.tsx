import { CreateActivityForm } from "./create-activity-form";
import Link from "next/link";

export default function Home() {
  return (
    <main>
      <header className="site-header">
        <Link className="brand" href="/" aria-label="AI 共创场首页">
          <span className="brand-mark">共</span>
          <span>AI 共创场</span>
        </Link>
        <span className="header-note">活动创建</span>
      </header>

      <section className="hero">
        <p className="eyebrow">CREATE AN ACTIVITY</p>
        <h1>把每个人的 AI，<br />变成团队的智慧。</h1>
        <p className="hero-copy">
          公开创建独立活动。完成配置后，你会获得组织、主持、参赛、大屏与报告入口。
        </p>
      </section>

      <CreateActivityForm />
    </main>
  );
}
