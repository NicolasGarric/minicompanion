/**
 * Rights requests (notice and takedown) go to the suggestions inbox of /admin as topic "other",
 * the message starting with RIGHTS_TAG: no migration needed. Pure, unit-tested with plain Node.
 */
export const RIGHTS_TAG = '[RIGHTS]';
export const RIGHTS_WHO = ['holder', 'agent', 'user'] as const;
export type RightsWho = (typeof RIGHTS_WHO)[number];

/** The message stored in the inbox (≤ 2,000 characters, the limit of submit_suggestion). */
export function rightsMessage(who: RightsWho, where: string, details: string): string {
  return `${RIGHTS_TAG} ${who}\n${where.trim().slice(0, 300)}\n\n${details.trim()}`.slice(0, 2000);
}
