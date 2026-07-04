terraform {
  required_version = ">= 1.11.0" # use_lockfile (S3-native state locking) needs >= 1.11

  required_providers {
    aws = {
      source  = "hashicorp/aws"
      version = "~> 5.40"
    }
    cloudflare = {
      source  = "cloudflare/cloudflare"
      version = "~> 4.40"
    }
    tls = {
      source  = "hashicorp/tls"
      version = "~> 4.0"
    }
  }

  # Remote state in S3 — shared, durable, and reusable across machines/worktrees
  # (survives deleting the local worktree). State locking uses S3 conditional
  # writes (use_lockfile), so no DynamoDB lock table is needed on Terraform >= 1.11.
  # Workspaces are stored under env:/<workspace>/infra/terraform.tfstate in the
  # same bucket (default -> infra/terraform.tfstate). Bucket is versioned +
  # encrypted (SSE-S3) + public-access-blocked + TLS-only; bootstrapped out of band
  # (see infra/README bootstrap notes) to avoid a chicken-and-egg with this state.
  backend "s3" {
    bucket       = "fateround-tfstate"
    key          = "infra/terraform.tfstate"
    region       = "us-east-1"
    encrypt      = true
    use_lockfile = true
  }
}
