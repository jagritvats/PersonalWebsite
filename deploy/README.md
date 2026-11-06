# jagritvats.com deploy

The site runs as an nginx container on the Oracle ARM (arm64) VM, behind the
shared Traefik edge owned by the Synpse stack. Same shape as TeamTakes.

## Shape

- `.github/workflows/deploy.yml` is the only deploy pipeline. On every push to
  `main` (or "Run workflow") it builds `deploy/Dockerfile` on a native arm64
  runner, pushes `ghcr.io/jagritvats/personalwebsite:<sha>` and `:main`, then
  SSHes to the VM, rsyncs `deploy/`, and runs `bash deploy/web.sh deploy`.
- `deploy/Dockerfile` is two stages: `node:22-alpine` runs `npm ci && npm run build`
  (Eleventy), then `nginx:1.27-alpine` serves only the resulting `_site/`.
- It only runs when the repo variable `DEPLOY_ENABLED` is `true` (kill switch).
- `deploy/docker-compose.yml` runs one service, `site`, with no host ports. It
  joins the `synapse-edge` network and Traefik routes `jagritvats.com` to it;
  `www.jagritvats.com` gets a permanent redirect to the apex.

## One-time setup

**1. Cloudflare.** Add the `jagritvats.com` zone, then in DNS:

| Name | Type | Content | Proxy |
|---|---|---|---|
| `jagritvats.com` | A | `<VM IP>` | proxied |
| `www` | A | `<VM IP>` | proxied |

Set SSL/TLS to **Full (strict)**. Delete any records left over from Netlify or
other hosts: Cloudflare spreads requests across all records on a name, and
prefers `AAAA`, so one stale record breaks the site.

**2. Origin certificate (Synpse side).** Cloudflare → SSL/TLS → Origin Server →
Create Certificate for `jagritvats.com` and `*.jagritvats.com`. On the VM save
it into the Synpse `deploy/certs/` as `jagritvats.pem` / `jagritvats.key`, then
append to Synpse `deploy/tls.yml` under `tls.certificates`:

```yaml
    # jagritvats.com - Cloudflare Origin Certificate (covers jagritvats.com + *.jagritvats.com)
    - certFile: /certs/jagritvats.pem
      keyFile:  /certs/jagritvats.key
```

and redeploy Traefik (`bash deploy/docker-compose.sh deploy` in Synpse). Leave
the existing entries and default store alone; Traefik picks certs by SNI.

**3. VM directory.**

```bash
sudo mkdir -p /opt/jagritvats && sudo chown "$USER":"$USER" /opt/jagritvats
```

The deploy user needs Docker access (`sudo usermod -aG docker ubuntu`).

**4. GitHub repo settings** (Settings → Secrets and variables → Actions):

```text
Variables:  DEPLOY_ENABLED=true
            DEPLOY_PATH            # optional, defaults to /opt/jagritvats
Secrets:    DEPLOY_HOST, DEPLOY_USER, DEPLOY_SSH_KEY, DEPLOY_KNOWN_HOSTS
            DEPLOY_PORT            # optional, defaults to 22
            GHCR_TOKEN_READ        # optional; the run's GITHUB_TOKEN is used otherwise
```

These are the same VM values TeamTakes uses. Also switch GitHub Pages off
(Settings → Pages) and disconnect the Netlify site, so this is the only deploy.

## On the VM

```bash
cd /opt/jagritvats
bash deploy/web.sh status   # container state
bash deploy/web.sh logs     # nginx logs
bash deploy/web.sh health   # in-container /healthz
```

Roll back by redeploying an older image:
`SITE_IMAGE=ghcr.io/jagritvats/personalwebsite:<old sha> bash deploy/web.sh deploy`.

Check the origin without Cloudflare:
`curl -sk --resolve jagritvats.com:443:<VM IP> https://jagritvats.com/healthz`.
A 200 here but a public failure means the problem is Cloudflare DNS, not the VM.

## Gotchas

- Traefik host rules with several hosts need `||`:
  ``Host(`a`) || Host(`b`)``. The comma form parses but never matches (bare 404).
- After changing a rule in `.env.compose`, recreate the container:
  `bash deploy/web.sh deploy`.
