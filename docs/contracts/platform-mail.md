# Boîte de la plateforme

Tout ce qui est écrit à une adresse `*@pupitre.studio` arrive dans la base de la plateforme, et l'équipe y répond depuis la console. Il n'y a pas de boîte ailleurs : pas de Gmail, pas de Zendesk, pas de redirection vers une adresse personnelle.

Complément de [`platform-api.md`](./platform-api.md), dont il reprend le registre : les routes vivent sous `/api/v1/admin/inbox`, elles sont cachées de l'OpenAPI comme tout le groupe `/admin/**`, et leurs erreurs ont la forme `{ error: { code, message, fix? } }`.

## Ce qui arrive

Email Routing de Cloudflare porte une règle **catch-all** sur la zone `pupitre.studio` : *Send to a Worker*, le Worker de la console (`ppt-web-production`). Aucune adresse n'est déclarée une par une — `support@`, `legal@`, `privacy@`, `security@` reçoivent, et n'importe quelle autre aussi.

Le Worker expose un handler `email(message, env, ctx)` (`apps/web/src/worker.ts`), qui délègue à `handleInboundEmailMessage`. Il lit `message.raw` en entier, ouvre un client Prisma sur la D1 de la requête, et appelle `ingestInboundEmail`. **Il ne rattrape rien** : une exception remonte à Cloudflare, qui traite la livraison comme un échec temporaire et la représente. Un message perdu coûte plus qu'un message livré deux fois — et un message livré deux fois est reconnu (voir *Doublons*).

Le même chemin s'ouvre en local par `POST /internal/email`, derrière le secret `INTERNAL_WORKFLOW_SECRET` des déclencheurs internes ; le corps est le MIME brut, l'enveloppe est portée par deux en-têtes. La commande est dans [`monorepo.md`](../monorepo.md).

## Ce qui ne rentre pas

**Un message au-dessus de `MAIL_MAX_BYTES`** (20 Mio, `@pupitre/shared/legal`) **est refusé à la porte.** `message.rawSize` est lu avant les octets : au-dessus du plafond, `message.setReject("Message too large")` et rien d'autre. Sans ce refus, mettre le message en mémoire tue l'isolat, Cloudflare traite la mort comme un échec temporaire, et représente indéfiniment un message qui ne passera jamais. Un refus est définitif et l'expéditeur en est averti ; une boucle de renvoi, non. Le même plafond vaut sur `POST /internal/email`, qui répond `413`.

**Le texte est coupé à `MAIL_MAX_TEXT_CHARS`** (200 000 caractères) avant d'entrer en base : D1 refuse une valeur au-delà du mégaoctet, et ce refus-là arriverait après l'écriture des objets, donc dans la même boucle de renvoi. Le `.eml` brut dans le seau garde le corps entier — **c'est lui la source de vérité**, la colonne n'est que ce qu'on lit à l'écran. Le `snippet` est calculé sur le texte complet.

## Lecture du message

`postal-mime` lit le message : sujet, expéditeur, destinataires, copies, corps texte, corps HTML, `Message-ID`, `In-Reply-To`, `References`, pièces jointes avec leurs octets. Les identifiants sont rangés **sans chevrons**.

**Un message illisible est quand même rangé.** La lecture rend `null`, l'enveloppe SMTP fournit l'expéditeur et le destinataire, et les octets partent dans le seau : rien ne se perd dans une boucle de renvoi sur un message qu'aucun analyseur n'acceptera jamais.

**Un envoi automatique est rangé sans allumer le fil.** Un `List-Unsubscribe`, un `Auto-Submitted` autre que `no`, un `Precedence: bulk | list | junk`, ou un expéditeur `mailer-daemon@` ou `postmaster@` : le fil garde son état, ni non lu ni rouvert. Le message porte `automated = true` (`MailMessage.automated`, `false` par défaut) et le rend dans sa forme ; le fil porte `lastInboundAutomated`, qui dit si le **dernier** entrant l'était — c'est cette colonne qui range le fil dans « Automatiques », parce qu'aucun filtre relationnel ne sait dire « le dernier ».

## Les boîtes

`MailMailbox` déclare les adresses que l'équipe reconnaît : `address` (unique, minuscule, toujours sur `MAIL_DOMAIN`), `displayName`, `signature`, `sensitive`, `canReply`, `enabled`, `sortOrder`. La migration `0009_mail_v2.sql` en écrit **quatre**, aux identifiants stables de `@pupitre/shared/platform` (`PLATFORM_MAILBOX_IDS`) : `mbx_support` (non sensible), `mbx_legal`, `mbx_privacy`, `mbx_security` (sensibles). Ces quatre-là ne se suppriment pas.

`MailThread.address` reste la vérité de l'enveloppe ; `MailThread.mailboxId` est la boîte qu'on a déclarée pour elle, et vaut `null` quand aucune ne la déclare — le fil est alors rangé dans **« Autres »**. Ouvrir une boîte sur une adresse qui a déjà reçu **rattache** ces fils-là. Une boîte désactivée reçoit encore — le catch-all ne trie pas — mais n'émet plus et sort des onglets par défaut.

La migration ne se contente pas d'ajouter les colonnes : elle **remplit** `mailboxId` depuis l'adresse, et `lastInboundAutomated` depuis le dernier message entrant de chaque fil. Sans cela un fil reçu avant la migration serait entré dans la vue ouverte quel que soit son dernier entrant, et la valeur par défaut de la colonne aurait fait passer un accusé automatique pour du courrier à traiter.

**Une boîte sensible journalise ses lectures** : ouvrir un fil y écrit `mail.read`, ouvrir une pièce jointe `mail.attachment_read`. Une boîte ordinaire n'écrit rien.

Il n'y a plus de liste d'adresses d'expédition figée : **les expéditeurs possibles sont les boîtes `enabled && canReply`**. Le binding `send_email` de `wrangler.jsonc` ne liste **aucun** `allowed_sender_addresses`, et c'est délibéré : toute adresse du domaine peut émettre, la vérification est faite par le domaine lui-même dans Email Sending.

## Rattachement à un fil

Dans cet ordre, le premier qui répond gagne :

1. **Les références.** `In-Reply-To` et `References` nomment des identifiants ; si l'un d'eux est déjà en base, le message rejoint son fil, quel que soit son sujet.
2. **Le sujet et le correspondant.** Même adresse de destination, même sujet **normalisé**, fil touché dans les **trente jours**, et un message du fil qui porte cette personne en expéditeur ou en destinataire. Un homonyme de sujet venu d'ailleurs n'entre pas. Au plus **dix** fils candidats sont examinés, les plus récemment touchés d'abord : au-delà, ce n'est plus un fil, c'est un sujet générique.
3. **Sinon, un fil neuf**, dont `mailboxId` est celui de la boîte qui déclare l'adresse, ou `null`.

Le sujet normalisé est le sujet débarrassé de ses préfixes empilés (`Re:`, `RE :`, `Re[2]:`, `Fw:`, `Fwd:`, `TR:`, `Réf:`), espaces écrasés, en minuscules.

À l'arrivée d'un message lisible non automatique, le fil passe `unread = true`, `status = open`, et `lastInboundAt` prend l'heure. `contactUserId` nomme le compte dont l'adresse est celle de l'expéditeur, quand il y en a un. Une activité `received` est écrite sur le fil, et l'événement temps réel `thread.received` part.

## Doublons

Deux verrous, dans cet ordre :

1. **L'empreinte SHA-256 des octets bruts** (`rawHash`, unique). Un renvoi de Cloudflare retombe dessus.
2. **Le `Message-ID`** (unique), **sur la même adresse de destination**. Un même message arrivé par deux chemins retombe dessus ; un `Message-ID` recopié par un tiers dans un message écrit à une autre de nos adresses n'efface pas ce message-là.

Les deux sont vérifiés avant l'écriture, et la contrainte unique rattrape la course : `ingestInboundEmail` rend alors `{ status: "duplicate" }` avec l'identifiant de la ligne déjà écrite, sans rien réécrire. Un doublon **republie quand même** `thread.received` : la console qui a raté la première diffusion rattrape celle-là.

## Ce qui va où

La D1 tient le fil, le texte et les métadonnées ; le seau R2 `ppt-mail` tient tout le reste. Le Worker y touche de deux façons : par le binding `MAIL` pour ce qu'il écrit et lit lui-même (l'ingestion, le corps HTML, la construction du MIME sortant), et par des **adresses signées** SigV4 pour ce que la console lit ou dépose directement — les pièces jointes ne traversent jamais le Worker entre la console et le seau. Les adresses signées portent le nom du seau `R2_MAIL_BUCKET_NAME` (`vars` de `wrangler.jsonc`, `ppt-mail`) et la clé S3 des trois secrets `R2_*` ; sans eux, sous Bun, l'adresse est locale (`http://localhost/__mail-storage/<clé>?…`) et ne sert à rien d'autre qu'à être lue par un test.

| Objet | Clé |
| --- | --- |
| Message entrant brut | `mail/inbound/<rawHash>/raw.eml` |
| Corps HTML entrant | `mail/inbound/<rawHash>/body.html` |
| Pièce jointe entrante | `mail/inbound/<rawHash>/attachments/<rang>/<nom assaini>` |
| Message sortant brut | `mail/<threadId>/<Message-ID généré, sans chevrons>/raw.eml`, déposé **avant** l'envoi et avant la ligne : un dépôt qui échoue n'envoie rien, et aucune ligne ne naît sans son brut |
| Pièce jointe sortante | `mail/<threadId>/<Message-ID>/attachments/<rang>/<nom assaini>`, copiée du dépôt juste après le brut, avant l'envoi |
| Dépôt en attente | `mail/uploads/<userId>/<uuid>/<nom assaini>` : ce que la console a téléversé et pas encore envoyé. Effacé à l'envoi, ou par la purge quotidienne au bout de vingt-quatre heures |

Le nom de fichier est assaini avant d'entrer dans une clé : chemin retiré, tout ce qui n'est ni lettre, ni chiffre, ni `.`, ni `-`, ni `_` remplacé.

Un message sortant range lui aussi son MIME complet sous `raw.eml` : le fil se relit entier, des deux côtés.

### Le seau d'abord, la ligne ensuite

**Tout part au seau avant qu'une seule ligne soit écrite** — le brut, le HTML, chaque pièce jointe. Une ligne ne naît jamais sans ses clés : `rawKey` est posé à la création, et une pièce jointe n'existe pas avant que ses octets soient rangés.

La clé d'un entrant ne dépend d'aucune ligne : elle est **l'empreinte de ses propres octets**. Un `put` qui casse ne laisse donc rien derrière lui — ni ligne orpheline, ni fil vide — et le renvoi qui suit écrit aux mêmes clés, par-dessus la moitié rangée au premier essai.

C'est ce qui manquait : quand la ligne était écrite d'abord, un `put` cassé laissait un message sans corps, et le renvoi de Cloudflare retombait sur son `rawHash` et repartait en « doublon » sans jamais ranger les octets. Le message était perdu, et rien ne le disait.

## Ce qui part

Une réponse et un nouveau message passent par le binding `EMAIL` d'Email Sending, un envoi par destinataire — c'est ce que le binding accepte.

**L'adresse d'expédition est celle de la boîte.** Une réponse part de la boîte du fil ; sur un fil « Autres », elle est refusée en `422` avec le remède : créer la boîte, les fils déjà reçus lui seront rattachés. Une boîte qui n'émet pas — `canReply` faux ou `enabled` faux — répond `409 conflict` (`mailbox_cannot_reply`). Un nouveau message nomme sa boîte par `mailbox_id`.

**Le nom d'expéditeur est `"<prénom> · Pupitre"`**, le prénom étant le premier mot du nom du compte qui répond ; sans nom de compte, `Pupitre` seul. Il voyage encodé RFC 2047 à côté de l'adresse nue, que le binding reçoit telle quelle.

**La signature de la boîte est ajoutée sous le texte**, séparée par `-- ` sur sa propre ligne, quand elle existe. Elle entre dans le texte enregistré : le fil relu montre ce qui est parti.

`In-Reply-To` nomme le message répondu, `References` ajoute son identifiant à sa propre chaîne. Le sujet est `Re: <sujet du fil>`, sans empiler un second `Re:`. Tout en-tête construit — `Subject`, `Message-ID`, `In-Reply-To`, `References` — passe par l'encodage RFC 2047, qui écrase les retours à la ligne : un `References` reçu d'un tiers ne peut pas ajouter un `Bcc:` à ce qui part.

### À qui elle va

La console peut **nommer les destinataires** : `to` et `cc` dans le corps de la réponse, dix au plus chacun. Sans eux, ou avec un `to` vide après filtrage, les destinataires par défaut s'appliquent.

**Le message répondu est le dernier entrant non automatique.** Un rebond, une liste de diffusion, un accusé automatique sont sautés — on ne répond pas à `mailer-daemon@`. Sans aucun entrant humain, la réponse reprend les destinataires de **notre propre dernier message** ; sans l'un ni l'autre, elle est refusée.

**Aucune adresse `@pupitre.studio` n'est destinataire**, ni en `to` ni en copie, y compris parmi celles que la console a nommées. Le filtre vaut des deux côtés, et c'est ce qui compte : un expéditeur qui se déclare `From: support@pupitre.studio` ne transforme pas la réponse en boucle sur nous-mêmes. Quand il ne reste plus personne après le filtre, la route répond `409 conflict` (`MailThreadHasNoRecipientError`) plutôt que d'écrire à la boîte elle-même.

Les copies du message répondu sont reprises, moins les nôtres et moins celles déjà en `to`.

**Un envoi qui casse ne disparaît pas.** Le message est enregistré `delivery: failed` avec la cause dans `error`, une activité `reply_failed` est écrite, la route répond `502`, et l'événement `message.failed` part. Le fil garde sa trace, et un nouvel essai est un nouveau message : rien ne part deux fois sans qu'on le voie.

**Le brouillon du fil est effacé dès que l'envoi réussit.**

### Les pièces jointes sortantes

Une réponse et un nouveau message en portent. Les octets ne passent pas par l'API : **la console dépose d'abord chaque fichier dans le seau**, par une adresse `PUT` signée, puis nomme les dépôts dans le corps de l'envoi.

1. `POST /uploads { filename, mime_type, size }` refuse une extension de `MAIL_BLOCKED_ATTACHMENT_EXTENSIONS` (`@pupitre/shared/legal` : exécutables, scripts, installeurs) en `422 validation`, sinon rend la clé `mail/uploads/<userId>/<uuid>/<nom assaini>` et une adresse `PUT` valable `MAIL_SIGNED_URL_TTL_SECONDS` (dix minutes). La console y envoie les octets elle-même, avec le seul en-tête `content-type` — c'est ce que la règle CORS du seau autorise ([`deploy.md`](../deploy.md)).
2. `attachments: [{ key, filename, mime_type, size }]` dans le corps de `/threads/:id/reply` ou de `/compose` : au plus `MAIL_MAX_OUTBOUND_ATTACHMENTS` (dix), `MAIL_MAX_OUTBOUND_ATTACHMENT_BYTES` (5 Mio) en tout, chaque clé sous `mail/uploads/<userId de l'appelant>/` — une clé d'un autre, ou qui remonte hors du préfixe, vaut `422`. Un nom bloqué vaut `422` ici aussi.
3. À l'envoi, chaque dépôt est lu par le binding : absent, `422 validation` (`mail_upload_missing`) ; plus gros qu'annoncé, `422` (`mail_upload_size_mismatch`). Tout est vérifié **avant** qu'un fil ou une ligne naisse : un `compose` refusé n'ouvre aucun fil.
4. Le MIME devient `multipart/mixed` : le `multipart/alternative` texte + HTML en première partie, puis chaque pièce en base64 sous `Content-Disposition: attachment; filename="…"`. Sans pièce jointe, rien ne change.
5. Le brut est déposé, puis chaque pièce est copiée sous `mail/<threadId>/<Message-ID>/attachments/<rang>/<nom>`, puis le message part, puis la ligne et ses `MailAttachment` sont écrites, puis les dépôts sont effacés. Un envoi qui casse garde ses pièces sous le message en échec.

Un `MailAttachment` sortant a la même forme qu'un entrant : la console les lit par la même route.

### Lire une pièce jointe

`GET /attachments/:id/url?disposition=inline|attachment` rend une adresse `GET` signée de dix minutes, et rien d'autre : les octets vont du seau au navigateur. Ce que le seau répond est **signé dans l'adresse** — `response-content-disposition` et `response-content-type` font partie de la requête canonique, la console ne peut pas les changer.

- `inline` n'est honoré que pour un type que `isPreviewableMailType` accepte — une image matricielle (`image/*` hors SVG) ou un PDF — et l'adresse demande alors le type enregistré. Tout le reste est forcé en `attachment; filename="<nom assaini>"`, sous un type ramené à une liste courte (images hors SVG, PDF, texte, CSV, zip, bureautique) ou `application/octet-stream` : à enregistrer, jamais à ouvrir.
- `mime_type` dans la réponse est celui que l'adresse servira, pas forcément celui que l'expéditeur avait déclaré.
- Sur une **boîte sensible**, la lecture écrit `mail.attachment_read` sur la cible `mail_thread`.

### Les images en ligne

Un message HTML qui porte `<img src="cid:…">` désigne une partie du même message par son `Content-ID`. `GET /messages/:id/html` réécrit chaque `src="cid:<id>"` — guillemets doubles, simples ou nus — vers l'adresse `inline` signée de la pièce jointe qui porte ce `contentId`. La réécriture reste, mais **la CSP ne charge plus aucune image distante** (voir *Le HTML d'un message*) : l'image se lit depuis le bandeau des pièces jointes, au-dessus du corps. Un `cid` qui ne correspond à rien reste tel quel.

### La purge des dépôts

`purgeStaleMailUploads` (`lib/mail/uploads.ts`) liste `mail/uploads/` par le binding et efface ce qui a plus de vingt-quatre heures, d'après la date de dépôt de l'objet. Elle tourne en dernière étape du workflow quotidien `SuspendExpiredGrace`, après `reconcile-launch` et `suspend-expired-grace`. Rien d'autre n'est purgé : un fil et ses objets restent.

## Le temps réel

`GET /api/v1/admin/inbox/events`, en **WebSocket**. Le Worker intercepte ce chemin **avant** Elysia — un routeur Elysia ne rend pas un `101` : il résout la session par `resolveAuthContext`, exige l'appartenance à l'organisation Pupitre (même règle que `requirePlatformAdmin`), puis transmet la requête au stub du Durable Object. Les refus suivent l'ordre de `refuseSession` : un compte que la plateforme n'honore plus (`accountRefusal`) reçoit `403` avant même que son rôle soit lu, sans session c'est `401`, hors de l'équipe `403`, et sans en-tête `Upgrade: websocket` `400`. Aucun de ces refus n'ouvre de socket.

La classe `InboxRealtime` est exportée par `apps/web/src/worker.ts` — Cloudflare résout un binding d'objet durable sur l'entrée du Worker, comme les workflows — et sa logique vit dans `apps/web/src/realtime/inbox-realtime.ts`. Une seule instance, `idFromName("platform")`. Elle **ne stocke rien** : elle accepte la socket en hibernation (`state.acceptWebSocket`, `webSocketMessage`, `webSocketClose`) et diffuse. Un `ping` reçoit `pong`, rien d'autre.

`packages/api/src/lib/mail/realtime.ts` expose `publishInboxEvent(event)`, configurable comme le transport (`configureInboxRealtime`, no-op par défaut). En production, le Worker installe un éditeur qui `fetch` le stub sur son chemin interne `/publish`, derrière `INTERNAL_WORKFLOW_SECRET` ; le harnais de test enregistre les événements dans `useFakeMail().broadcast`. **Une diffusion qui casse ne casse jamais l'écriture** : la console retombe sur son sondage.

| Événement | Quand | Ce que la console refetche |
| --- | --- | --- |
| `thread.received` | l'ingestion a rangé un message, doublon reconnu compris | la liste, les compteurs, le fil nommé |
| `thread.updated` | un `PATCH /threads/:id`, une note | la liste, le fil nommé |
| `draft.changed` | un brouillon gardé ou jeté | la liste seule (`has_draft`) |
| `message.sent` | une réponse ou un nouveau message est parti | la liste, le fil nommé |
| `message.failed` | l'envoi a été refusé par le service d'envoi | la liste, le fil nommé |
| `counts.changed` | un lot qui change quelque chose, ou un changement de boîte | les compteurs, les boîtes |

Chaque événement porte `type`, et selon le cas `thread_id` et `mailbox_id`.

**Une lecture ne se diffuse pas.** Ouvrir un fil d'une boîte sensible écrit au journal mais n'émet aucune trame : elle ne change rien pour les autres, et une trame qui aurait fait refetcher le fil aurait refait la lecture qui l'a émise — la lecture aurait bouclé sur elle-même. Pour la même raison, **la console distribue l'invalidation par type d'événement** (colonne ci-dessus) au lieu de tout invalider, et une trame d'un type qu'elle ne connaît pas ne refetche rien.

Côté console, `useInboxRealtime()` est ouvert **une fois** par le layout de la boîte, se reconnecte avec un repli exponentiel plafonné à trente secondes, et invalide les requêtes que l'événement nomme. `INBOX_POLL_INTERVAL_MS` vaut 60 s et ne sert plus qu'à rattraper une socket morte : la console fonctionne sans socket, et c'est ce que fait le harnais e2e.

Une socket qui jette à l'envoi est fermée et écartée de la tournée : la diffusion continue vers les autres.

## Les routes

Sous `/api/v1/admin/inbox`. **Lire demande d'être membre de l'organisation Pupitre** (`requirePlatformAdmin`) ; **agir demande le rôle `admin` ou `owner`** dans cette organisation (`requirePlatformRole("admin")`). Deux exceptions gardées de l'ancien contrat : `unread` sur un fil, et `unread` dans un lot, restent ouverts à tout membre.

### Les boîtes

| Méthode | Route | Corps | Réponse |
| --- | --- | --- | --- |
| GET | `/mailboxes` | — | `{ data: Mailbox[] }`, `sortOrder` puis adresse |
| POST | `/mailboxes` | `{ address, display_name, signature?, sensitive?, can_reply? }` | `201 { data: Mailbox }`. `address` est la partie locale seule, ou l'adresse complète sur `MAIL_DOMAIN` ; autre chose vaut `422 validation`. `409 conflict` (`mailbox_taken`) si l'adresse a déjà une boîte. Les fils « Autres » sur cette adresse lui sont rattachés. Journal `mail.mailbox_created`. Rôle `admin` |
| PATCH | `/mailboxes/:id` | `{ display_name?, signature?, sensitive?, can_reply?, enabled?, sort_order? }` | `{ data: Mailbox }`. `404` sur une boîte inconnue. Journal `mail.mailbox_updated`. Rôle `admin` |
| DELETE | `/mailboxes/:id` | — | `204` quand la boîte ne porte aucun fil. `409 conflict` (`mailbox_in_use`, le `fix` dit de la désactiver) sinon ; `409 conflict` (`mailbox_protected`) sur l'une des quatre boîtes légales. Journal `mail.mailbox_deleted`. Rôle `admin` |
| GET | `/counts` | — | `{ data: { mailboxes: [{ id, unread, open }], others: { unread, open }, total_unread } }` |

### Les fils

| Méthode | Route | Corps | Réponse |
| --- | --- | --- | --- |
| GET | `/threads` | — | `{ data: Thread[], total, unread }`. Filtres en paramètres : `status=open\|closed`, `unread=true\|false`, `q`, `address`, `mailbox_id` (`others` pour les fils qu'aucune boîte ne déclare), `organization_id`, `automated=true`, `assigned=me\|none\|<userId>`, `sort=last_activity\|last_inbound_at\|created_at\|subject` (`last_activity` par défaut), `direction=asc\|desc` (`desc` par défaut), `limit` (50 par défaut, 200 au plus), `offset`. `q` cherche dans le sujet, l'adresse et le nom des expéditeurs, **le texte des messages** et l'identifiant du fil. **Les fils dont le dernier entrant est automatique sont exclus par défaut** ; `automated=true` ne rend qu'eux. `unread` compte les fils non lus qui passent les **autres** filtres : c'est le compteur d'en-tête, il ne suit pas la case « non lus » |
| GET | `/threads/:id` | — | `{ data: Thread & { mailbox, messages: Message[], notes: Note[], activities: Activity[], draft: Draft \| null } }`, messages du plus ancien au plus récent. **Ouvrir un fil ne le marque pas lu** : c'est la console qui le dit, par le PATCH. Sur une **boîte sensible**, l'ouverture écrit `mail.read` au journal et une activité `read`, **une fois par lecteur et par fenêtre de `MAIL_READ_AUDIT_WINDOW_MS`** (`@pupitre/shared/legal`, dix minutes) : le journal dit qui a lu quoi, pas combien de fois la console a refetché |
| PATCH | `/threads/:id` | `{ status?, unread?, assigned_user_id?, linked_organization_id? }` | `{ data: ThreadDetail }`. `unread` est ouvert à tout membre ; `status`, `assigned_user_id` et `linked_organization_id` demandent le rôle `admin`, sinon `403 forbidden`. L'attributaire doit être membre de l'organisation Pupitre, sinon `422 validation` ; une organisation inconnue vaut `422 validation` ; `null` délie. Activités `assigned`/`unassigned`/`closed`/`reopened`/`linked`/`unlinked`/`read`/`unread` |
| POST | `/threads/bulk` | `{ ids (1..100), status?, unread? }` | `{ data: { updated } }`. `status` demande le rôle `admin`, `unread` est ouvert à tout membre. Une activité par fil qui change vraiment ; un événement de journal par lot (`mail.bulk_closed`, `mail.bulk_read`) |
| GET | `/messages/:id/html` | — | le corps HTML stocké, en `text/html; charset=utf-8`, sous la CSP de *Le HTML d'un message* et `X-Content-Type-Options: nosniff`, les `src="cid:…"` réécrits. `404` quand le message n'a pas de HTML |
| GET | `/attachments/:id/url` | `?disposition=inline\|attachment` | `{ data: { url, expires_at, mime_type, filename, size } }`. Voir *Lire une pièce jointe*. `404 not_found` |

### Les notes, les brouillons, les réponses types

| Méthode | Route | Corps | Réponse |
| --- | --- | --- | --- |
| GET | `/threads/:id/notes` | — | `{ data: Note[] }`, de la plus ancienne à la plus récente |
| POST | `/threads/:id/notes` | `{ body (1..10 000) }` | `201 { data: Note }`. Activité `note_added`, journal `mail.note_added`. Rôle `admin` |
| DELETE | `/threads/:id/notes/:noteId` | — | `204`, `404` sur une note inconnue. Activité `note_deleted`, journal `mail.note_deleted`. Rôle `admin` : écrire une note le demande déjà, donc l'auteur d'une note est toujours un `admin` |
| GET | `/threads/:id/draft` | — | `{ data: Draft }`, `404 not_found` quand le fil n'en porte pas |
| PUT | `/threads/:id/draft` | `{ body (0..20 000), to?, cc?, attachments? }` | `{ data: Draft }`. Un brouillon par fil : l'écriture crée ou remplace. Événement `draft.changed`. Rôle `admin` |
| DELETE | `/threads/:id/draft` | — | `204`, `404` sans brouillon. Un envoi réussi l'efface de lui-même, et la console l'efface dès que le texte redevient vide. Événement `draft.changed`. Rôle `admin` |
| GET | `/templates` | `?mailbox_id=` | `{ data: Template[] }`. Avec `mailbox_id`, les réponses types de cette boîte **et** celles qui n'en nomment aucune |
| POST | `/templates` | `{ name (1..80), body (1..20 000), mailbox_id? }` | `201 { data: Template }`. Une boîte inconnue vaut `422 validation`. Journal `mail.template_created`. Rôle `admin` |
| PATCH | `/templates/:id` | `{ name?, body?, mailbox_id? }` | `{ data: Template }`, `404` sur une réponse type inconnue. Journal `mail.template_updated`. Rôle `admin` |
| DELETE | `/templates/:id` | — | `204`, `404`. Journal `mail.template_deleted`. Rôle `admin` |

Une réponse type est **un préremplissage de la console** : `template_id` n'est jamais envoyé au serveur, c'est le texte inséré qui part.

### Ce qui sort

| Méthode | Route | Corps | Réponse |
| --- | --- | --- | --- |
| POST | `/uploads` | `{ filename (1..255), mime_type, size (1..5 Mio) }` | `201 { data: { key, url, expires_at } }`. `422 validation` sur une extension bloquée. Rôle `admin` |
| POST | `/threads/:id/reply` | `{ text (1..20 000), to?, cc?, attachments? }` | `201 { data: Message }`. Le fil passe `unread = false`, `lastOutboundAt` prend l'heure, le brouillon est effacé. `422 validation` (`mail_thread_no_mailbox`) sur un fil « Autres », `409 conflict` (`mailbox_cannot_reply`) sur une boîte qui n'émet pas, `409 conflict` si le fil ne porte aucune adresse à qui répondre, `422 validation` sur une pièce jointe refusée, `502` si l'envoi casse. Activité `replied` ou `reply_failed` |
| POST | `/compose` | `{ mailbox_id, to[1..10], subject, text, attachments? }` | `201 { data: ThreadDetail }`. Une boîte inconnue vaut `422 validation`, une boîte qui n'émet pas `409 conflict` ; mêmes règles de pièces jointes. Activité `composed` |

`GET /addresses` **n'existe plus** : `GET /mailboxes` le remplace, et la console choisit parmi les boîtes qui émettent.

### Le HTML d'un message

**Il n'y a pas d'assainisseur, et c'est délibéré.** Il y en a eu un : une passe de quatre expressions régulières. Elle ne tenait pas. `<scri<script>pt>` reconstituait la balise que la passe venait de retirer, `<img/onerror=…>` passait faute d'espace avant l'attribut, `jav&#97;script:` et `java\tscript:` passaient faute de décodage. Un demi-verrou se lit comme un verrou : on l'a retiré plutôt que de le laisser rassurer.

Ce qui tient, à sa place :

1. **La CSP.** `default-src 'none'; img-src data:; style-src 'unsafe-inline'; font-src data:; frame-ancestors 'self'`. `script-src` retombe sur `default-src 'none'` : aucun script en ligne, aucun gestionnaire `on*`, aucune URL `javascript:` ne s'exécute, quelle que soit la tête de la balise. **`img-src` s'arrête à `data:`** : un pixel de suivi dans un message écrit à `security@` ne dit à son expéditeur ni l'heure de la lecture, ni l'adresse d'où elle vient. Une image en pièce jointe s'ouvre depuis le bandeau, au-dessus du corps.
2. **Le cadre de la console.** Le corps est affiché dans une `iframe` au `sandbox` vide (`apps/web/src/components/admin/inbox/inbox-message-html.tsx`) : pas de script, pas de formulaire, pas de navigation, origine opaque.
3. **`nosniff`**, pour que le type servi soit celui qu'on annonce.

Le corps part donc **tel qu'il est arrivé**, à une réécriture près : les `src="cid:…"` deviennent les adresses signées de leurs pièces jointes, et rien d'autre n'est touché.

### Les formes

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
  subject, text, has_html, automated, delivery, error,
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

`messages` et `notes` comptent dans la liste et **portent** dans le détail : la liste dit combien, le fil ouvert dit lesquels.

`from` est le dernier expéditeur entrant ; sur un fil né d'un message écrit par l'équipe, c'est le destinataire de ce message, pour que la ligne ne soit pas vide.

`action` d'une activité vaut l'un de `received`, `read`, `unread`, `replied`, `reply_failed`, `composed`, `assigned`, `unassigned`, `closed`, `reopened`, `linked`, `unlinked`, `note_added`, `note_deleted`.

### Les codes d'erreur

Ceux de `@pupitre/shared/api/errors`, sans ajout. Un envoi qui casse répond `502` avec le code `internal` : c'est la plateforme qui a échoué, pas l'appelant, et le `fix` dit que le message est gardé en échec dans le fil. Une pièce jointe refusée répond `422 validation`, et le message dit laquelle et pourquoi (`mail_attachment_blocked`, `mail_attachments_too_large`, `mail_upload_missing`, `mail_upload_foreign`, `mail_upload_size_mismatch` dans `lib/i18n`), le `fix` ce qu'il reste à faire. Les refus propres aux boîtes ont leurs clés : `mailbox_not_found`, `mailbox_address_refused`, `mailbox_taken`, `mailbox_in_use`, `mailbox_protected`, `mailbox_cannot_reply`, `mail_thread_no_mailbox`, `mail_organization_unknown`, `mail_note_not_found`, `mail_draft_not_found`, `mail_template_not_found`, `mail_template_mailbox_unknown`.

## Le journal

Sur la cible `mail_thread` : `mail.closed`, `mail.reopened`, `mail.assigned`, `mail.replied`, `mail.composed`, `mail.read`, `mail.attachment_read`, `mail.linked`, `mail.note_added`, `mail.note_deleted`, `mail.bulk_closed`, `mail.bulk_read`.

Sur la cible `mail_mailbox` : `mail.mailbox_created`, `mail.mailbox_updated`, `mail.mailbox_deleted`.

Sur la cible `mail_template` : `mail.template_created`, `mail.template_updated`, `mail.template_deleted`.

Sans organisation, sauf `mail.linked`, qui porte celle qu'on vient de lier : la boîte est celle de la plateforme, pas celle d'un client.

## Ce qui n'est pas construit

- **Pas de purge des fils.** Seuls les dépôts en attente s'effacent (voir *La purge des dépôts*) ; rien n'efface un fil ni ses objets. Le jour où ça manquera, ce sera une décision, pas un effet de bord.
- **Pas de brouillon par personne.** Un fil porte un brouillon, celui de l'équipe ; le dernier qui écrit remplace le précédent, et la ligne dit qui.
- **Pas de pièce jointe dans un brouillon déjà déposée.** Le brouillon garde les clés que la console lui donne ; les fichiers choisis ne partent au seau qu'à l'envoi.
- **Pas de renvoi automatique d'un message en échec.** Un nouvel essai est un nouveau message, écrit à la main.
