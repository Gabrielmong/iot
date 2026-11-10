import type { NavLink } from './navItems'

function matches(pathname: string, prefix: string): boolean {
  return pathname === prefix || pathname.startsWith(prefix.endsWith('/') ? prefix : prefix + '/')
}

/** Whether `link` is the current section for `pathname`. */
export function isNavActive(link: Pick<NavLink, 'to' | 'exact' | 'alsoActive'>, pathname: string): boolean {
  const own = link.exact ? pathname === link.to : matches(pathname, link.to)
  return own || (link.alsoActive ?? []).some((p) => matches(pathname, p))
}
