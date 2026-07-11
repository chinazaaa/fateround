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

variable "vapid_subject" {
  description = "VAPID_SUBJECT — contact URL push services can reach (mailto: or https:)."
  type        = string
  default     = ""
}

variable "otel_exporter_otlp_endpoint" {
  description = "OTEL_EXPORTER_OTLP_ENDPOINT — OTLP/HTTP base URL for trace+metric export (e.g. https://otlp-gateway-<region>.grafana.net/otlp for Grafana Cloud, or http://localhost:4318 to route via an on-box collector). Empty disables all OpenTelemetry export; src/instrumentation.ts no-ops without it."
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
