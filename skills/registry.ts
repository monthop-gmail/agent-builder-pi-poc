import type { ResolvedSkill } from "../builder/types.js";

/**
 * Skill Registry: maps a manifest skill name to reusable behavior
 * (instruction text). Skills carry no executable code — that is the
 * Tool registry's job. The Compiler composes skill instructions into
 * the agent's system prompt.
 */

const SKILLS: Record<string, ResolvedSkill> = {
  research: {
    name: "research",
    description: "Systematic web research behavior.",
    instructions: [
      "## Skill: research",
      "- Break the question into sub-questions before searching.",
      "- Prefer primary sources; note the source URL for every claim.",
      "- State clearly when information could not be verified.",
    ].join("\n"),
  },
  analyst: {
    name: "analyst",
    description: "Quantitative analysis behavior.",
    instructions: [
      "## Skill: analyst",
      "- Show every calculation step; never skip arithmetic.",
      "- Use the calculator tool for any non-trivial computation.",
      "- Separate observations (data) from conclusions (interpretation).",
    ].join("\n"),
  },
  coder: {
    name: "coder",
    description: "Disciplined coding behavior.",
    instructions: [
      "## Skill: coder",
      "- State assumptions before writing code.",
      "- Prefer the smallest change that satisfies the requirement.",
      "- Include how to run/verify the code.",
    ].join("\n"),
  },
};

export function listSkillNames(): string[] {
  return Object.keys(SKILLS).sort();
}

export function hasSkill(name: string): boolean {
  return Object.hasOwn(SKILLS, name);
}

export function getSkill(name: string): ResolvedSkill {
  const skill = SKILLS[name];
  if (!skill) throw new Error(`Skill not found in registry: '${name}'`);
  return skill;
}
