---
name: capture
description: Show an image or a web page from this server — capture a page with shot, drop an image file into the gallery, check the rendering yourself, and end the answer with the capture's URL embedded. Use it as soon as an interface change has to be seen or verified, when a screenshot is asked for, or when an image file has been produced here.
---

# capture

This server has no screen, and the user does not see its filesystem. A local path
in an answer is useless; a gallery URL is not.

`shot` exists when the owner installed the browser tool; `command -v shot` tells.

## The commands

    shot https://a-page                capture the page (headless Chrome, 1440×900)
    shot --mobile https://a-page       at 390×844, with a phone's user agent
    shot --size 1024x768 https://…     at the size you want
    shot --wait 3000 https://…         give the page 3 s more to draw itself
    shot image.png                     drop an existing image file into the gallery
    shot image.png nice-name.png       under a chosen name
    shot --project web https://…       file it under the project web
    shot --list                        every capture, newest first

`shot` prints **the capture's URL on its last line** on standard output, and the
local path on the error output. A capture is filed under its project: the one
`--project` names, else the one whose folder you are in, else the one serving the
captured URL, else `_unfiled`. Files live in `~/shots/<project>/YYYY-MM-DD/`, and
the URL mirrors them: `<gallery>/<project>/YYYY-MM-DD/<name>`.

When the owner gave the gallery a subdomain, the URL is public
(`https://<subdomain>.<domain>/<token>/…`): anyone holding it — you, the owner,
Claude on the web — opens the image. Otherwise `shot` says so on the error output
and the URL opens on this server only; the owner still sees the capture, under
its project, in the Pupitre app's gallery.

## The procedure

1. **The project has to be running.** `dev status` says so; otherwise
   `dev up <project>`, then `dev logs <project>` if it stays `starting`.
   Capture `http://127.0.0.1:<port>` (or the project's `.localhost` host): `shot`
   runs right here.

2. **Capture.** `shot <url>` for a page; `shot <file>` for an image produced
   otherwise (a chart, an export, a Playwright screenshot). Run it from the
   project's folder, or pass `--project`, so the capture lands under the right
   project. Name the capture when there are several:
   `shot --mobile https://… home-mobile.png`.

3. **Look before answering.** Open the local file with your image-reading tool
   (Claude Code: `Read` on the `~/shots/…` path) and check that it really shows
   what you claim — a blank page, an error or a spinner is visible in one second
   and saves a false answer. If the page had not finished drawing, `--wait`.

4. **End the answer with the image, embedded**, on its own line, very last:

       ![home, mobile](https://…/web/2026-09-03/home-mobile.png)

   Interfaces that render markdown show the image; the others show the link.
   Never a local path instead.

## What never goes into a capture

A published gallery has no login: its token is the only lock, and every URL you
hand out carries it. Never capture a screen that shows a secret, a token, a
customer's data or an admin page. Captures stay until the owner clears
the gallery from the Pupitre app; do not delete them yourself.
