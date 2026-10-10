import { useEffect, useRef, useState } from "react";
import { createRoot } from "react-dom/client";
import type { GroveSDK } from "@beings/grove-plugin-sdk";
import type {
  Goal,
  GoalCategory,
  GoalFields,
  GoalMutation,
  GoalsSnapshot,
} from "./goals";
import { createGoalsAPI } from "./adapter";
declare global {
  interface Window {
    grove: GroveSDK;
  }
}
const categories: Record<GoalCategory, string> = {
  health: "健康",
  relationships: "人际关系",
  finance: "财务",
  career: "职业",
  interests: "兴趣",
  productivity: "效率提升",
  other: "其他",
};
const icons = ["♡", "◎", "◇", "▣", "✳", "↗", "＋"];
const statuses: Record<Goal["status"], string> = {
  draft: "待完善",
  active: "追踪中",
  waiting: "待你补充",
  paused: "已暂停",
  completed: "已完成",
  archived: "已归档",
};
const blank = (category: GoalCategory = "other"): GoalFields => ({
  title: "",
  category,
  outcome: "",
  criteria: [],
  nextAction: "",
  status: "active",
});
const id = () => crypto.randomUUID();
const errorText = (error: unknown) =>
  error instanceof Error ? error.message : String(error);
const sdk = window.grove;
const goals = sdk?.agent ? createGoalsAPI(sdk) : undefined;
function App() {
  const [snapshot, setSnapshot] = useState<GoalsSnapshot>();
  const [selected, setSelected] = useState<string>();
  const [filter, setFilter] = useState("tracking");
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");
  const [busy, setBusy] = useState(false);
  const lock = useRef(false),
    generation = useRef(0);
  const [retry, setRetry] = useState<GoalMutation>();
  const [editor, setEditor] = useState<{ goal: GoalFields; original?: Goal }>();
  const [preferences, setPreferences] = useState(sdk?.view === "preferences");
  const [connected, setConnected] = useState(true);
  const refresh = async () => {
    const revision = ++generation.current;
    const next = await goals!.snapshot();
    if (generation.current === revision) setSnapshot(next);
  };
  useEffect(() => {
    let disposed = false,
      stop: (() => void) | undefined;
    if (!goals) {
      setError("此插件需要 Grove SDK 1.4，请更新客户端后重新打开。");
      return;
    }
    void (async () => {
      // Subscribe before reading so updates cannot fall into the initial-load gap.
      const unsubscribe = await goals!.onChange(() => {
        if (!disposed) void refresh().catch((e) => setError(errorText(e)));
      });
      if (disposed) {
        unsubscribe();
        return;
      }
      stop = unsubscribe;
      await refresh();
      const context = await sdk.being.context();
      if (!disposed) setConnected(context.connected);
    })().catch((e) => {
      if (!disposed) setError(errorText(e));
    });
    if (sdk.command === "new-goal") setEditor({ goal: blank() });
    return () => {
      disposed = true;
      generation.current++;
      stop?.();
    };
  }, []);
  useEffect(() => {
    if (!editor && (!selected || preferences)) return;
    const previous = document.activeElement as HTMLElement | null;
    const dialog =
      document.querySelector<HTMLElement>('.backdrop.editor [role="dialog"]') ||
      document.querySelector<HTMLElement>('.backdrop [role="dialog"]');
    const focusable = () => [
      ...(dialog?.querySelectorAll<HTMLElement>(
        "button:not(:disabled),input,textarea,select",
      ) || []),
    ];
    focusable()[0]?.focus();
    const keyboard = (event: KeyboardEvent) => {
      if (event.key === "Escape" && !busy) {
        event.preventDefault();
        if (editor) setEditor(undefined);
        else setSelected(undefined);
      }
      if (event.key === "Tab") {
        const elements = focusable(),
          first = elements[0],
          last = elements.at(-1);
        if (event.shiftKey && document.activeElement === first) {
          event.preventDefault();
          last?.focus();
        } else if (!event.shiftKey && document.activeElement === last) {
          event.preventDefault();
          first?.focus();
        }
      }
    };
    document.addEventListener("keydown", keyboard);
    return () => {
      document.removeEventListener("keydown", keyboard);
      if (previous?.isConnected) previous.focus();
    };
  }, [Boolean(editor), selected, preferences, busy]);
  const mutate = async (input: GoalMutation) => {
    if (lock.current) return;
    lock.current = true;
    setBusy(true);
    setError("");
    setNotice("");
    setRetry(undefined);
    try {
      const result = await goals!.mutate(input);
      await refresh();
      if (result.goal) {
        setSelected(result.goal.id);
        setEditor(undefined);
      }
      setNotice(
        result.replayed ? "已确认先前的操作，无重复写入。" : "已保存。",
      );
      return result;
    } catch (e) {
      setError(errorText(e));
      setRetry(input);
      await refresh().catch(() => {});
    } finally {
      lock.current = false;
      setBusy(false);
    }
  };
  const discuss = async (goal?: Goal, category?: GoalCategory) => {
    setError("");
    setNotice("");
    try {
      const message = goal
        ? `一起继续目标「${goal.title}」（目标 ID：${goal.id}）。先通过 portal_exec 调用 @plugins {"plugin":"beings.goals","op":"describe"} 读取插件行为契约，再调用 @plugins {"plugin":"beings.goals","op":"get","id":"${goal.id}"} 读取最新目标，结合我的反馈调整下一步；确定进展后用结构化操作更新目标及时间线。`
        : `我想制定一个${categories[category || "other"]}目标。请先和我澄清期望结果、验收标准与第一步；确定后请通过 portal_exec 客户端命令 @plugins 创建目标，让它出现在目标插件中。先调用 @plugins {"plugin":"beings.goals","op":"describe"} 查看插件契约，只在这次目标协作中采用插件行为，不要只用文字声称已创建。`;
      const result = await sdk.being.compose(message);
      setNotice(
        result.inserted
          ? "已放入 Being 对话，发送后一起继续。"
          : "对话中已有草稿，请先处理，再点击继续。",
      );
    } catch (e) {
      setError(errorText(e));
    }
  };
  const goal = snapshot?.goals.find((g) => g.id === selected);
  const focusId = snapshot?.goals.some(
    (g) =>
      g.id === snapshot.preferences.focusId &&
      ["active", "waiting", "draft"].includes(g.status),
  )
    ? snapshot.preferences.focusId
    : null;
  const visible =
    snapshot?.goals.filter(
      (g) =>
        filter === "all" ||
        (filter === "done"
          ? ["completed", "archived"].includes(g.status)
          : !["completed", "archived"].includes(g.status)),
    ) || [];
  return (
    <main>
      <header className="page-header">
        <div>
          <span className="eyebrow">WITH YOUR BEING</span>
          <h1>{preferences ? "协作偏好" : "目标"}</h1>
        </div>
        <div className="header-actions">
          <button
            aria-label="刷新目标"
            disabled={busy}
            onClick={() => void refresh().catch((e) => setError(errorText(e)))}
          >
            ↻
          </button>
          <button
            onClick={() => {
              setPreferences(!preferences);
              setError("");
            }}
          >
            {preferences ? "返回目标" : "协作偏好"}
          </button>
        </div>
      </header>
      {error && (
        <div className="alert" role="alert">
          {error}
          {retry && (
            <button disabled={busy} onClick={() => void mutate(retry)}>
              重试同一操作
            </button>
          )}
          <button
            onClick={() => void refresh().catch((e) => setError(errorText(e)))}
          >
            刷新数据
          </button>
        </div>
      )}
      {notice && (
        <p className="notice" role="status">
          {notice}
        </p>
      )}
      {!snapshot ? (
        <p className="muted">{error ? "数据暂不可用。" : "正在读取目标…"}</p>
      ) : preferences ? (
        <Preferences snapshot={snapshot} busy={busy} save={mutate} />
      ) : (
        <>
          <div className="intro">
            <p>把想做的事，变成可以一起推进的目标。</p>
            <button
              className="primary"
              disabled={busy}
              onClick={() => setEditor({ goal: blank() })}
            >
              ＋ 新建目标
            </button>
          </div>
          <nav className="tabs" aria-label="目标筛选">
            {[
              ["tracking", "追踪"],
              ["done", "已完成"],
              ["all", "全部"],
            ].map(([key, label]) => (
              <button
                key={key}
                aria-pressed={filter === key}
                onClick={() => setFilter(key)}
              >
                {label}
              </button>
            ))}
          </nav>
          <section className="goal-list" aria-label="目标列表">
            {visible.length ? (
              visible.map((item) => (
                <button
                  className={`goal-row ${focusId === item.id ? "focused" : ""}`}
                  key={item.id}
                  onClick={() => setSelected(item.id)}
                >
                  <span className={`status-dot ${item.status}`} />
                  <span className="goal-summary">
                    <strong>{item.title}</strong>
                    <span>
                      {item.nextAction ||
                        item.outcome ||
                        "与 Being 一起确定下一步"}
                    </span>
                  </span>
                  <span className="status-label">
                    {focusId === item.id ? "当前关注" : statuses[item.status]}
                  </span>
                  <span aria-hidden="true">›</span>
                </button>
              ))
            ) : (
              <div className="empty">
                <span>◌</span>
                <h2>
                  {filter === "done"
                    ? "完成的目标会留在这里"
                    : "从一件你在意的事开始"}
                </h2>
                <p>与 Being 聊一聊，或者先记下一个目标。</p>
              </div>
            )}
          </section>
          <section className="categories">
            <h2>一起制定目标</h2>
            <p className="muted">先在对话中想清楚，再一起追踪进展。</p>
            {Object.entries(categories).map(([key, label], i) => (
              <button
                key={key}
                disabled={!connected || busy}
                onClick={() => void discuss(undefined, key as GoalCategory)}
              >
                <span className="category-icon">{icons[i]}</span>
                <span>{label}</span>
                <span className="arrow">↗</span>
              </button>
            ))}
          </section>
          <footer>
            Being 可以通过对话创建和更新目标。桌面客户端运行时保持同步。
          </footer>
        </>
      )}
      {goal && !preferences && (
        <div
          className="backdrop"
          onClick={(event) => {
            if (event.target === event.currentTarget && !busy)
              setSelected(undefined);
          }}
        >
          <section
            className="sheet"
            role="dialog"
            aria-modal="true"
            aria-label="目标详情"
          >
            <div className="sheet-heading">
              <span className="tag">
                {categories[goal.category]} · {statuses[goal.status]}
              </span>
              <button
                aria-label="关闭目标详情"
                onClick={() => setSelected(undefined)}
              >
                ×
              </button>
            </div>
            <h2>{goal.title}</h2>
            <p className="outcome">{goal.outcome || "还没有补充期望结果。"}</p>
            {goal.criteria.length > 0 && (
              <section>
                <h3>怎样算完成</h3>
                <ul>
                  {goal.criteria.map((c, i) => (
                    <li key={i}>{c}</li>
                  ))}
                </ul>
              </section>
            )}
            {goal.nextAction && (
              <section className="next">
                <h3>下一步</h3>
                <p>{goal.nextAction}</p>
              </section>
            )}
            <div className="actions">
              <button
                className="primary"
                disabled={busy}
                onClick={() => void discuss(goal)}
              >
                与 Being 继续 ↗
              </button>
              <button
                disabled={busy}
                onClick={() =>
                  setEditor({
                    goal: {
                      title: goal.title,
                      category: goal.category,
                      outcome: goal.outcome,
                      criteria: goal.criteria,
                      nextAction: goal.nextAction,
                      status: goal.status,
                    },
                    original: goal,
                  })
                }
              >
                编辑 / 记录进展
              </button>
              {!["paused", "completed", "archived"].includes(goal.status) && (
                <button
                  disabled={busy}
                  onClick={() =>
                    void mutate({
                      op: "focus",
                      requestId: id(),
                      expectedRevision: snapshot!.revision,
                      id:
                        snapshot!.preferences.focusId === goal.id
                          ? null
                          : goal.id,
                    })
                  }
                >
                  {snapshot!.preferences.focusId === goal.id
                    ? "取消关注"
                    : "设为当前关注"}
                </button>
              )}
            </div>
            <section className="timeline">
              <h3>动态</h3>
              {snapshot!.events
                .filter((e) => e.goalId === goal.id)
                .slice()
                .reverse()
                .map((event) => (
                  <article key={event.id}>
                    <span className="timeline-dot" />
                    <div>
                      <small>
                        {new Date(event.at).toLocaleString("zh-CN")} ·{" "}
                        {event.actor === "being" ? "Being" : "你"}
                      </small>
                      <p>{event.note}</p>
                      {event.changes?.status && (
                        <span className="tag">
                          {statuses[event.changes.status]}
                        </span>
                      )}
                    </div>
                  </article>
                ))}
            </section>
          </section>
        </div>
      )}
      {editor && (
        <GoalEditor
          key={editor.original?.id || "new"}
          value={editor.goal}
          original={editor.original}
          busy={busy}
          error={error}
          close={() => setEditor(undefined)}
          save={async (value, note) => {
            const result = await mutate(
              editor.original
                ? {
                    op: "update",
                    requestId: id(),
                    id: editor.original.id,
                    expectedRevision: editor.original.revision,
                    patch: value,
                    note,
                  }
                : { op: "create", requestId: id(), goal: value },
            );
            if (result) setEditor(undefined);
          }}
        />
      )}
    </main>
  );
}
function GoalEditor({
  value,
  original,
  busy,
  error,
  close,
  save,
}: {
  value: GoalFields;
  original?: Goal;
  busy: boolean;
  error: string;
  close: () => void;
  save: (value: GoalFields, note: string) => Promise<void>;
}) {
  const [draft, setDraft] = useState(value),
    [criteria, setCriteria] = useState(value.criteria.join("\n")),
    [note, setNote] = useState("");
  const change = (key: keyof GoalFields, value: string) =>
    setDraft((current) => ({ ...current, [key]: value }));
  return (
    <div className="backdrop editor">
      <form
        className="sheet"
        role="dialog"
        aria-modal="true"
        aria-label={original ? "编辑目标" : "新建目标"}
        onSubmit={(event) => event.preventDefault()}
      >
        <div className="sheet-heading">
          <h2>{original ? "记录新的进展" : "你想实现什么？"}</h2>
          <button
            type="button"
            aria-label="关闭编辑"
            disabled={busy}
            onClick={close}
          >
            ×
          </button>
        </div>
        <label>
          目标名称
          <input
            autoFocus
            required
            maxLength={160}
            value={draft.title}
            onChange={(e) => change("title", e.target.value)}
            placeholder="例如：建立每周阅读习惯"
          />
        </label>
        <div className="form-row">
          <label>
            类别
            <select
              value={draft.category}
              onChange={(e) => change("category", e.target.value)}
            >
              {Object.entries(categories).map(([key, label]) => (
                <option key={key} value={key}>
                  {label}
                </option>
              ))}
            </select>
          </label>
          <label>
            状态
            <select
              value={draft.status}
              onChange={(e) => change("status", e.target.value)}
            >
              {Object.entries(statuses)
                .filter(([key]) => original || key !== "completed")
                .map(([key, label]) => (
                  <option key={key} value={key}>
                    {label}
                  </option>
                ))}
            </select>
          </label>
        </div>
        <label>
          期望结果
          <textarea
            maxLength={3000}
            value={draft.outcome}
            onChange={(e) => change("outcome", e.target.value)}
            placeholder="做到之后，会有什么不同？"
          />
        </label>
        <label>
          验收标准
          <textarea
            value={criteria}
            maxLength={3600}
            onChange={(e) => setCriteria(e.target.value)}
            placeholder="每行一条，最多 12 条"
          />
        </label>
        <label>
          下一步
          <input
            maxLength={1000}
            value={draft.nextAction}
            onChange={(e) => change("nextAction", e.target.value)}
            placeholder="从一个具体的小步骤开始"
          />
        </label>
        {original && (
          <label>
            {draft.status === "completed" ? "完成依据" : "本次进展"}
            <textarea
              required
              maxLength={1000}
              value={note}
              onChange={(e) => setNote(e.target.value)}
              placeholder="发生了什么？为什么调整目标？"
            />
          </label>
        )}
        {error && (
          <p className="alert" role="alert">
            {error}
          </p>
        )}
        <div className="actions">
          <button
            className="primary"
            disabled={busy}
            type="button"
            onClick={(event) => {
              if (event.currentTarget.form?.reportValidity())
                void save(
                  {
                    ...draft,
                    criteria: criteria
                      .split("\n")
                      .map((x) => x.trim())
                      .filter(Boolean),
                  },
                  note,
                );
            }}
          >
            {busy ? "正在保存…" : original ? "保存进展" : "创建目标"}
          </button>
          <button type="button" disabled={busy} onClick={close}>
            取消
          </button>
        </div>
      </form>
    </div>
  );
}
function Preferences({
  snapshot,
  busy,
  save,
}: {
  snapshot: GoalsSnapshot;
  busy: boolean;
  save: (input: GoalMutation) => Promise<unknown>;
}) {
  const [guidance, setGuidance] = useState(snapshot.preferences.guidance);
  const [baseRevision, setBaseRevision] = useState(snapshot.revision);
  const [localError, setLocalError] = useState("");
  const savedGuidance = useRef(snapshot.preferences.guidance);
  useEffect(() => {
    if (guidance === savedGuidance.current) {
      setGuidance(snapshot.preferences.guidance);
      setBaseRevision(snapshot.revision);
    }
    savedGuidance.current = snapshot.preferences.guidance;
  }, [snapshot.revision]);
  return (
    <form className="preferences" onSubmit={(e) => e.preventDefault()}>
      <h2>让目标插件知道怎样与你一起推进</h2>
      <label>
        目标协作偏好
        <textarea
          maxLength={2000}
          value={guidance}
          onChange={(e) => setGuidance(e.target.value)}
          placeholder="例如：一次只给我一个可执行的下一步；先问清楚，不替我扩大目标范围。"
        />
      </label>
      <p className="muted">
        这些偏好只属于目标插件。你选择与 Being
        协作并让它读取插件时，插件才提供目标和偏好；不会修改 Being
        的主提示词，也不会自动附加到普通对话。
      </p>
      <button
        className="primary"
        type="button"
        disabled={busy}
        onClick={() => {
          void save({
            op: "configure",
            requestId: id(),
            expectedRevision: baseRevision,
            guidance,
          }).then((result) => {
            if (result)
              setBaseRevision((result as { revision: number }).revision);
          });
        }}
      >
        保存偏好
      </button>
      <button
        className="reload-prefs"
        type="button"
        disabled={busy}
        onClick={() => {
          setBaseRevision(snapshot.revision);
          setGuidance(snapshot.preferences.guidance);
        }}
      >
        重新载入偏好
      </button>
      <div className="info">
        <h3>双向协作如何工作</h3>
        <p>
          插件通过 SDK 保存结构化目标，并向 Being 提供目标协作契约。Being 经
          Portal 插件命令创建、修改目标；变更会立即同步到页面。
        </p>
        <p>
          数据按 Being
          连接分别保存在本机。关闭插件页面不影响工具；退出桌面客户端后，工具暂不可用。此版本不会自动设定提醒或后台执行目标。
        </p>
        <button
          type="button"
          onClick={() => {
            void sdk.being
              .compose(
                '请使用目标插件：先调用 portal_exec 客户端命令 @plugins {"plugin":"beings.goals","op":"describe"}，再列出我的目标，结合插件偏好帮我回顾重点与下一步。仅在此次目标协作中使用插件行为。',
              )
              .then((result) =>
                setLocalError(
                  result.inserted
                    ? "已放入 Being 对话，请发送。"
                    : "已有对话草稿，请先处理。",
                ),
              )
              .catch((e) => setLocalError(errorText(e)));
          }}
        >
          请 Being 帮我回顾
        </button>
        {localError && <p role="status">{localError}</p>}
      </div>
    </form>
  );
}
createRoot(document.getElementById("root")!).render(<App />);
