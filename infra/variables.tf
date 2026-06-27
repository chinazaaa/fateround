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
}

variable "app_image_tag" {
  description = "Container image tag to deploy."
  type        = string
  default     = "latest"
}

variable "supabase_url" {
  description = "Supabase project URL (NEXT_PUBLIC_SUPABASE_URL)."
  type        = string
}

variable "supabase_anon_key" {
  description = "Supabase anonymous (public) API key (NEXT_PUBLIC_SUPABASE_ANON_KEY)."
  type        = string
  sensitive   = true
}

variable "cron_secret" {
  description = "Bearer token for the local freeze-recovery tick."
  type        = string
  sensitive   = true
}

variable "tick_interval_seconds" {
  description = "How often the on-box systemd timer hits /api/describe-it/tick."
  type        = number
  default     = 60
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
