/**
 * Default fallback name used when no specialist skill is active
 * (e.g., coordinator AI in document chat).
 */
const DEFAULT_AGENT_NAME = 'AI Assistant';

/**
 * Context available at toolcall instantiation that may carry
 * the suggesting agent's identity.
 */
export interface AgentContext {
  /** The active specialist skill name, if any. */
  readonly skillName?: string | null;
  /** The coordinator / AI assistant display name, if any. */
  readonly agentName?: string | null;
}

/**
 * Resolves the display name of the suggesting agent from the context
 * available at apply_diff or replace_document toolcall instantiation.
 *
 * Resolution order:
 * 1. Named specialist skill (suggestion threads with an active skill).
 * 2. Coordinator/AI agent name (document chat or unnamed skill).
 * 3. Fallback to "AI Assistant" if nothing is available.
 *
 * This function is synchronous and never throws -- it always returns
 * a non-empty string suitable for the snapshot label.
 */
export function resolveSuggestingAgentName(context: AgentContext | null | undefined): string {
  if (!context) {
    return DEFAULT_AGENT_NAME;
  }

  if (context.skillName && context.skillName.trim().length > 0) {
    return context.skillName.trim();
  }

  if (context.agentName && context.agentName.trim().length > 0) {
    return context.agentName.trim();
  }

  return DEFAULT_AGENT_NAME;
}
