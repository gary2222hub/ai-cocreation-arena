# 任务跟踪：本地 Markdown

本工程的需求规格与实施任务存放在 `.scratch/`。

## 约定

- 每个功能使用一个目录：`.scratch/<feature-slug>/`
- 需求规格存放于：`.scratch/<feature-slug>/spec.md`
- 每项实施任务单独建文件：
  `.scratch/<feature-slug>/issues/<NN>-<slug>.md`
- 任务编号从 `01` 开始，不创建合并式任务清单
- 每个任务文件顶部使用 `Status:` 记录 triage 状态
- 讨论记录追加在文件末尾的 `## Comments` 下

## 发布任务或规格

当技能要求“发布到任务跟踪系统”时，在对应的
`.scratch/<feature-slug>/` 下创建 Markdown 文件。

## 获取任务

读取用户指定路径或编号对应的任务文件。
