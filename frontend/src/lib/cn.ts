/** Tiny class-name joiner. Filters out false/null/undefined so conditional
 *  classes read as `cond && 'class'` inline. */
export function cn(...parts: Array<string | false | null | undefined>): string {
  return parts.filter(Boolean).join(' ')
}
