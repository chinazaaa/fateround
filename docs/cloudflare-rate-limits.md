# Cloudflare rate-limiting rules (W4)

The primary, tunable defense against create/join floods lives at the edge. The
app-level limiter (`src/lib/rate-limit.ts`) is only a coarse fail-open backstop —
these Cloudflare rules do the real work and can be adjusted without a deploy.

Set these under **Cloudflare dashboard → your domain → Security → WAF → Rate
limiting rules → Create rule**. Counting is **per client IP** (the default
characteristic), so prefer **Managed Challenge** over Block: a legitimate venue or
classroom behind one NAT that briefly exceeds a limit just solves a challenge
instead of being locked out.

---

## Rule 1 — Game create + join (the important one)

**Field → "Custom filter expression". Paste this expression:**

```
http.request.method eq "POST" and (
  http.request.uri.path eq "/api/games" or
  http.request.uri.path eq "/api/players" or
  (starts_with(http.request.uri.path, "/api/rooms/") and ends_with(http.request.uri.path, "/join"))
)
```

| Setting | Value |
| --- | --- |
| When rate exceeds | **100 requests** |
| Per | **1 minute** |
| With the same characteristics | **IP** (default) |
| Then take action | **Managed Challenge** *(switch to Block only if abuse persists)* |
| Duration (mitigation timeout) | **1 minute** |

Why 100/min: a full 40-player game joining behind one NAT is ~40 requests; 100
leaves headroom for reconnects and two overlapping games while still tripping a
scripted flood. Tighten toward 60 if you never expect large shared-IP venues.

---

## Rule 2 — Catch-all API flood guard (optional, recommended)

A looser guard over every API write so an attacker can't pivot to another
endpoint. Paste:

```
http.request.method eq "POST" and starts_with(http.request.uri.path, "/api/")
```

| Setting | Value |
| --- | --- |
| When rate exceeds | **300 requests** |
| Per | **1 minute** |
| With the same characteristics | **IP** (default) |
| Then take action | **Managed Challenge** |
| Duration | **1 minute** |

---

## Plan notes

- **Free plan**: you get **one** rate-limiting rule with 10s/1m periods and Block
  only. Use **Rule 1** with action **Block**, duration 1 minute. Skip Rule 2.
- **Pro / Business / Enterprise**: both rules, Managed Challenge available,
  longer periods and more rules. Recommended.
- `starts_with` / `ends_with` are available on all plans, so the room-join match
  above needs no regex (which is gated to Business+).

## Tuning

Watch **Security → Events** filtered to these rules for the first week. If you see
legitimate players challenged, raise the threshold or lengthen the period; if you
see abuse slip through, lower it or switch Managed Challenge → Block. The
app-level backstop (40 creates / 200 joins per IP per 5 min) stays in place
regardless and needs no dashboard change.
