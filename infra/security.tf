# security.tf
# Security group for the app EC2 instance: web ingress + unrestricted egress.
# The web_ingress_ipv4 / web_ingress_ipv6 locals are defined in cloudflare.tf.

resource "aws_security_group" "app" {
  description = "App instance: web ingress + all egress"
  vpc_id      = aws_vpc.main.id

  # HTTP from the allowed web ranges.
  ingress {
    description      = "HTTP"
    from_port        = 80
    to_port          = 80
    protocol         = "tcp"
    cidr_blocks      = local.web_ingress_ipv4
    ipv6_cidr_blocks = local.web_ingress_ipv6
  }

  # HTTPS from the allowed web ranges.
  ingress {
    description      = "HTTPS"
    from_port        = 443
    to_port          = 443
    protocol         = "tcp"
    cidr_blocks      = local.web_ingress_ipv4
    ipv6_cidr_blocks = local.web_ingress_ipv6
  }

  # All outbound traffic (ECR pulls, SSM, Supabase, package mirrors, etc.).
  egress {
    description = "All outbound (ECR, SSM, Supabase)"
    from_port   = 0
    to_port     = 0
    protocol    = "-1"
    cidr_blocks = ["0.0.0.0/0"]
  }

  tags = {
    Name = "${var.name_prefix}-app-sg"
  }
}
