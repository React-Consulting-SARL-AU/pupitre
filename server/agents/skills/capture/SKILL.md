---
name: capture
description: Show an image or a web page from this server — capture a page with shot, drop an image file, check the rendering yourself, and end the answer with the public URL embedded. Use it as soon as an interface change has to be seen or verified, when a screenshot is asked for, or when an image file has been produced here.
---

# capture

This server has no screen, and the user does not see its filesystem. A local path
in an answer is therefore useless; a gallery URL is not.

## The commands

    shot https://a-page                capture the page (headless Chrome, 1440×900)
    shot --mobile https://a-page       at 390×844
    shot --size 1024x768 https://…     at the size you want
    shot --wait 3000 https://…         give the page 3 s more to draw itself
    shot image.png                     drop an existing image file
    shot image.png nice-name.png       under a chosen name
    shot --list                        the last 20 screenshots
    dev shots list                     the same, with the URLs

`shot` prints **the public URL on its last line** on standard output, and the
local path on the error output. The files live in `~/shots/YYYY-MM-DD/`, and the
URL mirrors them exactly: `<gallery>/YYYY-MM-DD/<name>` ↔
`~/shots/YYYY-MM-DD/<name>`. `dev shots url` gives the gallery's base — which is
a public HTTPS address when the machine has a tunnel, and its local port
otherwise.

## The procedure

1. **The project has to be running.** `dev status` says so; otherwise
   `dev up <project>`, then `dev logs <project>` if the state stays `starting`.
   The address to capture is the one from `dev url <project>` — or, since `shot`
   runs right here, `http://127.0.0.1:<port>` works too, tunnel or no tunnel.

2. **Capture.** `shot <url>` for a page; `shot <file>` for an image produced
   otherwise (a chart, an export, a Playwright screenshot). Name the capture when
   there are several: `shot --mobile https://… home-mobile.png`.

3. **Look before answering.** Open the local file with the image-reading tool
   (Claude Code: `Read` on the `~/shots/…` path) and check that the capture really
   shows what you claim — a blank page, a 500 error or a loading state is visible
   in one second and saves you a false answer. If the page has not finished
   drawing, `--wait`.

4. **End the answer with the image, embedded.** In markdown, on its own line,
   very last:

       ![home, mobile](https://shots.example.dev/2026-09-03/home-mobile.png)

   Interfaces that render markdown display the image in the conversation; the
   others show a clickable link. Never a local path instead.

## From your own machine

When the agent runs on your machine rather than here, `vps-shot -o` brings back
the server's latest capture and prints its local path — that is the file a local
agent can read and show.

## Housekeeping

`dev shots clean 14` deletes anything older than fourteen days. The gallery is
restricted to the address in `CLOUDFLARE_ACCESS_EMAIL` when that variable is set;
otherwise it is public, and a screenshot of a sensitive screen has no business
there.
