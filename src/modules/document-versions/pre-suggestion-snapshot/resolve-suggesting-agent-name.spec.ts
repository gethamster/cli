import { resolveSuggestingAgentName, AgentContext } from './resolve-suggesting-agent-name';

describe('resolveSuggestingAgentName', () => {
  it('returns the specialist skill name when present', () => {
    const context: AgentContext = { skillName: 'Grammar Expert' };
    expect(resolveSuggestingAgentName(context)).toBe('Grammar Expert');
  });

  it('trims whitespace from the skill name', () => {
    const context: AgentContext = { skillName: '  Grammar Expert  ' };
    expect(resolveSuggestingAgentName(context)).toBe('Grammar Expert');
  });

  it('returns the agent name when no skill is active', () => {
    const context: AgentContext = { agentName: 'Document Chat AI' };
    expect(resolveSuggestingAgentName(context)).toBe('Document Chat AI');
  });

  it('prefers skill name over agent name when both are present', () => {
    const context: AgentContext = {
      skillName: 'Grammar Expert',
      agentName: 'Coordinator AI',
    };
    expect(resolveSuggestingAgentName(context)).toBe('Grammar Expert');
  });

  it('falls back to agent name when skill name is empty string', () => {
    const context: AgentContext = { skillName: '', agentName: 'Coordinator AI' };
    expect(resolveSuggestingAgentName(context)).toBe('Coordinator AI');
  });

  it('falls back to agent name when skill name is whitespace-only', () => {
    const context: AgentContext = { skillName: '   ', agentName: 'Coordinator AI' };
    expect(resolveSuggestingAgentName(context)).toBe('Coordinator AI');
  });

  it('falls back to agent name when skill name is null', () => {
    const context: AgentContext = { skillName: null, agentName: 'Coordinator AI' };
    expect(resolveSuggestingAgentName(context)).toBe('Coordinator AI');
  });

  it('returns default fallback when both skill and agent are missing', () => {
    const context: AgentContext = {};
    expect(resolveSuggestingAgentName(context)).toBe('AI Assistant');
  });

  it('returns default fallback when both are empty strings', () => {
    const context: AgentContext = { skillName: '', agentName: '' };
    expect(resolveSuggestingAgentName(context)).toBe('AI Assistant');
  });

  it('returns default fallback when both are null', () => {
    const context: AgentContext = { skillName: null, agentName: null };
    expect(resolveSuggestingAgentName(context)).toBe('AI Assistant');
  });

  it('returns default fallback when context is null', () => {
    expect(resolveSuggestingAgentName(null)).toBe('AI Assistant');
  });

  it('returns default fallback when context is undefined', () => {
    expect(resolveSuggestingAgentName(undefined)).toBe('AI Assistant');
  });
});
