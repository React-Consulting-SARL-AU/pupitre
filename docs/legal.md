# Legal

What the repository says about the publisher, where it says it, and what remains to be filled in. A single source: [`packages/shared/src/legal/index.ts`](../packages/shared/src/legal/index.ts). The site, the console and the desktop app read it; none of them rewrites a name, an address or a contact email address.

## Current state

Since 1 October 2026 ([decision 0018](./decisions/0018-source-available-and-free.md)), Pupitre is published by **React Consulting SARL AU**, a Moroccan company represented by its manager, Jordan Monier, who is also the publication director. The company holds the code, the brand, the domain names and the platform, publishes the source code under the Apache 2.0 licence with the Commons Clause ([`LICENSE`](../LICENSE), [`NOTICE`](../NOTICE)), and pays for the platform's hosting. The service is free up to three servers per organization; beyond that, a licence is granted on request, with no payment.

What the shared source fixes:

- `LEGAL_ENTITY.status` is `incorporated`, `legalName` "React Consulting SARL AU", `form` "SARL AU", `jurisdiction` Morocco — the law that governs the terms and the competent courts —, `owner` and `publicationDirector` "Jordan Monier". `copyrightHolder()` returns the company name. Its identifiers are those published by the legal notice of `react-consulting.ma`: `registrationNumber` (RC 144445, Marrakech commercial court), `taxId` (IF), `ice` (ICE), `professionalTax` (professional tax) and `registeredAddress` (head office, Marrakech); Pupitre's legal notice reads them from `LEGAL_ENTITY`, never written by hand.
- `CODE_SIGNING_ENTITY` names the same company, whose certificates sign the app's macOS and Windows builds.
- `LEGAL_DOCUMENTS` carries the twelve documents, their order and their date. They are published, with no draft or passage to complete.
- `SUB_PROCESSORS` names only those that touch personal data: Cloudflare (hosting, database and files in eastern North America, emails, the site's audience measurement through Web Analytics) and Stripe, listed for the day licences would be sold, to which nothing is sent today. Cloudflare is the only provider that receives personal data. GitHub and Google receive something only when a person chooses to sign in through them, and are not listed.
- `DATA_CONSENT_VERSION` dates the text of the consent the console asks for at account creation: the person's data is stored and processed by Cloudflare in the United States. Changing what that screen says changes the version, and every account that agreed to an older one is asked again.
- The copyright line of the site, the console and the account menu reads "© 2026 React Consulting SARL AU".

## The documents

| Slug | Document | What it covers |
| --- | --- | --- |
| `terms` | Terms of use | the contract: the service, what the platform receives from the machines and what it can do on them, what is free, the public source code, liability, applicable law |
| `licence` | Licence | the code's licence (Apache 2.0 + Commons Clause, pointing to the repository's `LICENSE`), what it allows and forbids, the name and the logo, the right to use the hosted platform, who signs the app |
| `acceptable-use` | Acceptable use | what is forbidden on a managed machine, reports of abuse and of infringement of others' rights, sanctions |
| `privacy` | Privacy | what is collected, on what basis, where, for how long, the rights and the supervisory authorities |
| `data-processing` | Data processing | the processing agreement with each organization, the standard contractual clauses |
| `billing` | Free servers and licences | free up to three servers, a licence granted on request beyond, no payment today. The slug stays `billing`: it lives in `LEGAL_DOCUMENT_SLUGS` and published links lead to it |
| `cookies` | Cookies | each cookie and each local storage value of the site and the console; the audience measurement writes none |
| `sub-processors` | Sub-processors | the dated list, rendered by `<SubProcessors />`, and what is not on it |
| `security` | Security | responsible disclosure: where to write, the scope, the rules, the commitment not to sue, our deadlines |
| `third-party` | Third-party software | the free components of the app and the agent, and their licences |
| `legal-notice` | Legal notice | the publisher, the publication director, the host, the signing company, the brand and the code |
| `changes` | History | what changed, document by document, with the date |

A substantive change to a document changes its date in `LEGAL_DOCUMENTS` and in its frontmatter, and adds an entry to the history, in both languages. The site's footer links to the terms, privacy, cookies, the legal notice and the index; the index is built from the collection. The number of free servers is never written by hand in a page: it imports `FREE_SERVERS` from `@pupitre/shared/plans`.

## What the documents promise, and the code must hold

- **Free up to three servers.** No payment, no card, no time limit on an organization's first `FREE_SERVERS` servers. If paid licences were offered one day, it would be announced thirty days in advance by email, described in `billing` before being sold, and nothing would be charged without an explicit gesture from the customer. As long as this is true, `BILLING_MODE` is `off`.
- **The licence beyond.** Granted by the team (`granted` product), with no payment. A licence that ends while the organization holds more than its free servers opens seven days of grace, then restricted mode; nothing is erased.
- **The code's licence.** Apache 2.0 + Commons Clause: use, modify, self-host, redistribute with the notices; no resale of Pupitre or of a service that draws its essential value from it; neither the name nor the logo is granted. The binding text is `LICENSE`; the `licence` page summarizes it and points to it through `SOURCE_LICENSE_URL` (`apps/site/src/lib/urls.ts`).
- **What the platform receives and can do.** The terms list exactly what the agent sends (enrolment, heartbeat) and the platform's three levers (licence, authorized-keys block, target version). Every new heartbeat field, every new power of `/agent/state`, must first be written into the terms and the privacy policy, in both languages.
- **Backups.** The platform receives only one reference per backup — the fields of `BackupDeclaration`, listed in the terms — and the `BackupBeat` beat. The S3 key stays in the app's keychain and in the server's `install.json`; the backups' private key goes only to the customer's server, in memory, for the duration of a restore. Every new field of the declaration or the beat is first written into the terms and the privacy policy.
- **Affiliate links.** Tracking only: the code is read at sign-up, the platform counts visits, sign-ups and servers enrolled by the organizations brought in. No offer, no reward attaches to it; adding one first changes the privacy policy.
- **Where the data goes, and the consent to it.** The privacy policy says in plain words that every account, organisation, machine metadata, heartbeat, email and log is stored and processed by Cloudflare, a United States company, the database and the files in eastern North America; that this is a transfer outside Morocco and outside the European Union (law 09-08, and the GDPR where it applies); that it rests on the person's explicit consent, announced on the sign-in page before the email is typed, asked by the console on the first entry — before anything can be used — recorded with its date and `DATA_CONSENT_VERSION`, asked again when that version changes, and withdrawn by deleting the account. Declining deletes the account that sign-in just created. The documents claim no CNDP declaration or authorisation: none is to be written in until one is actually filed and numbered.
- **Audience measurement.** The site and the console count their page views with Cloudflare Web Analytics: no cookie, no storage, no identifier, the IP address discarded by Cloudflare at the edge, hence no consent banner. The beacon loads only in production. The desktop app sends nothing today; the day the console or the app measures actions, the privacy policy is updated with its date, on the same terms: event names, never content, never anything from the machines, never an identifier without consent. Any measurement that writes to the browser or identifies a visitor needs a consent banner again, written into the cookie policy first.
- **Cookies.** The cookie policy names each cookie and each storage key of the site and the console. One more cookie or key is written there before being set.
- **Responsible disclosure.** Acknowledgement within five business days, an agreed publication date within ninety days, no legal action against compliant research. `/.well-known/security.txt` is generated at build time from `LEGAL_CONTACTS.security` and expires one hundred and eighty days later: every site deployment renews it.
- **Deadlines.** Sessions of sixty days, machine metrics over a rolling seven days, deletion scheduled at seven days (`DELETION_GRACE_DAYS`), immediate deletion from the console, response to requests within thirty days, breach notified within seventy-two hours.

## What the shared source contains

| Export | What it carries |
| --- | --- |
| `LEGAL_ENTITY`, `isIncorporated()`, `copyrightHolder()` | the publisher, its status, its jurisdiction, and the name to display in the copyright |
| `CODE_SIGNING_ENTITY` | the company that signs the app's builds |
| `LEGAL_CONTACTS` | `support`, `legal`, `privacy`, `security` |
| `PUPITRE_ORIGINS` | the origins: the site, the platform, the downloads |
| `LEGAL_DOCUMENTS` | the twelve documents, their order, their date |
| `SUB_PROCESSORS` | the sub-processors, their role and their region, in fr and en |
| `DATA_CONSENT_VERSION` | the version of the consent text asked at account creation |

The site's legal pages render the sub-processors through `<SubProcessors />`, never through a hand-written table: the list changes in a single place. The legal notice's host — Cloudflare, its address and its phone number — is still written by hand in the page, for lack of a shared export.

The tests in `apps/site/src/content/legal.test.ts` verify that each document exists in both languages with the registry's order and date; that the terms, the licence, the privacy policy and the data processing document name `copyrightHolder()`; that the licence names Apache and the Commons Clause and points to the repository's `LICENSE`; that no document promises a launch, a trial or a seat kept for good any more; that the legal notice names the publisher, the publication director, the signing company and the four contacts; and that each link from one document to another targets a registry slug in its own language.

## The publication guard

`apps/site/scripts/legal.ts` runs at the start of the Astro build and reads each page of `src/content/legal/`: a `TODO`, a `draft: true` in the frontmatter or a bracketed passage fails the production build and `check:content`, and only emits a warning locally. A production build is `PUPITRE_ENV=production`, which `build:production` sets.

## What remains to do

1. Add React Consulting SARL AU's share capital to the legal notice, when the owner provides it.
2. The day licences are sold: describe the offer in `billing` and the privacy policy, announce thirty days ahead, then switch `BILLING_MODE` to `stripe`.
