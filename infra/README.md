# fateround — AWS Infrastructure (Terraform)

A **lean** Terraform stack that runs the `fateround` Next.js 16 app as a Docker
container on a **single EC2 instance**, in your own AWS account and region (for
control and data residency).

Supabase remains the managed backend. **This stack does not create a database** —
it only stands up the compute, networking, image registry, config storage, and
the on-box scheduled "tick" job the app needs. There is **no ALB, no Auto Scaling
Group, no NAT gateway, no Lambda, and no EventBridge** — those were removed in
favour of one box with an Elastic IP, fronted by Cloudflare.

## What this creates

- **VPC** (`network.tf`): one **public subnet** + an **Internet Gateway**, no NAT
  gateway. The instance lives in the public subnet and reaches ECR / SSM /
  Supabase straight out through the IGW.
- **One EC2 instance** (`compute.tf`) — Amazon Linux 2023 — with a stable
  **Elastic IP** attached. Its user-data (`templates/user-data.sh.tftpl`) installs
  Docker, logs in to ECR, reads config from SSM, and runs the app container on
  host port 80.
- **Security group** (`security.tf`): web ingress (HTTP/HTTPS), optionally locked
  down to **Cloudflare's edge IP ranges**; all egress open.
- **ECR repository** (`ecr.tf`) for the app image: scan-on-push, lifecycle policy
  keeping the last images, `force_delete` enabled.
- **SSM Parameter Store** app config (`secrets.tf`):
  - `NEXT_PUBLIC_SUPABASE_URL` — `String`
  - `NEXT_PUBLIC_SUPABASE_ANON_KEY` — `SecureString`
  - `CRON_SECRET` — `SecureString`
- **IAM instance role** (`iam.tf`): ECR auth + pull (scoped to this repo), read of
  this app's SSM parameters, `kms:Decrypt` restricted to SSM, and SSM Session
  Manager access (no SSH keys / bastion).
- **On-box systemd timer** for the **freeze-recovery tick**: a timer on the
  instance POSTs to `/api/describe-it/tick` with the `CRON_SECRET` as a Bearer
  token every `tick_interval_seconds`. This replaces the old Lambda +
  EventBridge Scheduler. The endpoint is idempotent and only acts on sessions
  past their deadline.
- **(Optional) Cloudflare DNS record** (`cloudflare.tf`): when `cloudflare_enabled`
  is set, an **A record** pointing your hostname at the Elastic IP. See
  [Cloudflare (optional)](#cloudflare-optional).

> **Database:** none of this provisions a database. Supabase stays as the managed
> backend; the app talks to it directly using the SSM-stored values.

## Remote state (S3 backend)

State lives in **`s3://fateround-tfstate`** (`us-east-1`) — shared, durable, and
reusable across machines, so deleting a local checkout no longer loses state.
Locking uses **S3 conditional writes** (`use_lockfile = true`), so there is **no
DynamoDB lock table** (needs Terraform >= 1.11). The `dev` and `prod` workspaces
sit side by side in the same bucket:

```
infra/terraform.tfstate            # default workspace (unused)
env:/dev/infra/terraform.tfstate   # dev
env:/prod/infra/terraform.tfstate  # prod
```

`terraform init` picks the backend up from `versions.tf` automatically.

**Backend bootstrap (one-time, already done).** The state bucket is created
*out of band* — not managed by this config — to avoid a chicken-and-egg between
the state and the bucket that stores it. It is versioned (history + recovery),
encrypted at rest (SSE-S3), public-access-blocked, and TLS-only:

```bash
BUCKET=fateround-tfstate
aws s3api create-bucket --bucket "$BUCKET" --region us-east-1
aws s3api put-bucket-versioning --bucket "$BUCKET" \
  --versioning-configuration Status=Enabled
aws s3api put-bucket-encryption --bucket "$BUCKET" \
  --server-side-encryption-configuration \
  '{"Rules":[{"ApplyServerSideEncryptionByDefault":{"SSEAlgorithm":"AES256"},"BucketKeyEnabled":true}]}'
aws s3api put-public-access-block --bucket "$BUCKET" \
  --public-access-block-configuration \
  BlockPublicAcls=true,IgnorePublicAcls=true,BlockPublicPolicy=true,RestrictPublicBuckets=true
# Deny any non-TLS (aws:SecureTransport=false) request to the bucket + its objects.
aws s3api put-bucket-policy --bucket "$BUCKET" --policy "$(cat <<JSON
{
  "Version": "2012-10-17",
  "Statement": [
    {
      "Sid": "DenyInsecureTransport",
      "Effect": "Deny",
      "Principal": "*",
      "Action": "s3:*",
      "Resource": ["arn:aws:s3:::$BUCKET", "arn:aws:s3:::$BUCKET/*"],
      "Condition": { "Bool": { "aws:SecureTransport": "false" } }
    }
  ]
}
JSON
)"
```

### Secrets (`*.tfvars`) — durable backup

`terraform.{dev,prod}.tfvars` are **gitignored** (they hold secrets) and are read
from the local filesystem, so by default they live only in your checkout. Losing
them is destructive: the empty variable defaults would make the next `apply` try
to wipe the VAPID params and blank other secrets. The values also exist in SSM and
in the state file, but the files themselves must be preserved.

They are backed up to the **same bucket** (already private, SSE-S3 encrypted,
TLS-only, versioned — and it already contains these secrets inside the state file,
so this adds no new exposure) under `tfvars/`. Re-run after changing any secret:

```bash
# Back up (run from infra/ after editing a tfvars)
aws s3 cp terraform.dev.tfvars  s3://fateround-tfstate/tfvars/terraform.dev.tfvars  --sse AES256
aws s3 cp terraform.prod.tfvars s3://fateround-tfstate/tfvars/terraform.prod.tfvars --sse AES256

# Restore into a fresh checkout
aws s3 cp s3://fateround-tfstate/tfvars/terraform.dev.tfvars  terraform.dev.tfvars
aws s3 cp s3://fateround-tfstate/tfvars/terraform.prod.tfvars terraform.prod.tfvars
```

## Prerequisites

- **Terraform** >= 1.11 (`versions.tf` pins AWS `~> 5.40` and Cloudflare `~> 4.40`;
  the S3 backend uses `use_lockfile`, which needs >= 1.11).
- **AWS credentials / profile** with permission to create the resources above,
  and a target region.
- **Docker** (with `buildx`) — to build and push the app image to ECR.
- **(Optional) Cloudflare** — an API token scoped **DNS:Edit** and your Zone ID,
  if you want Terraform to manage the DNS record.
- Remote state is already configured — see [Remote state](#remote-state-s3-backend).

## Deploy steps

### a. Configure variables

```bash
cd infra
cp terraform.dev.tfvars.example  terraform.dev.tfvars   # or terraform.prod.tfvars.example
# edit: supabase_url, supabase_anon_key, cron_secret, cloudflare_zone_id, etc.
```

### b. Init, select a workspace, plan & apply

Run dev and prod as fully isolated stacks using **Terraform workspaces** + a
per-environment var file. The distinct `name_prefix` (`fateround-dev` vs
`fateround-prod`) namespaces every resource and SSM path, and each workspace has
its own state, so the two never collide.

```bash
terraform init
terraform workspace new dev      # or: terraform workspace select dev
terraform plan  -var-file=terraform.dev.tfvars
terraform apply -var-file=terraform.dev.tfvars
```

Note the outputs — especially **`ecr_repository_url`** (where to push the image)
and **`instance_public_ip`** (the Elastic IP for DNS) / **`instance_id`** (for
SSM Session Manager).

### c. Build & push the image to ECR

Build from the **repo root** `Dockerfile` for **linux/amd64**, passing the
`NEXT_PUBLIC_*` build args (Next.js inlines them at build time), tag to match
`app_image_tag` (default `latest`), log in, and push.

```bash
# From the repo root (one directory up from infra/)
ACCOUNT_ID=<account-id>
REGION=<region>
ECR_URL=$(terraform -chdir=infra output -raw ecr_repository_url)
TAG=latest   # must match var.app_image_tag

# Authenticate Docker to ECR
aws ecr get-login-password --region "$REGION" \
  | docker login --username AWS --password-stdin "$ACCOUNT_ID.dkr.ecr.$REGION.amazonaws.com"

# Build for the instance's architecture (amd64) with the public Supabase build args
docker buildx build --platform linux/amd64 \
  --build-arg NEXT_PUBLIC_SUPABASE_URL="https://YOUR-PROJECT.supabase.co" \
  --build-arg NEXT_PUBLIC_SUPABASE_ANON_KEY="<anon-key>" \
  -t "$ECR_URL:$TAG" --push .
```

### d. Roll out / redeploy

The instance pulls the image **on boot** via user-data. Note: re-applying with the
**same `app_image_tag` is a no-op** (no Terraform diff), and a plain **reboot does
not re-run user-data** on Amazon Linux 2023. So the deterministic redeploy paths are:

- **Recommended — immutable tag per release:** push the image under a unique tag
  (e.g. the git SHA), set `app_image_tag` to it, and `terraform apply` — the
  changed user-data forces the instance to replace and pull the new image.
- **Manual:** `aws ssm start-session --target <instance_id>`, then
  `docker pull <repo>:<tag> && docker rm -f app && <re-run the docker run>` (or
  re-run `/var/lib/cloud/instance/user-data.txt`).

### e. DNS & TLS

When `cloudflare_enabled = true`, Terraform creates an **A record** for
`cloudflare_record_name` pointing at the Elastic IP (proxied through Cloudflare
when `cloudflare_proxied = true`). The container serves **HTTP on host port 80**.

TLS today is **terminated at Cloudflare's edge** (the container serves plain HTTP
on port 80; this stack does not run an origin TLS listener or reverse proxy). To
keep the Cloudflare→origin hop safe:

- **Set `restrict_to_cloudflare = true`** so the origin only accepts connections
  from Cloudflare's edge IPs and can't be hit directly on its public IP. Use
  Cloudflare SSL mode **Full**.
- **For end-to-end TLS to the origin (Full (strict)):** add a reverse proxy on
  the box (e.g. Caddy/nginx) terminating HTTPS with a free **Cloudflare Origin
  Certificate**, and open 443 to it. Not wired up by default — it's a follow-up.

See [Cloudflare (optional)](#cloudflare-optional) for details.

## Cloudflare (optional)

Everything here is **off by default** and inert unless you set the corresponding
variables — the stack works fine without a Cloudflare account. When enabled,
Terraform can:

- Create a **DNS A record** (`cloudflare_record.app`) for `cloudflare_record_name`
  in zone `cloudflare_zone_id`, pointing at the **Elastic IP** (an A record,
  since the instance has a static IP). With `cloudflare_proxied = true` (the
  default) the record is proxied through Cloudflare's edge for TLS/WAF/CDN.
- Optionally **lock the origin to Cloudflare** (`restrict_to_cloudflare = true`):
  the instance security group's web ingress is set to Cloudflare's published edge
  IP ranges (IPv4 + IPv6) instead of `0.0.0.0/0`, so traffic can't bypass
  Cloudflare to hit the instance directly. In that mode you **must keep the record
  proxied** (`cloudflare_proxied = true`), otherwise visitors resolve straight to
  the EIP and are denied.

### Credentials needed at apply time

Only required when the feature is enabled:

- A **Cloudflare API token** scoped **DNS:Edit** for the zone — pass it as
  `cloudflare_api_token` or set the **`CLOUDFLARE_API_TOKEN`** env var (the
  variable falls back to the env var when empty; keep it out of the tfvars files).
- The **Zone ID** of your domain, as `cloudflare_zone_id`.

### Example tfvars

```hcl
cloudflare_enabled     = true
cloudflare_zone_id     = "REPLACE_WITH_ZONE_ID"
cloudflare_record_name = "app"   # -> app.example.com
cloudflare_proxied     = true    # orange cloud: TLS/WAF/CDN at the edge
restrict_to_cloudflare = true    # lock the origin to Cloudflare IPs
# cloudflare_api_token comes from the CLOUDFLARE_API_TOKEN env var.

# With proxied = true, use Cloudflare SSL "Full" and install a free Cloudflare
# Origin Certificate on the box for end-to-end TLS.
```

## Operating

- **Shell access (no SSH):** the instance is managed via SSM Session Manager.

  ```bash
  aws ssm start-session --target <instance_id>
  ```

- **Logs:**
  - Boot / user-data: `/var/log/user-data.log`
  - App container: `docker logs app`
- **Tick job:** check the on-box timer with

  ```bash
  systemctl status fateround-tick.timer
  ```

## Cost note

Rough monthly ballpark (us-east-1, on-demand):

| Item | Approx. |
| --- | --- |
| `t3.small` instance | ~$15 |
| EBS gp3 root, 20 GB | ~$2 |
| Elastic IP | free while attached |
| ECR / SSM / data transfer | minimal |
| **Total** | **~$15–18/mo** |

The lean design deliberately drops the expensive bits of the old stack: **no NAT
gateway** (~$32/mo saved) and **no ALB** (~$16/mo saved).

## Teardown

```bash
terraform destroy -var-file=terraform.<env>.tfvars
```

ECR `force_delete` is enabled, so the repository and **all images in it are
removed** on destroy.

## Security notes

- **IMDSv2 is required** (`http_tokens = "required"`) with **hop limit 1**,
  mitigating SSRF-to-credential theft from inside the container.
- The **root EBS volume is encrypted**.
- Secrets live in **SSM SecureString** parameters; the instance role can
  `kms:Decrypt` only via SSM and can read only this app's parameter path.
- The origin can be **locked to Cloudflare's edge IPs** (`restrict_to_cloudflare`)
  so it's only reachable through the proxy.
- **Single instance = no HA.** If the box or its AZ has trouble, the app is down
  until it recovers / is replaced. This is an accepted trade-off for launch.
