# 0017 — Published addresses go through a gate, and a project is protected by default

Date: 2026-09-27 · Status: accepted

Until now, an address published through the tunnel or Caddy answered anyone who knew it. From now on, every published name goes through **`pupitre-gate`**, a `pupitred` proxy listening on `127.0.0.1:8098`. cloudflared and Caddy send it all names without touching the `Host`.

**Protection**
- A project is **protected by default**, including those that existed before (registry migration 7).
- A process can deviate from this, in either direction. This is the case for a webhook receiver that verifies its own signature.
- A public name is forwarded as is.

**Keys**
- A protected name answers only to a `ppk_<id>_<secret>` key, presented in three ways:
  - in the `Pupitre-Key` header;
  - in the `pupitre_key` parameter, where a header cannot be set (WebSocket, EventSource);
  - through the `__Host-pupitre` cookie that a link or the login page sets.
- The gate strips these three marks before forwarding the request. The site keeps its own `Authorization`, cookies and query, and receives the key's name in `Pupitre-Identity`.
- A navigation keeps its path and query: the key is removed from the address by a 303 redirect, and the login page returns to the requested address.

**Where the keys live**
- The app generates the key on the customer's computer and keeps it in the keychain. The server receives only its SHA-256 fingerprint, in `/etc/pupitre/gate/access.json`.
- A key opens the whole server, including projects added later, or a list of projects.
- It does not expire. Several people can share it, and revoking it cuts everyone off at the next request.
- Each computer generates its own key the first time it opens a protected address, and then adds it to each address it opens.

**Gate isolation**
- It runs as root **with no capability at all**, on a read-only system, and sees only `gate/` of `/etc/pupitre`.
- It rereads its two files on `SIGHUP`: a revoked key or a changed protection takes effect without cutting the WebSockets in progress.

**Privileges**
- The `access.*` commands require the privileged session.
- A `project.add` or `project.update` that opens a project or a process to the web (`protected: false`) requires it too. An AI agent running as `dev` therefore cannot lift the protection by itself.

Why:
- A tunnel exposed each project's work in progress to anyone who found the address.
- The protection had to work for all customers without configuring anything elsewhere, with Caddy as well as with the tunnel.
- It had to work for a browser as well as for an API client or a simulator, without colliding with the site's own authentication.

Ruled out:
- **Cloudflare Access**:
  - nothing for Caddy;
  - a Zero Trust organization to open at each customer;
  - extra token permissions;
  - no WebSocket from a browser without a cookie;
  - blocked CORS preflights.
- **A login through the Pupitre account**: it would put the platform on the path of every request, against the seven-days-offline rule.
- **Key expiry**: revocation is enough, and a key that expires silently breaks an API client.
- **Routing only protected names through the gate**: each protection change would rewrite the ingress and restart cloudflared. Routing everything through the gate keeps the ingress stable, and a protection is changed by a simple reload.
