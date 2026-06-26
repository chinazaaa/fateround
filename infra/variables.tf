variable "aws_region" {
  description = "AWS region to deploy into. Choose for control / data residency."
  type        = string
  default     = "us-east-1"
}

variable "name_prefix" {
  description = "Prefix applied to resource names and the SSM parameter path."
  type        = string
  default     = "fateround"
}

# ---------------------------------------------------------------------------
# Networking
# ---------------------------------------------------------------------------

variable "vpc_cidr" {
  description = "CIDR block for the VPC."
  type        = string
  default     = "10.0.0.0/16"
}

variable "az_count" {
  description = "Number of Availability Zones to spread subnets across (>= 2 for the ALB)."
  type        = number
  default     = 2

  validation {
    condition     = var.az_count >= 2
    error_message = "An Application Load Balancer requires at least two AZs."
  }
}

# ---------------------------------------------------------------------------
# Compute
# ---------------------------------------------------------------------------

variable "instance_type" {
  description = "EC2 instance type for the app servers."
  type        = string
  default     = "t3.small"
}

variable "asg_min_size" {
  description = "Minimum number of app instances."
  type        = number
  default     = 2
}

variable "asg_max_size" {
  description = "Maximum number of app instances."
  type        = number
  default     = 4
}

variable "asg_desired_capacity" {
  description = "Desired number of app instances."
  type        = number
  default     = 2
}

variable "app_port" {
  description = "Port the Next.js container listens on."
  type        = number
  default     = 3000
}

variable "app_image_tag" {
  description = "ECR image tag to run (push this tag from CI before scaling up)."
  type        = string
  default     = "latest"
}

# ---------------------------------------------------------------------------
# TLS / DNS (optional but recommended)
# ---------------------------------------------------------------------------

variable "enable_https" {
  description = "Add an HTTPS listener and redirect HTTP->HTTPS. Requires acm_certificate_arn."
  type        = bool
  default     = false
}

variable "acm_certificate_arn" {
  description = "ARN of an ACM certificate in this region for the HTTPS listener."
  type        = string
  default     = ""
}

variable "app_base_url" {
  description = "Public base URL of the app (e.g. https://play.example.com). Used by the tick scheduler. Falls back to the ALB DNS over HTTP if empty."
  type        = string
  default     = ""
}

# ---------------------------------------------------------------------------
# Application secrets (stored in SSM Parameter Store; pass via tfvars or CI)
# ---------------------------------------------------------------------------

variable "supabase_url" {
  description = "NEXT_PUBLIC_SUPABASE_URL value."
  type        = string
}

variable "supabase_anon_key" {
  description = "NEXT_PUBLIC_SUPABASE_ANON_KEY value."
  type        = string
  sensitive   = true
}

variable "cron_secret" {
  description = "Shared secret the tick scheduler sends as a Bearer token to /api/describe-it/tick."
  type        = string
  sensitive   = true
}

# ---------------------------------------------------------------------------
# Scheduler
# ---------------------------------------------------------------------------

variable "tick_schedule" {
  description = "EventBridge Scheduler expression for the freeze-recovery tick."
  type        = string
  default     = "rate(1 minute)"
}

# ---------------------------------------------------------------------------
# Cloudflare (optional — all off by default)
# ---------------------------------------------------------------------------

variable "cloudflare_enabled" {
  description = "Create a Cloudflare DNS record (CNAME) pointing at the ALB."
  type        = bool
  default     = false
}

variable "cloudflare_api_token" {
  description = "Cloudflare API token with DNS:Edit on the zone. Falls back to CLOUDFLARE_API_TOKEN env var."
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
  description = "Hostname for the DNS record (e.g. 'play' or 'play.example.com')."
  type        = string
  default     = ""
}

variable "cloudflare_proxied" {
  description = "Proxy the record through Cloudflare (orange cloud) for TLS/WAF/CDN."
  type        = bool
  default     = true
}

variable "restrict_alb_to_cloudflare" {
  description = "Lock the ALB security group to Cloudflare's edge IP ranges, so traffic can't bypass Cloudflare."
  type        = bool
  default     = false
}
