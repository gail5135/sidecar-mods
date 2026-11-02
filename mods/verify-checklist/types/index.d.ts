export type CheckResult = 'passed' | 'failed'

declare module 'claude-code' {
  interface PluginState {
    'verify-checklist': {
      changedFiles: string[]
      results: Record<string, CheckResult>
    }
  }
}
