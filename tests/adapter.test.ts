import { describe, it, expect, vi } from "vitest";
import type { GroveSDK, PluginAgentMutation } from "@beings/grove-plugin-sdk";
import { createGoalsAPI } from "../src/adapter";
const record = {
  id: "goal-1",
  revision: 2,
  createdAt: "now",
  updatedAt: "later",
  data: { title: "Read", status: "active", category: "interests" },
};
describe("Goals plugin uses generic SDK only", () => {
  it("maps generic records and Being activity into goals, including older optional fields", async () => {
    const snapshot = vi.fn(async () => ({
      scopeId: "a",
      revision: 2,
      records: [record],
      events: [
        {
          id: "event",
          recordId: record.id,
          kind: "created",
          actor: "being",
          note: "创建记录",
          at: "now",
        },
      ],
      preferences: { guidance: "", focusId: null },
    }));
    const goals = createGoalsAPI({
      agent: { snapshot },
    } as unknown as GroveSDK);
    const result = await goals.snapshot();
    expect(result.goals[0]).toMatchObject({
      id: "goal-1",
      title: "Read",
      outcome: "",
      criteria: [],
      nextAction: "",
    });
    expect(result.events[0]).toMatchObject({
      goalId: "goal-1",
      actor: "being",
      note: "创建目标",
    });
  });
  it("keeps target-specific guidance in plugin preferences, never touching chat", async () => {
    const mutate = vi.fn(async (_input: PluginAgentMutation) => ({
      revision: 3,
      preferences: { guidance: "One step", focusId: null },
    }));
    const compose = vi.fn();
    const api = createGoalsAPI({
      agent: { mutate },
      being: { compose },
    } as unknown as GroveSDK);
    await api.mutate({
      op: "configure",
      requestId: "a",
      expectedRevision: 2,
      guidance: "One step",
    });
    expect(mutate).toHaveBeenCalledWith({
      op: "configure",
      requestId: "a",
      expectedRevision: 2,
      preferences: { guidance: "One step" },
      note: "更新目标协作偏好",
    });
    expect(compose).not.toHaveBeenCalled();
  });
  it("preserves optimistic versions and stable request ids when writing progress", async () => {
    const mutate = vi.fn(async (_input: PluginAgentMutation) => ({
      revision: 4,
      record,
      preferences: { guidance: "", focusId: null },
      replayed: true,
    }));
    const api = createGoalsAPI({ agent: { mutate } } as unknown as GroveSDK);
    const result = await api.mutate({
      op: "update",
      requestId: "stable",
      id: record.id,
      expectedRevision: 2,
      patch: { status: "completed" },
      note: "Finished all criteria",
    });
    expect(mutate.mock.calls[0][0]).toMatchObject({
      expectedRevision: 2,
      requestId: "stable",
      patch: { status: "completed" },
      note: "Finished all criteria",
    });
    expect(result.replayed).toBe(true);
  });
});
