variable "aws_region" {
  description = "AWS region to deploy into."
  type        = string
  default     = "us-east-1"
}

variable "name_prefix" {
  description = "Prefix applied to the names of all created resources."
  type        = string
  default     = "fateround"
}

variable "vpc_cidr" {
  description = "CIDR block for the VPC."
  type        = string
  default     = "10.0.0.0/16"
}

variable "instance_type" {
  description = "EC2 instance type for the application host."
  type        = string
  default     = "t3.small"
}

variable "app_port" {
  description = "Container's internal port; published on host :80."
  type        = number
  default     = 3000

  validation {
    condition     = var.app_port >= 1 && var.app_port <= 65535 && floor(var.app_port) == var.app_port
    error_message = "app_port must be a whole number between 1 and 65535."
  }
}

variable "app_image_tag" {
  description = "Container image tag to deploy."
  type        = string
  default     = "latest"
}

variable "supabase_url" {
  description = "Supabase project URL (NEXT_PUBLIC_SUPABASE_URL)."
  type        = string

  validation {
    condition     = trimspace(var.supabase_url) != ""
    error_message = "supabase_url is required."
  }
}

variable "supabase_anon_key" {
  description = "Supabase anonymous (public) API key (NEXT_PUBLIC_SUPABASE_ANON_KEY)."
  type        = string
  sensitive   = true

  validation {
    condition     = trimspace(var.supabase_anon_key) != ""
    error_message = "supabase_anon_key is required."
  }
}

variable "cron_secret" {
  description = "Bearer token for the local freeze-recovery tick."
  type        = string
  sensitive   = true

  validation {
    condition     = trimspace(var.cron_secret) != ""
    error_message = "cron_secret is required."
  }
}

variable "tick_interval_seconds" {
  description = "How often the on-box systemd timer hits /api/describe-it/tick."
  type        = number
  default     = 60

  validation {
    condition     = var.tick_interval_seconds > 0 && floor(var.tick_interval_seconds) == var.tick_interval_seconds
    error_message = "tick_interval_seconds must be a positive whole number of seconds."
  }
}

variable "cloudflare_enabled" {
  description = "Create a Cloudflare A record -> the EIP."
  type        = bool
  default     = false
}

variable "cloudflare_api_token" {
  description = "DNS:Edit token; falls back to CLOUDFLARE_API_TOKEN env."
  type        = string
  default     = ""
  sensitive   = true
}

variable "cloudflare_zone_id" {
  description = "Cloudflare Zone ID for the domain."
  type        = string
  default     = ""
}

variable "cloudflare_record_name" {
  description = "Hostname e.g. \"app\" -> app.yourdomain."
  type        = string
  default     = ""
}

variable "cloudflare_proxied" {
  description = "Proxy the record through Cloudflare (orange cloud) for TLS/WAF/CDN."
  type        = bool
  default     = true
}

variable "restrict_to_cloudflare" {
  description = "Lock the instance security group to Cloudflare's edge IP ranges so the origin can't be hit directly."
  type        = bool
  default     = false
}

variable "next_public_app_url" {
  description = "NEXT_PUBLIC_APP_URL — public base URL of the app (e.g. https://dev.fateround.com)."
  type        = string

  validation {
    condition     = trimspace(var.next_public_app_url) != ""
    error_message = "next_public_app_url is required."
  }
}

variable "next_public_livekit_url" {
  description = "NEXT_PUBLIC_LIVEKIT_URL — LiveKit server URL (public)."
  type        = string
}

variable "supabase_service_role_key" {
  description = "SUPABASE_SERVICE_ROLE_KEY — server-side Supabase key."
  type        = string
  sensitive   = true
}

variable "admin_email" {
  description = "ADMIN_EMAIL — admin login email."
  type        = string
}

variable "admin_password" {
  description = "ADMIN_PASSWORD — admin login password."
  type        = string
  sensitive   = true
}

variable "admin_session_secret" {
  description = "ADMIN_SESSION_SECRET — admin session signing secret."
  type        = string
  sensitive   = true
}

variable "klipy_api_key" {
  description = "KLIPY_API_KEY — Klipy API key."
  type        = string
  sensitive   = true
}

variable "livekit_api_key" {
  description = "LIVEKIT_API_KEY — LiveKit API key."
  type        = string
  sensitive   = true
}

variable "livekit_api_secret" {
  description = "LIVEKIT_API_SECRET — LiveKit API secret."
  type        = string
  sensitive   = true
}

# Web push (game start / play-again / end). Optional: leave both empty to keep the
# feature off (no SSM params created, notifications UI stays hidden). The public key
# is a build arg in the CI workflow; the private key is the runtime secret here. The
# two must be from the same keypair (`pnpm vapid:generate`).
variable "vapid_private_key" {
  description = "VAPID_PRIVATE_KEY — web-push private key. Empty disables push."
  type        = string
  sensitive   = true
  default     = ""
}

variable "spotify_client_secret" {
  description = "SPOTIFY_CLIENT_SECRET — in-game music OAuth secret. Empty disables music. The matching NEXT_PUBLIC_SPOTIFY_CLIENT_ID is public and set in the CI build workflow."
  type        = string
  sensitive   = true
  default     = ""
}

# AI question/deck generation on /create. Hosts no longer supply their own Claude
# key, so this is what pays for every generation — leaving it empty makes the
# /api/ai-questions route return 503 and the "Generate with AI" option inert.
# NOTE: this is a metered spend. The only ceiling today is the per-IP rate limit
# in src/lib/rate-limit.ts (RATE_LIMITS.aiQuestions + aiQuestionsDaily); there is
# no per-account entitlement until billing ships. Set a budget alert on the
# Anthropic account before pointing real traffic at it.
variable "anthropic_api_key" {
  description = "ANTHROPIC_API_KEY — server-side Claude key for AI deck generation. Empty disables AI generation."
  type        = string
  sensitive   = true
  default     = ""
}

variable "vapid_subject" {
  description = "VAPID_SUBJECT — contact URL push services can reach (mailto: or https:)."
  type        = string
  default     = ""
}

variable "otel_exporter_otlp_endpoint" {
  description = "OTEL_EXPORTER_OTLP_ENDPOINT — OTLP/HTTP base URL for trace+metric export (e.g. https://otlp-gateway-<region>.grafana.net/otlp for Grafana Cloud). Empty disables all OpenTelemetry export; src/instrumentation.ts no-ops without it. (An on-box collector would need a container-reachable host — host.docker.internal or host networking, not the container's own localhost — but the MVP exports directly to the backend and runs no collector.)"
  type        = string
  default     = ""
}

variable "otel_exporter_otlp_headers" {
  description = "OTEL_EXPORTER_OTLP_HEADERS — comma-separated OTLP headers, typically the backend auth (e.g. \"Authorization=Basic <base64(instanceID:token)>\" for Grafana Cloud). Empty when the endpoint needs no auth (e.g. a local collector)."
  type        = string
  sensitive   = true
  default     = ""
}

variable "otel_resource_attributes" {
  description = "OTEL_RESOURCE_ATTRIBUTES — comma-separated resource attributes stamped on every span/metric (e.g. \"deployment.environment=prod\"). service.name defaults to \"fateround\" in code; empty is fine."
  type        = string
  default     = ""
}

variable "enable_origin_tls" {
  description = "Run Caddy on the instance to terminate HTTPS with a Cloudflare Origin Certificate (Full-strict). When false, the app serves plain HTTP:80 (Flexible)."
  type        = bool
  default     = false
}

variable "origin_cert" {
  description = "Cloudflare Origin Certificate (PEM). Required when enable_origin_tls = true. Provide via TF_VAR_origin_cert."
  type        = string
  default     = ""
  sensitive   = true
}

variable "origin_key" {
  description = "Private key (PEM) for the Origin Certificate. Required when enable_origin_tls = true. Provide via TF_VAR_origin_key."
  type        = string
  default     = ""
  sensitive   = true
}

# ── Background workers ───────────────────────────────────────────────────────────────────────
# The in-process game ticker and idle reaper gate on NODE_ENV === "production" in code. A
# DEPLOYED dev build satisfies that too, so dev ran prod-grade background load against a free
# Supabase project and exhausted its egress quota (402 exceed_egress_quota, 2026-08-24), taking
# the RLS Boundaries check offline with it. These let a non-prod stack turn that load down.
# Leave empty on prod: empty means "not set", and the code keeps its production defaults.

variable "app_env" {
  description = "APP_ENV — which deployment this is (\"prod\" or \"dev\"). Optional: the app derives it from the NEXT_PUBLIC_APP_URL host when unset, so only set this to override that."
  type        = string
  default     = ""

  validation {
    condition     = contains(["", "prod", "dev"], var.app_env)
    error_message = "app_env must be \"prod\", \"dev\", or empty to auto-detect from the app URL."
  }
}

variable "game_tick_disabled" {
  description = "GAME_TICK_DISABLED — set to \"1\" to stop the in-process game ticker entirely. Empty = enabled."
  type        = string
  default     = ""
}

variable "game_tick_interval_ms" {
  description = "GAME_TICK_INTERVAL_MS — ticker cadence in ms. Empty = code default (2500). Raise it on dev rather than disabling, to keep timed games advancing."
  type        = string
  default     = ""
}

variable "idle_reaper_disabled" {
  description = "IDLE_REAPER_DISABLED — set to \"1\" to stop the idle-active-game reaper. Empty = enabled."
  type        = string
  default     = ""
}
