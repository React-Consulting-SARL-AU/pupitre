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

**Un envoi automatique est rangé sans allumer le fil.** Un `List-Unsubscribe`, un `Auto-Submitted` autre que `no`, un `Precedence: bulk | list | junk`, ou un expéditeur `mailer-daemon@` ou `postmaster@` : le fil garde son état, ni non lu ni rouvert. Le message porte `automated = true` (`MailMessage.automated`, `false` par défaut) et le rend dans sa forme : le caractère automatique se relit, parce que la réponse doit pouvoir sauter ces messages-là des mois plus tard.

## Rattachement à un fil

Dans cet ordre, le premier qui répond gagne :

1. **Les références.** `In-Reply-To` et `References` nomment des identifiants ; si l'un d'eux est déjà en base, le message rejoint son fil, quel que soit son sujet.
2. **Le sujet et le correspondant.** Même adresse de destination, même sujet **normalisé**, fil touché dans les **trente jours**, et un message du fil qui porte cette personne en expéditeur ou en destinataire. Un homonyme de sujet venu d'ailleurs n'entre pas. Au plus **dix** fils candidats sont examinés, les plus récemment touchés d'abord : au-delà, ce n'est plus un fil, c'est un sujet générique.
3. **Sinon, un fil neuf.**

Le sujet normalisé est le sujet débarrassé de ses préfixes empilés (`Re:`, `RE :`, `Re[2]:`, `Fw:`, `Fwd:`, `TR:`, `Réf:`), espaces écrasés, en minuscules.

À l'arrivée d'un message lisible non automatique, le fil passe `unread = true`, `status = open`, et `lastInboundAt` prend l'heure. `contactUserId` nomme le compte dont l'adresse est celle de l'expéditeur, quand il y en a un.

## Doublons

Deux verrous, dans cet ordre :

1. **L'empreinte SHA-256 des octets bruts** (`rawHash`, unique). Un renvoi de Cloudflare retombe dessus.
2. **Le `Message-ID`** (unique), **sur la même adresse de destination**. Un même message arrivé par deux chemins retombe dessus ; un `Message-ID` recopié par un tiers dans un message écrit à une autre de nos adresses n'efface pas ce message-là.

Les deux sont vérifiés avant l'écriture, et la contrainte unique rattrape la course : `ingestInboundEmail` rend alors `{ status: "duplicate" }` avec l'identifiant de la ligne déjà écrite, sans rien réécrire.

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

**Les seules adresses d'expédition sont les quatre de `MAIL_SENDER_ADDRESSES`** (`@pupitre/shared/legal`) : `support@`, `legal@`, `privacy@`, `security@`. Elles sont vérifiées dans Email Sending ; une autre ne partirait pas.

Une réponse reprend l'adresse du fil quand elle est l'une des quatre, `support@` sinon. `In-Reply-To` nomme le message répondu, `References` ajoute son identifiant à sa propre chaîne. Le sujet est `Re: <sujet du fil>`, sans empiler un second `Re:`. Tout en-tête construit — `Subject`, `Message-ID`, `In-Reply-To`, `References` — passe par l'encodage RFC 2047, qui écrase les retours à la ligne : un `References` reçu d'un tiers ne peut pas ajouter un `Bcc:` à ce qui part.

### À qui elle va

**Le message répondu est le dernier entrant non automatique.** Un rebond, une liste de diffusion, un accusé automatique sont sautés — on ne répond pas à `mailer-daemon@`. Sans aucun entrant humain, la réponse reprend les destinataires de **notre propre dernier message** ; sans l'un ni l'autre, elle est refusée.

**Aucune adresse `@pupitre.studio` n'est destinataire**, ni en `to` ni en copie. Le filtre vaut des deux côtés, et c'est ce qui compte : un expéditeur qui se déclare `From: support@pupitre.studio` ne transforme pas la réponse en boucle sur nous-mêmes. Quand il ne reste plus personne après le filtre, la route répond `409 conflict` (`MailThreadHasNoRecipientError`) plutôt que d'écrire à la boîte elle-même.

Les copies du message répondu sont reprises, moins les nôtres et moins celles déjà en `to`.

**Un envoi qui casse ne disparaît pas.** Le message est enregistré `delivery: failed` avec la cause dans `error`, et la route répond `502`. Le fil garde sa trace, et un nouvel essai est un nouveau message : rien ne part deux fois sans qu'on le voie.

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

### Les images en ligne

Un message HTML qui porte `<img src="cid:…">` désigne une partie du même message par son `Content-ID`. `GET /messages/:id/html` réécrit chaque `src="cid:<id>"` — guillemets doubles, simples ou nus — vers l'adresse `inline` signée de la pièce jointe qui porte ce `contentId`, pour que l'image s'affiche sous `img-src https:`. Un `cid` qui ne correspond à rien reste tel quel. Le HTML servi n'est réécrit qu'à cet endroit ; tout le reste part comme il est arrivé.

### La purge des dépôts

`purgeStaleMailUploads` (`lib/mail/uploads.ts`) liste `mail/uploads/` par le binding et efface ce qui a plus de vingt-quatre heures, d'après la date de dépôt de l'objet. Elle tourne en dernière étape du workflow quotidien `SuspendExpiredGrace`, après `reconcile-launch` et `suspend-expired-grace`. Rien d'autre n'est purgé : un fil et ses objets restent.

## Les routes

Sous `/api/v1/admin/inbox`. **Lire demande d'être membre de l'organisation Pupitre** (`requirePlatformAdmin`) ; **agir demande le rôle `admin` ou `owner`** dans cette organisation (`requirePlatformRole("admin")`).

| Méthode | Route | Corps | Réponse |
| --- | --- | --- | --- |
| GET | `/threads` | — | `{ data: Thread[], total, unread }`. Filtres en paramètres : `status=open\|closed`, `unread=true\|false`, `q`, `address`, `assigned=me\|none\|<userId>`, `limit` (50 par défaut, 200 au plus), `offset`. `q` cherche dans le sujet, l'adresse et le nom des expéditeurs. Les fils sortent du plus récemment touché au plus ancien. `unread` compte les fils non lus qui passent les **autres** filtres : c'est le compteur d'en-tête, il ne suit pas la case « non lus » |
| GET | `/threads/:id` | — | `{ data: Thread & { messages: Message[] } }`, du plus ancien au plus récent. **Ouvrir un fil ne le marque pas lu** : c'est la console qui le dit, par le PATCH |
| GET | `/messages/:id/html` | — | le corps HTML stocké, en `text/html; charset=utf-8`, sous `Content-Security-Policy: default-src 'none'; img-src data: https:; style-src 'unsafe-inline'; frame-ancestors 'self'` et `X-Content-Type-Options: nosniff`, les `src="cid:…"` réécrits vers l'adresse signée de la pièce jointe (voir *Les images en ligne*), rien d'autre touché. Voir *Le HTML d'un message*. `404` quand le message n'a pas de HTML |
| GET | `/attachments/:id/url` | `?disposition=inline\|attachment` (`attachment` par défaut) | `{ data: { url, expires_at, mime_type, filename, size } }` : une adresse `GET` signée de dix minutes sur le seau, la disposition et le type signés dedans. Voir *Lire une pièce jointe*. `404 not_found` |
| PATCH | `/threads/:id` | `{ status?, unread?, assigned_user_id? }` | `{ data: Thread & { messages } }`. `unread` est ouvert à tout membre ; `status` et `assigned_user_id` demandent le rôle `admin`, sinon `403 forbidden`. L'attributaire doit être membre de l'organisation Pupitre, sinon `422 validation` |
| POST | `/uploads` | `{ filename (1..255), mime_type, size (1..5 Mio) }` | `201 { data: { key, url, expires_at } }` : une adresse `PUT` signée de dix minutes où la console dépose les octets elle-même. `422 validation` sur une extension bloquée. Rôle `admin` |
| POST | `/threads/:id/reply` | `{ text (1..20 000), attachments?: [{ key, filename, mime_type, size }] }` | `201 { data: Message }`. Le fil passe `unread = false` et `lastOutboundAt` prend l'heure. `409 conflict` si le fil ne porte aucune adresse à qui répondre, `422 validation` sur une pièce jointe refusée (voir *Les pièces jointes sortantes*), `502` si l'envoi casse |
| POST | `/compose` | `{ from, to[1..10], subject, text, attachments? }` | `201 { data: Thread & { messages } }`. `from` est l'une des quatre adresses, sinon `422` ; mêmes règles de pièces jointes |
| GET | `/addresses` | — | `{ data: string[] }`, les quatre adresses, pour le formulaire d'écriture |

### Le HTML d'un message

**Il n'y a pas d'assainisseur, et c'est délibéré.** Il y en a eu un : une passe de quatre expressions régulières. Elle ne tenait pas. `<scri<script>pt>` reconstituait la balise que la passe venait de retirer, `<img/onerror=…>` passait faute d'espace avant l'attribut, `jav&#97;script:` et `java\tscript:` passaient faute de décodage. Un demi-verrou se lit comme un verrou : on l'a retiré plutôt que de le laisser rassurer.

Ce qui tient, à sa place, et qui tenait déjà seul :

1. **La CSP.** `script-src` retombe sur `default-src 'none'` : aucun script en ligne, aucun gestionnaire `on*`, aucune URL `javascript:` ne s'exécute, quelle que soit la tête de la balise. Rien ne se charge non plus hors `img-src`.
2. **Le cadre de la console.** Le corps est affiché dans une `iframe` au `sandbox` vide (`apps/web/src/components/admin/inbox/inbox-message-html.tsx`) : pas de script, pas de formulaire, pas de navigation, origine opaque.
3. **`nosniff`**, pour que le type servi soit celui qu'on annonce.

Le corps part donc **tel qu'il est arrivé**, à une réécriture près : les `src="cid:…"` deviennent les adresses signées de leurs pièces jointes (voir *Les images en ligne*), et rien d'autre n'est touché. Le jour où il faudrait vraiment le nettoyer — un rendu hors cadre, un client qui ignore la CSP — ce sera un analyseur HTML réel, jamais une passe d'expressions régulières.

### Les formes

```ts
Thread = {
  id, address, subject, status, unread,
  assigned_user: { id, name, email } | null,
  contact: { user_id, email, name } | null,
  from: { email, name: string | null },
  snippet: string | null,
  messages: number,
  last_inbound_at, last_outbound_at, updated_at, created_at,
}

Message = {
  id, direction,
  from: { email, name }, to: string[], cc: string[],
  subject, text, has_html, automated, delivery, error,
  sent_by: { id, name } | null,
  received_at, sent_at,
  attachments: [{ id, filename, mime_type, size }],
}
```

`messages` compte les messages dans la liste et **les porte** dans le détail : la liste dit combien, le fil ouvert dit lesquels.

`from` est le dernier expéditeur entrant ; sur un fil né d'un message écrit par l'équipe, c'est le destinataire de ce message, pour que la ligne ne soit pas vide.

### Les codes d'erreur

Ceux de `@pupitre/shared/api/errors`, sans ajout. Un envoi qui casse répond `502` avec le code `internal` : c'est la plateforme qui a échoué, pas l'appelant, et le `fix` dit que le message est gardé en échec dans le fil. Une pièce jointe refusée répond `422 validation`, et le message dit laquelle et pourquoi (`mail_attachment_blocked`, `mail_attachments_too_large`, `mail_upload_missing`, `mail_upload_foreign`, `mail_upload_size_mismatch` dans `lib/i18n`), le `fix` ce qu'il reste à faire.

## Le journal

`mail.closed`, `mail.reopened`, `mail.assigned`, `mail.replied`, `mail.composed`, sur la cible `mail_thread`. Sans organisation : la boîte est celle de la plateforme, pas celle d'un client.

## Ce qui n'est pas construit

- **Pas de notes internes.** Un fil ne porte que ce qui est parti et ce qui est arrivé.
- **Pas de brouillons.** Une réponse part quand on l'envoie, ou elle est perdue.
- **Pas de journal d'activité par fil.** Les fermetures et les attributions sont dans le journal de la plateforme, pas dans le fil.
- **Pas de purge des fils.** Seuls les dépôts en attente s'effacent (voir *La purge des dépôts*) ; rien n'efface un fil ni ses objets. Le jour où ça manquera, ce sera une décision, pas un effet de bord.
