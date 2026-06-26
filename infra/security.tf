# ALB: public HTTP(S) ingress from anywhere.
resource "aws_security_group" "alb" {
  name        = "${var.name_prefix}-alb-sg"
  description = "Public ingress to the load balancer"
  vpc_id      = aws_vpc.main.id

  # When restrict_alb_to_cloudflare is on, only Cloudflare's edge can reach the
  # ALB (so clients can't bypass Cloudflare); otherwise open to the internet.
  ingress {
    description      = "HTTP"
    from_port        = 80
    to_port          = 80
    protocol         = "tcp"
    cidr_blocks      = local.alb_ingress_ipv4
    ipv6_cidr_blocks = local.alb_ingress_ipv6
  }

  ingress {
    description      = "HTTPS"
    from_port        = 443
    to_port          = 443
    protocol         = "tcp"
    cidr_blocks      = local.alb_ingress_ipv4
    ipv6_cidr_blocks = local.alb_ingress_ipv6
  }

  egress {
    description = "All outbound"
    from_port   = 0
    to_port     = 0
    protocol    = "-1"
    cidr_blocks = ["0.0.0.0/0"]
  }

  tags = { Name = "${var.name_prefix}-alb-sg" }
}

# App instances: only reachable on the app port from the ALB.
resource "aws_security_group" "app" {
  name        = "${var.name_prefix}-app-sg"
  description = "App instances; ingress only from the ALB"
  vpc_id      = aws_vpc.main.id

  ingress {
    description     = "App port from ALB"
    from_port       = var.app_port
    to_port         = var.app_port
    protocol        = "tcp"
    security_groups = [aws_security_group.alb.id]
  }

  egress {
    description = "All outbound (ECR, SSM, Supabase)"
    from_port   = 0
    to_port     = 0
    protocol    = "-1"
    cidr_blocks = ["0.0.0.0/0"]
  }

  tags = { Name = "${var.name_prefix}-app-sg" }
}
