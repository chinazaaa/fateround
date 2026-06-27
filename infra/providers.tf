provider "aws" {
  region = var.aws_region

  # Tag every resource so the whole stack is identifiable and easy to clean up.
  default_tags {
    tags = {
      Project   = var.name_prefix
      ManagedBy = "terraform"
      Stack     = var.name_prefix
    }
  }
}
