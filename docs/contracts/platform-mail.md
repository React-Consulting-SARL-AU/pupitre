# Platform inbox

Everything written to an `*@pupitre.studio` address lands in the platform database, and the team answers from the console. There is no inbox anywhere else: no Gmail, no Zendesk, no forwarding to a personal address.

Complements [`platform-api.md`](./platform-api.md), whose conventions it follows: the routes live under `/api/v1/admin/inbox`, they are hidden from the OpenAPI document like the whole `/admin/**` group, and their errors have the shape `{ error: { code, message, fix? } }`.

## What comes in

Cloudflare Email Routing carries a **catch-all** rule on the `pupitre.studio` zone: *Send to a Worker*, the console Worker (`ppt-web-production`). No address is declared one by one — `support@`, `legal@`, `privacy@`, `security@` receive, and so does any other.

The Worker exposes an `email(message, env, ctx)` handler (`apps/web/src/worker.ts`), which delegates to `handleInboundEmailMessage`. It reads `message.raw` in full, opens a Prisma client on the request's D1, and calls `ingestInboundEmail`. **It catches nothing**: an exception goes back up to Cloudflare, which treats the delivery as a temporary failure and presents it again. A lost message costs more than a message delivered twice — and a message delivered twice is recognised (see *Duplicates*).

The same path opens locally through `POST /internal/email`, behind the `INTERNAL_WORKFLOW_SECRET` secret of the internal triggers; the body is the raw MIME, and the envelope is carried by two headers. The command is in [`monorepo.md`](../monorepo.md).

## What does not get in

**A message above `MAIL_MAX_BYTES`** (20 MiB, `@pupitre/shared/legal`) **is refused at the door.** `message.rawSize` is read before the bytes: above the ceiling, `message.setReject("Message too large")` and nothing else. Without this refusal, loading the message into memory kills the isolate, Cloudflare treats the death as a temporary failure, and presents indefinitely a message that will never go through. A refusal is final and the sender is told; a retry loop is not. The same ceiling applies to `POST /internal/email`, which answers `413`.

**The text is cut at `MAIL_MAX_TEXT_CHARS`** (200,000 characters) before it enters the database: D1 refuses a value above one megabyte, and that refusal would come after the objects are written, hence in the same retry loop. The raw `.eml` in the bucket keeps the whole body — **it is the source of truth**, the column is only what is read on screen. The `snippet` is computed from the full text.

**Only the first `MAIL_MAX_INBOUND_ATTACHMENTS` attachments** (twenty) go to the bucket with their row; the following ones live only in the raw `.eml`. Each attachment is a Worker write: a message with thousands of parts would exceed its subrequests, and Cloudflare would present it indefinitely. Likewise, **`In-Reply-To` and `References` count only their `MAIL_MAX_REFERENCES` most recent identifiers** (twenty), both for threading and for the `references` column: a chain inflated to thousands of identifiers is neither searched nor copied into a reply.

## Reading the message

`postal-mime` reads the message: subject, sender, recipients, copies, text body, HTML body, `Message-ID`, `In-Reply-To`, `References`, attachments with their bytes. Identifiers are stored **without angle brackets**.

**An unreadable message is stored anyway.** The parse returns `null`, the SMTP envelope supplies the sender and the recipient, and the bytes go to the bucket: nothing is lost in a retry loop over a message that no parser will ever accept.

**A message without a subject is stored under an empty subject** (`MailThread.subject = ""`, `MailMessage.subject = null`): it is the console that says « (sans objet) » or « (no subject) », in its language. An attachment without a name is called `attachment`.

### The verified sender

`From` is only a claim. The Email Routing MX authenticates the message before handing it to the Worker and **prefixes** its results — `ARC-Authentication-Results` and `Authentication-Results` under the authserv-id `MAIL_TRUSTED_AUTHSERV_ID` (`mx.cloudflare.net`, `@pupitre/shared/legal`). `isAuthenticatedSender` (`lib/mail/authentication.ts`) reads only **the topmost header of each name**: a result copied lower down by the sender, even under our authserv-id, never counts. Each topmost header that our MX wrote must vouch for the `From` domain: `dmarc=pass` on that domain, or `dkim=pass` / `spf=pass` on an aligned domain (the same one, or one beneath the other). Without any of these headers, the sender is not verified.

The message carries `authenticated` (`MailMessage.authenticated`, `true` for what we send), the thread carries `senderAuthenticated` for its displayed sender. **An unverified sender links no account** (`contactUserId`) and **joins a thread only through its references**, never through the subject and the correspondent. Messages received before migration `0017` are unverified: nobody verified them.

**An automatic send is stored without lighting up the thread.** A `List-Unsubscribe`, an `Auto-Submitted` other than `no`, a `Precedence: bulk | list | junk`, or a `mailer-daemon@` or `postmaster@` sender: the thread keeps its state, neither unread nor reopened. The message carries `automated = true` (`MailMessage.automated`, `false` by default) and renders it in its shape; the thread carries `lastInboundAutomated`, which says whether the **last** inbound message was one — it is this column that files the thread under « Automated », because no relational filter can say "the last one".

## The mailboxes

`MailMailbox` declares the addresses the team recognises: `address` (unique, lowercase, always on `MAIL_DOMAIN`), `displayName`, `signature`, `sensitive`, `canReply`, `enabled`, `sortOrder`. Migration `0009_mail_v2.sql` writes **four**, with the stable identifiers of `@pupitre/shared/platform` (`PLATFORM_MAILBOX_IDS`): `mbx_support` (not sensitive), `mbx_legal`, `mbx_privacy`, `mbx_security` (sensitive). Those four cannot be deleted.

`MailThread.address` remains the truth of the envelope; `MailThread.mailboxId` is the mailbox declared for it, and is `null` when none declares it — the thread is then filed under **« Others »**. Opening a mailbox on an address that has already received **attaches** those threads. A disabled mailbox still receives — the catch-all does not sort — but no longer sends and drops out of the default tabs.

The migration does not merely add the columns: it **fills** `mailboxId` from the address, and `lastInboundAutomated` from the last inbound message of each thread. Without this, a thread received before the migration would have entered the open view whatever its last inbound message, and the column's default value would have made an automatic acknowledgement pass for mail to handle.

**A sensitive mailbox logs its reads**: opening a thread writes `mail.read`, opening an attachment `mail.attachment_read`. An ordinary mailbox writes nothing.

There is no longer a fixed list of sending addresses: **the possible senders are the mailboxes that are `enabled && canReply`**. The `send_email` binding in `wrangler.jsonc` lists **no** `allowed_sender_addresses`, and that is deliberate: any address of the domain may send, the verification is done by the domain itself in Email Sending.

## Attaching to a thread

In this order, the first that answers wins:

1. **References.** `In-Reply-To` and `References` name identifiers; if one of them is already in the database, the message joins its thread, whatever its subject — the one for the same destination address first, when the referenced message was stored under several.
2. **The subject and the correspondent**, for a verified sender only. Same destination address, same **normalised** subject, a thread touched within **thirty days**, and a message of the thread that carries this person as sender or recipient. A subject namesake from elsewhere does not enter. At most **ten** candidate threads are examined, the most recently touched first: beyond that, it is no longer a thread, it is a generic subject.
3. **Otherwise, a new thread**, whose `mailboxId` is that of the mailbox that declares the address, or `null`.

The normalised subject is the subject stripped of its stacked prefixes (`Re:`, `RE :`, `Re[2]:`, `Fw:`, `Fwd:`, `TR:`, `Réf:`), whitespace collapsed, lowercased.

When a readable non-automatic message arrives, the thread becomes `unread = true`, `status = open`, and `lastInboundAt` takes the time. `contactUserId` names the account whose address is the sender's, when there is one and the sender is verified. Every inbound message carries onto the thread `senderEmail`, `senderName`, `senderAuthenticated` and `snippet`; an outbound message carries its `snippet` there: the list reads only the thread rows. A `received` activity is written on the thread, and the `thread.received` realtime event goes out.

## Duplicates

Two locks, in this order:

1. **The SHA-256 hash of the destination address followed by the raw bytes** (`rawHash`, unique). A Cloudflare retry lands on it; the same message written to `support@` and to `legal@` makes two deliveries, hence two hashes.
2. **The `Message-ID` on the same destination address** (`@@unique([messageId, address])`, `MailMessage.address` carrying the envelope address, or the mailbox an outbound message leaves from). The same message arriving by two paths lands on it; the same `Message-ID` written to two of our addresses makes two rows, in two threads.

Both are checked before the write, and the unique constraint catches the race: `ingestInboundEmail` then returns `{ status: "duplicate" }` with the identifier of the row already written, rewriting nothing, and **deletes the thread it had just opened** for this message if it stayed empty (`discardEmptyMailThread`) — a race leaves no thread without a message. A duplicate **still republishes** `thread.received`: a console that missed the first broadcast catches up on this one.

## What goes where

D1 holds the thread, the text and the metadata; the R2 bucket `ppt-mail` holds everything else. The Worker touches it in two ways: through the `MAIL` binding for what it writes and reads itself (ingestion, the HTML body, building the outbound MIME), and through SigV4 **signed addresses** for what the console reads or drops directly — attachments never cross the Worker between the console and the bucket. Signed addresses carry the bucket name `R2_MAIL_BUCKET_NAME` (`vars` of `wrangler.jsonc`, `ppt-mail`) and the S3 key of the three `R2_*` secrets; without them, under Bun, the address is local (`http://localhost/__mail-storage/<key>?…`) and serves no purpose other than being read by a test.

| Object | Key |
| --- | --- |
| Raw inbound message | `mail/inbound/<rawHash>/raw.eml` |
| Inbound HTML body | `mail/inbound/<rawHash>/body.html` |
| Inbound attachment | `mail/inbound/<rawHash>/attachments/<rank>/<sanitised name>` |
| Raw outbound message | `mail/<threadId>/<generated Message-ID, without angle brackets>/raw.eml`, dropped **before** sending and before the row: a failing drop sends nothing, and no row is born without its raw |
| Outbound attachment | `mail/<threadId>/<Message-ID>/attachments/<rank>/<sanitised name>`, copied from the upload right after the raw, before sending |
| Pending upload | `mail/uploads/<userId>/<uuid>/<sanitised name>`: what the console uploaded and has not yet sent. Deleted on send, or by the daily purge after twenty-four hours |

The file name is sanitised before it enters a key: path removed, everything that is not a letter, a digit, `.`, `-` or `_` replaced.

An outbound message also stores its complete MIME under `raw.eml`: the thread can be reread whole, on both sides.

### Bucket first, row second

**Everything goes to the bucket before a single row is written** — the raw, the HTML, each attachment. A row is never born without its keys: `rawKey` is set at creation, and an attachment does not exist before its bytes are stored.

An inbound key depends on no row: it is **the hash of its own bytes**. A `put` that fails therefore leaves nothing behind — no orphan row, no empty thread — and the retry that follows writes to the same keys, over the half stored on the first attempt.

This is what was missing: when the row was written first, a failed `put` left a message without a body, and Cloudflare's retry landed on its `rawHash` and went off as a "duplicate" without ever storing the bytes. The message was lost, and nothing said so.

## What goes out

A reply and a new message go through the `EMAIL` binding of Email Sending, one send per recipient — that is what the binding accepts.

**The sending address is the mailbox's.** A reply leaves from the thread's mailbox; on an "Others" thread, it is refused with `422` and the remedy: create the mailbox, the threads already received will be attached to it. A mailbox that does not send — `canReply` false or `enabled` false — answers `409 conflict` (`mailbox_cannot_reply`). A new message names its mailbox through `mailbox_id`.

**The sender name is `"<first name> · Pupitre"`**, the first name being the first word of the replying account's name; without an account name, `Pupitre` alone. It travels RFC 2047 encoded beside the bare address, which the binding receives as is.

**The mailbox signature is appended below the text**, separated by `-- ` on its own line, when it exists. It enters the stored text: the reread thread shows what went out.

`In-Reply-To` names the replied-to message, `References` adds its identifier to its own chain. The subject is `Re: <thread subject>`, without stacking a second `Re:`. Every built header — `Subject`, `Message-ID`, `In-Reply-To`, `References` — goes through RFC 2047 encoding, which collapses line breaks: a `References` received from a third party cannot add a `Bcc:` to what goes out.

### Who it goes to

The console can **name the recipients**: `to` and `cc` in the reply body, ten at most each. Without them, or with an empty `to` after filtering, the default recipients apply.

**The replied-to message is the last non-automatic inbound one.** A bounce, a mailing list, an automatic acknowledgement are skipped — we do not reply to `mailer-daemon@`. With no human inbound message at all, the reply takes the recipients of **our own last message**; with neither, it is refused.

**No `@pupitre.studio` address is a recipient**, neither in `to` nor in copy, including among those the console named. The filter applies on both sides, and that is what matters: a sender who declares `From: support@pupitre.studio` does not turn the reply into a loop on ourselves. When no one remains after the filter, the route answers `409 conflict` (`MailThreadHasNoRecipientError`) rather than writing to the mailbox itself.

The copies of the replied-to message are carried over, minus ours and minus those already in `to`.

A new message follows the same rule: its `to` are filtered of our addresses, and with no one left after the filter `/compose` answers `409 conflict` without opening a thread.

**A send that fails does not disappear.** The message is stored `delivery: failed` with the cause in `error`, a `reply_failed` activity is written, the route answers `502`, and the `message.failed` event goes out. The route's response never copies the sending service's words: its message is generic, the cause stays on the row and in the Worker log. The thread keeps its trace, and a new attempt is a new message: nothing goes out twice without it being seen.

**The thread's draft is deleted as soon as the send succeeds.**

### Outbound attachments

A reply and a new message carry them. The bytes do not go through the API: **the console first drops each file in the bucket**, through a signed `PUT` address, then names the uploads in the send body.

1. `POST /uploads { filename, mime_type, size }` refuses an extension of `MAIL_BLOCKED_ATTACHMENT_EXTENSIONS` (`@pupitre/shared/legal`: executables, scripts, installers) with `422 validation`, otherwise returns the key `mail/uploads/<userId>/<uuid>/<sanitised name>` and a `PUT` address valid for `MAIL_SIGNED_URL_TTL_SECONDS` (ten minutes). The console sends the bytes there itself, with the `content-type` header only — that is what the bucket's CORS rule allows ([`deploy.md`](../deploy.md)).
2. `attachments: [{ key, filename, mime_type, size }]` in the body of `/threads/:id/reply` or `/compose`: at most `MAIL_MAX_OUTBOUND_ATTACHMENTS` (ten), `MAIL_MAX_OUTBOUND_ATTACHMENT_BYTES` (5 MiB) in total, each key under `mail/uploads/<caller's userId>/` — another user's key, or one that climbs out of the prefix, is `422`. A blocked name is `422` here too.
3. On send, each upload is read through the binding: missing, `422 validation` (`mail_upload_missing`); larger than announced, `422` (`mail_upload_size_mismatch`). Everything is checked **before** a thread or a row is born: a refused `compose` opens no thread. A `compose` whose bucket drop fails deletes the thread it had just opened; a send refused by the service keeps it, with its failed message.

`mime_type` follows `^[\w.+-]+/[\w.+-]+$` (`422` otherwise), and the built MIME still strips any line break from the type: a type cannot add a header.
4. The MIME becomes `multipart/mixed`: the text + HTML `multipart/alternative` as first part, then each attachment in base64 under `Content-Disposition: attachment; filename="…"`. Without an attachment, nothing changes.
5. The raw is dropped, then each attachment is copied under `mail/<threadId>/<Message-ID>/attachments/<rank>/<name>`, then the message goes out, then the row and its `MailAttachment` rows are written, then the uploads are deleted. A send that fails keeps its attachments under the failed message.

An outbound `MailAttachment` has the same shape as an inbound one: the console reads them through the same route.

### Reading an attachment

`GET /attachments/:id/url?disposition=inline|attachment` returns a ten-minute signed `GET` address, and nothing else: the bytes go from the bucket to the browser. What the bucket answers is **signed into the address** — `response-content-disposition` and `response-content-type` are part of the canonical request, the console cannot change them.

- `inline` is honoured only for a type that `isPreviewableMailType` accepts — a raster image (`image/*` except SVG) or a PDF — and the address then asks for the stored type. Everything else is forced to `attachment; filename="<sanitised name>"`, under a type narrowed to a short list (images except SVG, PDF, text, CSV, zip, office documents) or `application/octet-stream`: to save, never to open.
- `mime_type` in the response is the one the address will serve, not necessarily the one the sender declared.
- On a **sensitive mailbox**, the read writes `mail.attachment_read` on the `mail_thread` target.

### Inline images

An HTML message that carries `<img src="cid:…">` designates a part of the same message by its `Content-ID`. `GET /messages/:id/html` rewrites each `src="cid:<id>"` — double quotes, single quotes or bare — to the signed `inline` address of the attachment that carries that `contentId`. The rewrite stays, but **the CSP no longer loads any remote image** (see *A message's HTML*): the image is read from the attachments strip, above the body. A `cid` that matches nothing is left as is.

### The purge of uploads

`purgeStaleMailUploads` (`lib/mail/uploads.ts`) lists `mail/uploads/` through the binding and deletes what is more than twenty-four hours old, according to the object's upload date. It runs as the last step of the daily `SuspendExpiredGrace` workflow, after `suspend-expired-grace`. Nothing else is purged: a thread and its objects stay.

## Realtime

`GET /api/v1/admin/inbox/events`, as a **WebSocket**. The Worker intercepts this path **before** Elysia — an Elysia router does not return a `101`: it resolves the session through `resolveAuthContext`, requires membership of the Pupitre organization (same rule as `requirePlatformAdmin`), then forwards the request to the Durable Object stub. Refusals follow the order of `refuseSession`: an account the platform no longer honours (`accountRefusal`) gets `403` before its role is even read, without a session it is `401`, outside the team `403`, and without an `Upgrade: websocket` header `400`. None of these refusals opens a socket.

The `InboxRealtime` class is exported by `apps/web/src/worker.ts` — Cloudflare resolves a durable object binding on the Worker's entry, like workflows — and its logic lives in `apps/web/src/realtime/inbox-realtime.ts`. A single instance, `idFromName("platform")`. It **stores nothing**: it accepts the socket in hibernation (`state.acceptWebSocket`, `webSocketMessage`, `webSocketClose`) and broadcasts. A `ping` receives `pong`, nothing else.

`packages/api/src/lib/mail/realtime.ts` exposes `publishInboxEvent(event)`, configurable like the transport (`configureInboxRealtime`, no-op by default). In production, the Worker installs a publisher that `fetch`es the stub on its internal `/publish` path, behind `INTERNAL_WORKFLOW_SECRET`; the test harness records events in `useFakeMail().broadcast`. **A broadcast that fails never fails the write**: the console falls back to its polling.

| Event | When | What the console refetches |
| --- | --- | --- |
| `thread.received` | ingestion stored a message, recognised duplicate included | the list, the counters, the named thread |
| `thread.updated` | a `PATCH /threads/:id`, a note | the list, the named thread |
| `draft.changed` | a draft kept or discarded | the list only (`has_draft`) |
| `message.sent` | a reply or a new message went out | the list, the named thread |
| `message.failed` | the send was refused by the sending service | the list, the named thread |
| `counts.changed` | a batch that changes something, or a mailbox change | the counters, the mailboxes |

Each event carries `type`, and depending on the case `thread_id` and `mailbox_id`.

**A read is not broadcast.** Opening a thread of a sensitive mailbox writes to the log but emits no frame: it changes nothing for the others, and a frame that had made the thread refetch would have redone the read that emitted it — the read would have looped on itself. For the same reason, **the console dispatches invalidation by event type** (column above) instead of invalidating everything, and a frame of a type it does not know refetches nothing.

On the console side, `useInboxRealtime()` is opened **once** by the inbox layout, reconnects with an exponential backoff capped at thirty seconds, and invalidates the queries the event names. `INBOX_POLL_INTERVAL_MS` is 60 s and now serves only to catch up after a dead socket: the console works without a socket, and that is what the e2e harness does.

A socket that throws on send is closed and dropped from the round: the broadcast continues to the others.

## Routes

Under `/api/v1/admin/inbox`. **Reading requires membership of the Pupitre organization** (`requirePlatformAdmin`); **acting requires the `admin` or `owner` role** in that organization (`requirePlatformRole("admin")`). Two exceptions kept from the old contract: `unread` on a thread, and `unread` in a batch, remain open to any member.

### Mailboxes

| Method | Route | Body | Response |
| --- | --- | --- | --- |
| GET | `/mailboxes` | — | `{ data: Mailbox[] }`, `sortOrder` then address |
| POST | `/mailboxes` | `{ address, display_name, signature?, sensitive?, can_reply? }` | `201 { data: Mailbox }`. `address` is the local part alone, or the full address on `MAIL_DOMAIN`; anything else is `422 validation`. `409 conflict` (`mailbox_taken`) if the address already has a mailbox. The "Others" threads on this address are attached to it. Log `mail.mailbox_created`. `admin` role |
| PATCH | `/mailboxes/:id` | `{ display_name?, signature?, sensitive?, can_reply?, enabled?, sort_order? }` | `{ data: Mailbox }`. `404` on an unknown mailbox. Log `mail.mailbox_updated`. `admin` role |
| DELETE | `/mailboxes/:id` | — | `204` when the mailbox carries no thread. `409 conflict` (`mailbox_in_use`, the `fix` says to disable it) otherwise; `409 conflict` (`mailbox_protected`) on one of the four legal mailboxes. Log `mail.mailbox_deleted`. `admin` role |
| GET | `/counts` | — | `{ data: { mailboxes: [{ id, unread, open }], others: { unread, open, threads }, total_unread } }`. `others.threads` counts **all** the threads that no mailbox declares, read and closed included: it is what decides whether "Others" appears in the rail |

### Threads

| Method | Route | Body | Response |
| --- | --- | --- | --- |
| GET | `/threads` | — | `{ data: Thread[], total, unread }`. Filters as parameters: `status=open\|closed`, `unread=true\|false`, `q`, `address`, `mailbox_id` (`others` for the threads no mailbox declares), `organization_id`, `automated=true`, `assigned=me\|none\|<userId>`, `sort=last_activity\|last_inbound_at\|created_at\|subject` (`last_activity` by default), `direction=asc\|desc` (`desc` by default), `limit` (50 by default, 200 at most), `offset`. `q` searches the subject, the address and the sender names, **the message text** and the thread identifier. `%` and `_` are the wildcards of the `LIKE` that `q` feeds: they are **removed** from the search, and a search that was only wildcards returns nothing — `q=%` used to return everything. **Threads whose last inbound message is automatic are excluded by default**; `automated=true` returns only them. `unread` counts the unread threads that pass the **other** filters: it is the header counter, it does not follow the "unread" checkbox |
| GET | `/threads/:id` | — | `{ data: Thread & { mailbox, messages: Message[], notes: Note[], activities: Activity[], draft: Draft \| null } }`, messages from oldest to newest. **Opening a thread does not mark it read**: the console says so, through the PATCH. On a **sensitive mailbox**, opening writes `mail.read` to the log and a `read` activity, **once per reader and per `MAIL_READ_AUDIT_WINDOW_MS` window** (`@pupitre/shared/legal`, ten minutes): the log says who read what, not how many times the console refetched |
| PATCH | `/threads/:id` | `{ status?, unread?, assigned_user_id?, linked_organization_id? }` | `{ data: ThreadDetail }`. `unread` is open to any member; `status`, `assigned_user_id` and `linked_organization_id` require the `admin` role, otherwise `403 forbidden`. The assignee must be a member of the Pupitre organization, otherwise `422 validation`; an unknown organization is `422 validation`; `null` unlinks. Activities `assigned`/`unassigned`/`closed`/`reopened`/`linked`/`unlinked`/`read`/`unread` |
| POST | `/threads/bulk` | `{ ids (1..100), status?, unread? }` | `{ data: { updated } }`, where `updated` is the number of threads **actually changed**: closing what is already closed changes none. `status` requires the `admin` role, `unread` is open to any member. One activity per thread that really changes; one log event per batch, named by what it does — `mail.bulk_closed`, `mail.bulk_reopened`, `mail.bulk_read`, `mail.bulk_unread` — and no `counts.changed` when nothing changed |
| GET | `/messages/:id/html` | — | the stored HTML body, as `text/html; charset=utf-8`, under the CSP of *A message's HTML* and `X-Content-Type-Options: nosniff`, `src="cid:…"` rewritten. `404` when the message has no HTML |
| GET | `/attachments/:id/url` | `?disposition=inline\|attachment` | `{ data: { url, expires_at, mime_type, filename, size } }`. See *Reading an attachment*. `404 not_found` |

The console's address carries only what the reader chose (`parseInboxSearch` is built on `listSearch`): filters left at their default do not appear in it, a bare `/dashboard/admin/inbox` is the open view sorted by last activity, and the organization an `organization_id` names is read by `GET /admin/organizations/:id`, never guessed from the displayed page.

### Notes, drafts, canned replies

| Method | Route | Body | Response |
| --- | --- | --- | --- |
| GET | `/threads/:id/notes` | — | `{ data: Note[] }`, from oldest to newest |
| POST | `/threads/:id/notes` | `{ body (1..10 000) }` | `201 { data: Note }`. Activity `note_added`, log `mail.note_added`. `admin` role |
| DELETE | `/threads/:id/notes/:noteId` | — | `204`, `404` on an unknown note. Activity `note_deleted`, log `mail.note_deleted`. `admin` role: writing a note already requires it, so a note's author is always an `admin` |
| GET | `/threads/:id/draft` | — | `{ data: Draft }`, `404 not_found` when the thread carries none |
| PUT | `/threads/:id/draft` | `{ body (0..20 000), to?, cc?, attachments? }` | `{ data: Draft }`. One draft per thread: the write creates or replaces. Event `draft.changed`. `admin` role |
| DELETE | `/threads/:id/draft` | — | `204`, `404` without a draft. A successful send deletes it by itself, and the console deletes it as soon as the text becomes empty again. Event `draft.changed`. `admin` role |
| GET | `/templates` | `?mailbox_id=` | `{ data: Template[] }`. With `mailbox_id`, the canned replies of that mailbox **and** those that name none |
| POST | `/templates` | `{ name (1..80), body (1..20 000), mailbox_id? }` | `201 { data: Template }`. An unknown mailbox is `422 validation`. Log `mail.template_created`. `admin` role |
| PATCH | `/templates/:id` | `{ name?, body?, mailbox_id? }` | `{ data: Template }`, `404` on an unknown canned reply. Log `mail.template_updated`. `admin` role. The settings page calls it: each canned reply carries a gesture that loads it into the form, which then saves the changes instead of creating a second one |
| DELETE | `/templates/:id` | — | `204`, `404`. Log `mail.template_deleted`. `admin` role |

A canned reply is **a prefill of the console**: `template_id` is never sent to the server, the inserted text is what goes out.

### What goes out

| Method | Route | Body | Response |
| --- | --- | --- | --- |
| POST | `/uploads` | `{ filename (1..255), mime_type, size (1..5 MiB) }` | `201 { data: { key, url, expires_at } }`. `422 validation` on a blocked extension. `admin` role |
| POST | `/threads/:id/reply` | `{ text (1..20 000), to?, cc?, attachments? }` | `201 { data: Message }`. The thread becomes `unread = false`, `lastOutboundAt` takes the time, the draft is deleted. `422 validation` (`mail_thread_no_mailbox`) on an "Others" thread, `409 conflict` (`mailbox_cannot_reply`) on a mailbox that does not send, `409 conflict` if the thread carries no address to reply to, `422 validation` on a refused attachment, `502` if the send fails. Activity `replied` or `reply_failed` |
| POST | `/compose` | `{ mailbox_id, to[1..10], subject, text, attachments? }` | `201 { data: ThreadDetail }`. An unknown mailbox is `422 validation`, a mailbox that does not send `409 conflict`; same attachment rules. Activity `composed` |

`GET /addresses` **no longer exists**: `GET /mailboxes` replaces it, and the console chooses among the mailboxes that send.

### A message's HTML

**There is no sanitiser, and that is deliberate.** There used to be one: a pass of four regular expressions. It did not hold. `<scri<script>pt>` rebuilt the tag the pass had just removed, `<img/onerror=…>` got through for lack of a space before the attribute, `jav&#97;script:` and `java\tscript:` got through for lack of decoding. A half-lock reads as a lock: it was removed rather than left to reassure.

What holds, in its place:

1. **The CSP.** `default-src 'none'; img-src data:; style-src 'unsafe-inline'; font-src data:; form-action 'none'; base-uri 'none'; frame-ancestors 'self'; sandbox`. `sandbox` isolates the body even when opened outside the console's frame, `form-action` and `base-uri` close what `default-src` does not cover. `script-src` falls back to `default-src 'none'`: no inline script, no `on*` handler, no `javascript:` URL runs, whatever the tag looks like. **`img-src` stops at `data:`**: a tracking pixel in a message written to `security@` tells its sender neither the time of the read nor the address it came from. An attached image opens from the strip above the body.
2. **The console's frame.** The body is displayed in an `iframe` with an empty `sandbox` (`apps/web/src/components/admin/inbox/inbox-message-html.tsx`): no script, no form, no navigation, opaque origin.
3. **`nosniff`**, so that the served type is the one announced.

The body therefore goes out **as it arrived**, up to one rewrite: `src="cid:…"` become the signed addresses of their attachments, and nothing else is touched.

### Shapes

```ts
Mailbox = {
  id, address, display_name, signature: string | null,
  sensitive, can_reply, enabled, sort_order,
  threads: number, unread: number,
}

Thread = {
  id, address, mailbox_id: string | null, subject, status, unread,
  assigned_user: { id, name, email } | null,
  contact: { user_id, email, name } | null,
  linked_organization: { id, name, slug } | null,
  from: { email, name: string | null },
  sender_authenticated: boolean,
  snippet: string | null,
  messages: number,
  notes: number,
  has_draft: boolean,
  automated: boolean,
  last_inbound_at, last_outbound_at, updated_at, created_at,
}

ThreadDetail = Omit<Thread, "messages" | "notes"> & {
  mailbox: Omit<Mailbox, "sort_order" | "threads" | "unread"> | null,
  messages: Message[],
  notes: Note[],
  activities: Activity[],
  draft: Draft | null,
}

Message = {
  id, direction,
  from: { email, name }, to: string[], cc: string[],
  subject, text, has_html, automated, authenticated, delivery, error,
  sent_by: { id, name } | null,
  received_at, sent_at,
  attachments: [{ id, filename, mime_type, size }],
}

Note = {
  id, body,
  author: { id, name } | null,
  created_at, updated_at,
}

Activity = {
  id, action, actor: { id, name } | null, metadata, created_at,
}

Draft = {
  body, to: string[], cc: string[],
  attachments: [{ key, filename, mime_type, size }],
  updated_by: { id, name } | null,
  updated_at,
}

Template = { id, name, body, mailbox_id: string | null, created_at, updated_at }
```

`messages` and `notes` are counts in the list and are **carried** in the detail: the list says how many, the open thread says which.

`from` is the last inbound sender; on a thread born from a message written by the team, it is the first recipient of that message, so the line is not empty. `sender_authenticated` says whether that last inbound sender was verified (see *The verified sender*) — `true` on a thread the team opened that has received nothing: the console shows « Expéditeur non vérifié » when it is `false`. `authenticated` says the same of a message, and is `true` for what goes out. `subject` is `""` for a message received without a subject: the console names it.

An activity's `action` is one of `received`, `read`, `unread`, `replied`, `reply_failed`, `composed`, `assigned`, `unassigned`, `closed`, `reopened`, `linked`, `unlinked`, `note_added`, `note_deleted`.

### Error codes

Those of `@pupitre/shared/api/errors`, with no additions. A send that fails answers `502` with the code `internal`: it is the platform that failed, not the caller, and the `fix` says the message is kept as failed in the thread. A refused attachment answers `422 validation`, and the message says which one and why (`mail_attachment_blocked`, `mail_attachments_too_large`, `mail_upload_missing`, `mail_upload_foreign`, `mail_upload_size_mismatch` in `lib/i18n`), the `fix` what remains to be done. Refusals specific to mailboxes have their own keys: `mailbox_not_found`, `mailbox_address_refused`, `mailbox_taken`, `mailbox_in_use`, `mailbox_protected`, `mailbox_cannot_reply`, `mail_thread_no_mailbox`, `mail_organization_unknown`, `mail_note_not_found`, `mail_draft_not_found`, `mail_template_not_found`, `mail_template_mailbox_unknown`.

## The log

On the `mail_thread` target: `mail.closed`, `mail.reopened`, `mail.assigned`, `mail.replied`, `mail.composed`, `mail.read`, `mail.attachment_read`, `mail.linked`, `mail.note_added`, `mail.note_deleted`, `mail.bulk_closed`, `mail.bulk_reopened`, `mail.bulk_read`, `mail.bulk_unread`.

On the `mail_mailbox` target: `mail.mailbox_created`, `mail.mailbox_updated`, `mail.mailbox_deleted`.

On the `mail_template` target: `mail.template_created`, `mail.template_updated`, `mail.template_deleted`.

Without an organization, except `mail.linked`, which carries the one just linked: the inbox is the platform's, not a customer's.

## What is not built

- **No thread purge.** Only pending uploads are deleted (see *The purge of uploads*); nothing deletes a thread or its objects. The day it is missed, it will be a decision, not a side effect.
- **No per-person draft.** A thread carries one draft, the team's; the last to write replaces the previous one, and the row says who.
- **No already-uploaded attachment in a draft.** The draft keeps the keys the console gives it; the chosen files go to the bucket only on send.
- **No automatic resend of a failed message.** A new attempt is a new message, written by hand.
