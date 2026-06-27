provider "cloudflare" {
  # Falls back to the CLOUDFLARE_API_TOKEN env var when the variable is empty.
  api_token = var.cloudflare_api_token != "" ? var.cloudflare_api_token : null
}

# Public endpoint; only fetched to lock down the origin to Cloudflare's edge.
data "cloudflare_ip_ranges" "cloudflare" {
  count = var.restrict_to_cloudflare ? 1 : 0
}

locals {
  web_ingress_ipv4 = var.restrict_to_cloudflare ? data.cloudflare_ip_ranges.cloudflare[0].ipv4_cidr_blocks : ["0.0.0.0/0"]
  web_ingress_ipv6 = var.restrict_to_cloudflare ? data.cloudflare_ip_ranges.cloudflare[0].ipv6_cidr_blocks : []
}

# A record, since the EIP is static.
resource "cloudflare_record" "app" {
  count   = var.cloudflare_enabled ? 1 : 0
  zone_id = var.cloudflare_zone_id
  name    = var.cloudflare_record_name
  type    = "A"
  content = aws_eip.app.public_ip
  proxied = var.cloudflare_proxied
  comment = "Managed by Terraform — fateround app"
}
