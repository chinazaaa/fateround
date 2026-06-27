# Latest Amazon Linux 2023 AMI.
# x86_64 — switch the filter + instance type together for Graviton.
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

# Single application instance.
resource "aws_instance" "app" {
  ami           = data.aws_ami.al2023.id
  instance_type = var.instance_type

  subnet_id              = aws_subnet.public.id
  vpc_security_group_ids = [aws_security_group.app.id]
  iam_instance_profile   = aws_iam_instance_profile.app.name

  # The EIP only attaches AFTER the instance exists, so give it a public IP at
  # launch — otherwise user_data has no outbound internet (dnf/curl/ecr/ssm fail).
  associate_public_ip_address = true

  metadata_options {
    http_endpoint = "enabled"
    http_tokens   = "required"
    # Keeps IMDS unreachable from the app container.
    http_put_response_hop_limit = 1
  }

  root_block_device {
    encrypted   = true
    volume_size = 20
    volume_type = "gp3" # Holds decrypted SSM secrets at runtime.
  }

  # Plain templatefile: aws_instance.user_data takes raw text and Terraform
  # handles the encoding. Do NOT base64encode here.
  user_data = templatefile("${path.module}/templates/user-data.sh.tftpl", {
    aws_region            = var.aws_region
    ecr_repo_url          = aws_ecr_repository.app.repository_url
    image_tag             = var.app_image_tag
    name_prefix           = var.name_prefix
    app_port              = var.app_port
    tick_interval_seconds = var.tick_interval_seconds
  })

  # Re-run the bootstrap when config changes (app_image_tag, app_port, tick): a
  # user_data change alone updates in place without rerunning it, so replace.
  user_data_replace_on_change = true

  tags = {
    Name = "${var.name_prefix}-app"
  }
}

# Stable public address for the instance.
resource "aws_eip" "app" {
  instance = aws_instance.app.id
  domain   = "vpc"

  tags = {
    Name = "${var.name_prefix}-eip"
  }
}
