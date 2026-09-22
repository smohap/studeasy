export type CoinEntry = {
  id: string
  delta: number
  reason: string
  note: string | null
  created_at: string
}

export type ShopItem = {
  id: string
  code: string
  name: string
  description: string | null
  kind: 'avatar' | 'theme' | 'frame' | 'title'
  asset_key: string
  cost_coins: number
  min_level: number
  owned: boolean
  /** Currently worn. One slot per kind, so at most one frame, one theme, etc. */
  equipped: boolean
}

export type HouseStanding = {
  house_id: string
  name: string
  colour: string
  points: number
  members: number
}

export type ChallengeProgress = {
  challenge_id: string
  title: string
  description: string | null
  metric: string
  target: number
  value: number
  completed_at: string | null
  period_end: string
}

export type Battle = {
  id: string
  status: 'pending' | 'accepted' | 'declined' | 'complete' | 'expired'
  topic_name: string
  is_challenger: boolean
  winner_id: string | null
  question_count: number
  answered: number
  expires_at: string
}
