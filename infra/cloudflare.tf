# Optional Cloudflare integration. Everything here is inert unless you set the
# corresponding variables, so the stack works fine without a Cloudflare account.

provider "cloudflare" {
  # Falls back to the CLOUDFLARE_API_TOKEN env var when the variable is empty.
  api_token = var.cloudflare_api_token != "" ? var.cloudflare_api_token : null
}

# Cloudflare's published edge IP ranges (public endpoint). Only fetched when we
# need them to lock down the ALB.
data "cloudflare_ip_ranges" "cloudflare" {
  count = var.restrict_alb_to_cloudflare ? 1 : 0
}

locals {
  # ALB ingress sources: Cloudflare-only when restricting, else the whole internet.
  alb_ingress_ipv4 = var.restrict_alb_to_cloudflare ? data.cloudflare_ip_ranges.cloudflare[0].ipv4_cidr_blocks : ["0.0.0.0/0"]
  alb_ingress_ipv6 = var.restrict_alb_to_cloudflare ? data.cloudflare_ip_ranges.cloudflare[0].ipv6_cidr_blocks : []
}

# DNS record pointing your hostname at the ALB. CNAME because ALBs have no static IP.
resource "cloudflare_record" "app" {
  count   = var.cloudflare_enabled ? 1 : 0
  zone_id = var.cloudflare_zone_id
  name    = var.cloudflare_record_name
  type    = "CNAME"
  content = aws_lb.main.dns_name
  proxied = var.cloudflare_proxied
  comment = "Managed by Terraform — fateround app"
}
