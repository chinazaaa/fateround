# fateround — AWS Infrastructure (Terraform)

Terraform stack that provisions, **in your own AWS account and region** (for control and data residency), the infrastructure to run the `fateround` Next.js 16 app as a Docker container on EC2 behind an Application Load Balancer.

Supabase remains the managed backend. **This stack does not create a database** — it only stands up the compute, networking, image registry, config storage, and the scheduled "tick" job that the app needs.

## What this creates

- **VPC** (`network.tf`) with public + private subnets spread across `az_count` Availability Zones, an Internet Gateway, and a **single NAT gateway** (cost trade-off — see [Cost note](#cost-note)) for private-subnet outbound (ECR pulls, SSM, Supabase).
- **Application Load Balancer** (`alb.tf`) in the public subnets, with an HTTP listener (and an optional HTTPS listener + HTTP→HTTPS redirect when `enable_https` is set). Health checks hit `/`.
- **Auto Scaling Group** (`compute.tf`) of Amazon Linux 2023 EC2 instances in the **private** subnets. Each instance boots from a launch template whose user-data (`templates/user-data.sh.tftpl`) installs Docker, logs in to ECR, reads config from SSM Parameter Store, and runs the app container. IMDSv2 is required.
- **ECR repository** (`ecr.tf`) for the app image, with scan-on-push and a lifecycle policy that keeps the last 10 images. `force_delete` is enabled.
- **SSM Parameter Store** app config (`secrets.tf`):
  - `NEXT_PUBLIC_SUPABASE_URL` — `String`
  - `NEXT_PUBLIC_SUPABASE_ANON_KEY` — `SecureString`
  - `CRON_SECRET` — `SecureString`
- **IAM instance role** (`iam.tf`): ECR auth + pull (scoped to this repo), read of this app's SSM parameters, `kms:Decrypt` restricted to SSM, and SSM Session Manager access (no SSH keys / bastion).
- **EventBridge Scheduler → Lambda** (`scheduler.tf`, `lambda/tick/index.mjs`): on `tick_schedule`, a Lambda POSTs to `/api/describe-it/tick` with the `CRON_SECRET` as a Bearer token. This replaces the Vercel cron that the Hobby plan could not run. The endpoint is idempotent and only acts on sessions past their deadline.
- **(Optional) Cloudflare DNS record** (`cloudflare.tf`): when `cloudflare_enabled` is set, a `CNAME` pointing your hostname at the ALB. Off by default — see [Cloudflare (optional)](#cloudflare-optional).

> **Database:** none of this provisions a database. Supabase stays as the managed backend; the app talks to it directly using the SSM-stored values.

## Prerequisites

- **Terraform** >= 1.5 (`versions.tf` pins the AWS provider `~> 5.40` and `archive ~> 2.4`).
- **AWS credentials / profile** with permission to create the resources above, and a target region.
- **Docker** — to build and push the app image to ECR.
- **(HTTPS, recommended)** an **ACM certificate** in the same region plus a **domain** you can point at the ALB.
- **Strongly recommended:** configure the **S3 remote backend** (commented out in `versions.tf`) with a DynamoDB lock table before any real/shared use. The default is local state.

## Deploy steps

### a. Configure variables

```bash
cd infra
cp terraform.tfvars.example terraform.tfvars
# edit terraform.tfvars: supabase_url, supabase_anon_key, cron_secret, region, etc.
```

### b. Init & plan

```bash
terraform init
terraform plan
```

### c. Apply

```bash
terraform apply
```

Note the outputs — especially **`ecr_repository_url`** (where to push the image) and **`alb_dns_name`** (for DNS).

### d. Build & push the image to ECR

Build from the **repo root** `Dockerfile`, passing the `NEXT_PUBLIC_*` build args (Next.js inlines them at build time), tag to match `app_image_tag` (default `latest`), then log in and push.

```bash
# From the repo root (one directory up from infra/)
ACCOUNT_ID=<account-id>
REGION=<region>
ECR_URL=$(terraform -chdir=infra output -raw ecr_repository_url)
TAG=latest   # must match var.app_image_tag

# Authenticate Docker to ECR
aws ecr get-login-password --region "$REGION" \
  | docker login --username AWS --password-stdin "$ACCOUNT_ID.dkr.ecr.$REGION.amazonaws.com"

# Build with the public Supabase build args
docker build \
  --build-arg NEXT_PUBLIC_SUPABASE_URL="https://YOUR-PROJECT.supabase.co" \
  --build-arg NEXT_PUBLIC_SUPABASE_ANON_KEY="<anon-key>" \
  -t "$ECR_URL:$TAG" .

# Push
docker push "$ECR_URL:$TAG"
```

### e. Roll out

Instances pull the image on boot. To roll out a **new** image, push the tag again, then either:

```bash
terraform apply
```

or trigger an ASG **instance refresh** so instances are replaced and pull the new image:

```bash
aws autoscaling start-instance-refresh --auto-scaling-group-name fateround-asg
```

### f. DNS & HTTPS

Point your domain's CNAME/ALIAS at the **`alb_dns_name`** output. For HTTPS, provision an ACM cert in `aws_region`, then set in `terraform.tfvars`:

```hcl
enable_https        = true
acm_certificate_arn = "arn:aws:acm:<region>:<account-id>:certificate/..."
app_base_url        = "https://play.example.com"
```

and re-apply. `app_base_url` is also used by the tick scheduler; if empty it falls back to the ALB over HTTP.

## Cloudflare (optional)

Everything here is **off by default** and inert unless you set the corresponding variables — the stack works fine without a Cloudflare account. When enabled, Terraform can:

- Create a **DNS `CNAME`** (`cloudflare_record.app`) for `cloudflare_record_name` in zone `cloudflare_zone_id`, pointing at the ALB's DNS name (CNAME because the ALB has no static IP). With `cloudflare_proxied = true` (the default) the record is proxied through Cloudflare's edge for TLS/WAF/CDN.
- Optionally **lock the ALB down to Cloudflare** (`restrict_alb_to_cloudflare = true`): the ALB security group's ingress is set to Cloudflare's published edge IP ranges (IPv4 + IPv6, via the `cloudflare_ip_ranges` data source) instead of `0.0.0.0/0`, so traffic can't bypass Cloudflare to hit the ALB directly.

### Credentials needed at apply time

Only required when the feature is enabled:

- A **Cloudflare API token** scoped **DNS:Edit** for the zone — pass it as `cloudflare_api_token` or set the `CLOUDFLARE_API_TOKEN` env var (the variable falls back to the env var when empty).
- The **Zone ID** of your domain, as `cloudflare_zone_id`.

### TLS guidance

When the record is **proxied** (`cloudflare_proxied = true`), Cloudflare terminates TLS at its edge and connects to the ALB as the origin. Use Cloudflare SSL mode **Full (strict)** and put a certificate on the ALB origin, one of:

- **Keep ACM** — set `enable_https = true` and `acm_certificate_arn` so the ALB serves a valid public cert; or
- **Import a free Cloudflare Origin Certificate** into AWS ACM and pass its ARN as `acm_certificate_arn` (still requires `enable_https = true`).

Do **not** use Cloudflare's **Flexible** SSL mode: it leaves the Cloudflare→ALB hop unencrypted.

### Locking the ALB to Cloudflare

With `restrict_alb_to_cloudflare = true`, only Cloudflare's edge IPs can reach the ALB — direct client access is blocked. In that mode you **must keep the record proxied** (`cloudflare_proxied = true`), otherwise visitors resolve straight to the ALB and are denied.

### Example tfvars

```hcl
cloudflare_enabled         = true
cloudflare_api_token       = "REPLACE_WITH_DNS_EDIT_TOKEN"  # or set CLOUDFLARE_API_TOKEN
cloudflare_zone_id         = "REPLACE_WITH_ZONE_ID"
cloudflare_record_name     = "play"        # -> play.example.com
cloudflare_proxied         = true          # orange cloud: TLS/WAF/CDN at the edge
restrict_alb_to_cloudflare = true          # lock the ALB to Cloudflare IPs

# With proxied = true, use Cloudflare SSL "Full (strict)" and put a cert on the
# ALB origin: either keep ACM (enable_https + acm_certificate_arn) or import a
# free Cloudflare Origin Certificate into ACM and use its ARN.
```

## Operating

- **Shell access (no SSH):** instances are managed via SSM Session Manager.

  ```bash
  aws ssm start-session --target <instance-id>
  ```

- **Logs:**
  - Boot / user-data: `/var/log/user-data.log`
  - App container: `docker logs app`
- **Tick job:** the Lambda function name is the **`tick_lambda_name`** output; the schedule is `tick_schedule` (default `rate(1 minute)`).

## Cost note

Rough monthly ballpark (region-dependent, on-demand):

| Item | Approx. |
| --- | --- |
| Application Load Balancer | ~$16+ |
| NAT gateway | ~$32+ (plus data processing) |
| 2× `t3.small` instances | ~$30 |
| Data transfer | extra |

This stack uses a **single NAT gateway** to keep cost down. The trade-off is that NAT is not highly available across AZs — if that AZ has trouble, private-subnet outbound is affected. Moving to one NAT per AZ improves HA but raises cost (another ~$32+/month per additional NAT).

## Teardown

```bash
terraform destroy
```

ECR `force_delete` is enabled, so the repository and **all images in it are removed** on destroy.

## Security notes

- App instances are **only reachable from the ALB** on the app port (`app_port`, default 3000); they sit in private subnets with no inbound from the internet.
- **IMDSv2 is required** (`http_tokens = "required"`), mitigating SSRF-to-credential theft.
- Secrets live in **SSM SecureString** parameters; the instance role can `kms:Decrypt` only via SSM and can read only this app's parameter path.
- The **`CRON_SECRET`** stored in SSM must match the value the app expects, since the tick Lambda authenticates to `/api/describe-it/tick` with it as a Bearer token.
