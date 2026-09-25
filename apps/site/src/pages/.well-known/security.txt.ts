import { securityTxt } from "../../lib/security-txt"

export function GET() {
  return new Response(securityTxt(new Date()), {
    headers: { "Content-Type": "text/plain; charset=utf-8" },
  })
}
