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
}

export type Difficulty = "beginner" | "intermediate" | "advanced"

// What a player is allowed to see before/without a submission: no answers, no flag.
export type PlayerChallenge = Omit<Challenge, "vulnerableLines" | "explanations" | "flag">

// Minimal shape needed to render the admin lock/unlock panel.
export type ChallengeSummary = Pick<Challenge, "id" | "title" | "description">
