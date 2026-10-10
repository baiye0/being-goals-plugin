import type {
  GroveSDK,
  PluginAgentRecord,
  PluginAgentMutation,
} from "@beings/grove-plugin-sdk";
import type { Goal, GoalFields, GoalsAPI } from "./goals";
export function asGoal(record: PluginAgentRecord): Goal {
  return {
    ...(record.data as unknown as GoalFields),
    outcome: String(record.data.outcome || ""),
    nextAction: String(record.data.nextAction || ""),
    criteria: Array.isArray(record.data.criteria) ? record.data.criteria : [],
    id: record.id,
    revision: record.revision,
    createdAt: record.createdAt,
    updatedAt: record.updatedAt,
    sceneIds: [],
  };
}
/** Goal semantics stay in this plugin repository; the host only sees typed records. */
export function createGoalsAPI(sdk: GroveSDK): GoalsAPI {
  return {
    async snapshot() {
      const data = await sdk.agent.snapshot();
      return {
        ...data,
        goals: data.records.map(asGoal),
        events: data.events.map((event) => ({
          ...event,
          goalId: event.recordId,
          note: event.kind === "created" ? "创建目标" : event.note,
          changes: event.changes as Partial<GoalFields>,
        })),
      };
    },
    async mutate(input) {
      let command: PluginAgentMutation;
      if (input.op === "create")
        command = {
          op: "create",
          requestId: input.requestId,
          data: { ...input.goal },
        };
      else if (input.op === "update")
        command = { ...input, patch: { ...input.patch } };
      else if (input.op === "focus")
        command = {
          op: "configure",
          requestId: input.requestId,
          expectedRevision: input.expectedRevision,
          preferences: { focusId: input.id },
          note: input.id ? "设为当前关注目标" : "取消当前关注目标",
        };
      else
        command = {
          op: "configure",
          requestId: input.requestId,
          expectedRevision: input.expectedRevision,
          preferences: { guidance: input.guidance },
          note: "更新目标协作偏好",
        };
      const result = await sdk.agent.mutate(command);
      return {
        revision: result.revision,
        preferences: result.preferences,
        replayed: result.replayed,
        ...(result.record ? { goal: asGoal(result.record) } : {}),
      };
    },
    onChange: (callback) => sdk.agent.onChange(callback),
  };
}
