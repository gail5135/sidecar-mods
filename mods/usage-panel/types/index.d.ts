export type UsageWindow = { kind: string; percentUsed: number; resetsAt?: string }

export type CommitGroup = { branch: string; commits: { hash: string; subject: string }[] }

export type AskedQuestion = { id: string; text: string }

export type AgentRow = { id: string; type: string; description: string; status: string }

export type UsageSnapshot = {
  contextTokens?: number
  contextWindow: number
  contextPercent?: number
  rateLimits: UsageWindow[]
  costUsd?: number
  measuredAt: number
}

declare module 'claude-code' {
  interface PluginState {
    'usage-panel': { snapshot: Shaped<UsageSnapshot | null>; questionPage: number | null; effortLevel: string; modelName: string; devServer: string; gitBranch: string; utcOffsetMinutes: number | null; agents: Shaped<AgentRow[]>; commitGroups: Shaped<CommitGroup[]>; questions: Shaped<AskedQuestion[]> }
  }
}
