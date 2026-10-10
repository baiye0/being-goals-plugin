export type GoalStatus =
  "draft" | "active" | "waiting" | "paused" | "completed" | "archived";
export type GoalCategory =
  | "health"
  | "relationships"
  | "finance"
  | "career"
  | "interests"
  | "productivity"
  | "other";
export interface GoalFields {
  title: string;
  category: GoalCategory;
  outcome: string;
  criteria: string[];
  nextAction: string;
  status: GoalStatus;
}
export interface Goal extends GoalFields {
  id: string;
  revision: number;
  createdAt: string;
  updatedAt: string;
  sceneIds: string[];
}
export interface GoalEvent {
  id: string;
  goalId?: string;
  at: string;
  actor: "user" | "being";
  sceneId?: string;
  kind: "created" | "updated" | "focused" | "configured";
  note: string;
  changes?: Partial<GoalFields>;
}
export interface GoalPreferences {
  guidance: string;
  focusId: string | null;
}
export interface GoalsSnapshot {
  scopeId: string;
  revision: number;
  goals: Goal[];
  events: GoalEvent[];
  preferences: GoalPreferences;
}
export type GoalMutation =
  | { op: "create"; requestId: string; goal: GoalFields }
  | {
      op: "update";
      requestId: string;
      id: string;
      expectedRevision: number;
      patch: Partial<GoalFields>;
      note: string;
    }
  | {
      op: "focus";
      requestId: string;
      expectedRevision: number;
      id: string | null;
    }
  | {
      op: "configure";
      requestId: string;
      expectedRevision: number;
      guidance: string;
    };
export interface GoalMutationResult {
  revision: number;
  goal?: Goal;
  preferences: GoalPreferences;
  replayed?: boolean;
}
export interface GoalsAPI {
  snapshot(): Promise<GoalsSnapshot>;
  mutate(input: GoalMutation): Promise<GoalMutationResult>;
  onChange(
    callback: (
      event: import("@beings/grove-plugin-sdk").PluginChangeEvent,
    ) => void,
  ): Promise<() => void>;
}
