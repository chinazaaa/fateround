# Latest Amazon Linux 2023 AMI (x86_64).
data "aws_ami" "al2023" {
  most_recent = true
  owners      = ["amazon"]

  filter {
    name   = "name"
    values = ["al2023-ami-2023.*-x86_64"]
  }

  filter {
    name   = "virtualization-type"
    values = ["hvm"]
  }
}

resource "aws_launch_template" "app" {
  name_prefix   = "${var.name_prefix}-app-"
  image_id      = data.aws_ami.al2023.id
  instance_type = var.instance_type

  iam_instance_profile {
    arn = aws_iam_instance_profile.app.arn
  }

  vpc_security_group_ids = [aws_security_group.app.id]

  # Require IMDSv2 and keep IMDS unreachable from the app container: hop limit 1
  # means the host can use IMDS but the extra Docker network hop cannot, so a
  # container SSRF can't reach instance credentials. (The app gets its config via
  # env vars, not IMDS.)
  metadata_options {
    http_endpoint               = "enabled"
    http_tokens                 = "required"
    http_put_response_hop_limit = 1
  }

  # Encrypt the root volume (it holds the decrypted SSM secrets passed to the
  # container) so a snapshot/volume leak doesn't expose them at rest.
  block_device_mappings {
    device_name = "/dev/xvda"
    ebs {
      encrypted   = true
      volume_size = 20
      volume_type = "gp3"
    }
  }

  user_data = base64encode(templatefile("${path.module}/templates/user-data.sh.tftpl", {
    aws_region   = var.aws_region
    ecr_repo_url = aws_ecr_repository.app.repository_url
    image_tag    = var.app_image_tag
    name_prefix  = var.name_prefix
    app_port     = var.app_port
  }))

  tag_specifications {
    resource_type = "instance"
    tags          = { Name = "${var.name_prefix}-app" }
  }

  lifecycle {
    create_before_destroy = true
  }
}

resource "aws_autoscaling_group" "app" {
  # name_prefix (not a fixed name) so create_before_destroy replacements don't
  # collide on an existing ASG name.
  name_prefix         = "${var.name_prefix}-asg-"
  vpc_zone_identifier = aws_subnet.private[*].id
  target_group_arns   = [aws_lb_target_group.app.arn]
  health_check_type   = "ELB"

  # Give instances time to pull the image and boot before health checks count.
  health_check_grace_period = 180

  min_size         = var.asg_min_size
  max_size         = var.asg_max_size
  desired_capacity = var.asg_desired_capacity

  launch_template {
    id      = aws_launch_template.app.id
    version = "$Latest"
  }

  # Replace instances one batch at a time on launch-template changes.
  instance_refresh {
    strategy = "Rolling"
    preferences {
      min_healthy_percentage = 50
    }
  }

  tag {
    key                 = "Name"
    value               = "${var.name_prefix}-app"
    propagate_at_launch = true
  }

  lifecycle {
    create_before_destroy = true
    precondition {
      condition     = var.asg_min_size <= var.asg_desired_capacity && var.asg_desired_capacity <= var.asg_max_size
      error_message = "Require asg_min_size <= asg_desired_capacity <= asg_max_size."
    }
  }
}
