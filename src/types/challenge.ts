export interface Challenge {
  id: string
  title: string
  description: string
  code: string
  vulnerableLines: number[]
  difficulty: "beginner" | "intermediate" | "advanced"
  hints?: string[]
  explanations: { [lineNumber: number]: string }
  flag?: string
  labUrl?: string
  maxSelectableLines?: number // maximum number of lines user can select for this challenge
  fixedCode?: string // the patched/secure version, revealed once lab time is up
  order: number // defines the lab sequence; lower shows first
}

export type Difficulty = "beginner" | "intermediate" | "advanced"

// What a player is allowed to see before/without a submission: no answers, no flag,
// no fixed-code reveal (that's fetched separately, only once lab time is up).
export type PlayerChallenge = Omit<Challenge, "vulnerableLines" | "explanations" | "flag" | "fixedCode">

// Minimal shape needed to render the admin lock/unlock panel.
export type ChallengeSummary = Pick<Challenge, "id" | "title" | "description" | "order">
