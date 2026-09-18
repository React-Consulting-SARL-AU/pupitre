import { PUPITRE_ORIGINS } from "@pupitre/shared/legal"
import {
  AFFILIATE_CODE_RE,
  AFFILIATE_COOKIE,
  AFFILIATE_COOKIE_DAYS,
} from "@pupitre/shared/plans"

const SECONDS_PER_DAY = 86_400

export const AFFILIATE_QUERY = "ref"

export const AFFILIATE_COOKIE_DOMAIN = new URL(PUPITRE_ORIGINS.site).hostname

export const AFFILIATE_COOKIE_MAX_AGE = AFFILIATE_COOKIE_DAYS * SECONDS_PER_DAY

/**
 * Inline in the head: a visitor who arrives through `?ref=<code>` carries the
 * code to the console on the parent domain, where the checkout attaches it.
 */
export const AFFILIATE_BOOT_SCRIPT = `var r=new URLSearchParams(location.search).get(${JSON.stringify(AFFILIATE_QUERY)});if(r&&${AFFILIATE_CODE_RE.toString()}.test(r)){var h=location.hostname,n=${JSON.stringify(AFFILIATE_COOKIE_DOMAIN)},d=h===n||h.endsWith("."+n)?";Domain=."+n:"";document.cookie=${JSON.stringify(`${AFFILIATE_COOKIE}=`)}+r+";Path=/;Max-Age=${AFFILIATE_COOKIE_MAX_AGE};SameSite=Lax"+d}`
