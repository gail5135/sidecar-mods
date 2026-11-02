export type LastPrompt = string

declare module 'claude-code' {
  interface PluginState {
    'git-guard': { lastPrompt: LastPrompt }
  }
}
