terraform {
  required_version = ">= 1.5.0"

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

  # Remote state is strongly recommended for shared/production infra. Configure
  # an S3 backend (with a DynamoDB lock table) and run `terraform init`. Left as
  # a partial config so you can pass -backend-config without editing this file.
  #
  # backend "s3" {
  #   bucket         = "fateround-tfstate"
  #   key            = "infra/terraform.tfstate"
  #   region         = "us-east-1"
  #   dynamodb_table = "fateround-tflock"
  #   encrypt        = true
  # }
}
