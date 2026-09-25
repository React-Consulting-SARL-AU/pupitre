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

export const AFFILIATE_HIT_MARKER = "pupitre_ref_hit"

export const AFFILIATE_HIT_URL_PREFIX = `${PUPITRE_ORIGINS.app}/api/v1/affiliate/`

const READ_CODE = `var r=new URLSearchParams(location.search).get(${JSON.stringify(AFFILIATE_QUERY)});`

// First link wins, as in the console.
const WRITE_COOKIE = `if((";"+document.cookie.replace(/\\s/g,"")).indexOf(${JSON.stringify(`;${AFFILIATE_COOKIE}=`)})<0){var h=location.hostname,n=${JSON.stringify(AFFILIATE_COOKIE_DOMAIN)},d=h===n||h.endsWith("."+n)?";Domain=."+n:"",s=location.protocol==="https:"?";Secure":"";document.cookie=${JSON.stringify(`${AFFILIATE_COOKIE}=`)}+r+";Path=/;Max-Age=${AFFILIATE_COOKIE_MAX_AGE};SameSite=Lax"+s+d}`

// A blocked sessionStorage throws even on read; a counted visit is not worth breaking the page.
const SEND_BEACON = `var k=${JSON.stringify(`${AFFILIATE_HIT_MARKER}:`)}+r;try{if(!sessionStorage.getItem(k)){sessionStorage.setItem(k,"1");navigator.sendBeacon(${JSON.stringify(AFFILIATE_HIT_URL_PREFIX)}+encodeURIComponent(r)+"/hit")}}catch(e){}`

// The beacon keeps an empty body so it stays a simple CORS request.
export const AFFILIATE_BOOT_SCRIPT = `${READ_CODE}if(r&&${AFFILIATE_CODE_RE.toString()}.test(r)){${WRITE_COOKIE}${SEND_BEACON}}`
