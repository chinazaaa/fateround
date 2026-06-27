output "instance_public_ip" {
  description = "Elastic IP; point your Cloudflare A record here."
  value       = aws_eip.app.public_ip
}

output "instance_id" {
  description = "Instance ID; use with aws ssm start-session."
  value       = aws_instance.app.id
}

output "ecr_repository_url" {
  description = "Push the app image here (tag must match var.app_image_tag)."
  value       = aws_ecr_repository.app.repository_url
}

output "vpc_id" {
  description = "ID of the created VPC."
  value       = aws_vpc.main.id
}
