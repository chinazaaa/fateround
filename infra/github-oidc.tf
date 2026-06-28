# GitHub Actions OIDC: lets the build workflow assume an AWS role to push the app
# image to ECR — no long-lived access keys stored anywhere (GitHub presents a
# short-lived OIDC token that AWS trusts).

variable "github_repo" {
  description = "GitHub repo allowed to assume the deploy role, as owner/name."
  type        = string
  default     = "chinazaaa/fateround"
}

variable "create_github_oidc_provider" {
  description = "Create the account-global GitHub OIDC provider. Set false in a second workspace (it already exists) to reference it via the data source instead."
  type        = bool
  default     = true
}

# Fetch the provider's TLS cert so the thumbprint stays current automatically.
data "tls_certificate" "github" {
  url = "https://token.actions.githubusercontent.com"
}

resource "aws_iam_openid_connect_provider" "github" {
  count           = var.create_github_oidc_provider ? 1 : 0
  url             = "https://token.actions.githubusercontent.com"
  client_id_list  = ["sts.amazonaws.com"]
  thumbprint_list = [data.tls_certificate.github.certificates[0].sha1_fingerprint]
}

data "aws_iam_openid_connect_provider" "github" {
  count = var.create_github_oidc_provider ? 0 : 1
  url   = "https://token.actions.githubusercontent.com"
}

locals {
  github_oidc_arn = var.create_github_oidc_provider ? aws_iam_openid_connect_provider.github[0].arn : data.aws_iam_openid_connect_provider.github[0].arn
}

# Trust policy: only this repo's branch builds can assume the role.
data "aws_iam_policy_document" "gha_assume" {
  statement {
    actions = ["sts:AssumeRoleWithWebIdentity"]
    principals {
      type        = "Federated"
      identifiers = [local.github_oidc_arn]
    }
    condition {
      test     = "StringEquals"
      variable = "token.actions.githubusercontent.com:aud"
      values   = ["sts.amazonaws.com"]
    }
    condition {
      # Only the deploy branches may assume the role (not any feature branch).
      test     = "StringEquals"
      variable = "token.actions.githubusercontent.com:sub"
      values = [
        "repo:${var.github_repo}:ref:refs/heads/dev",
        "repo:${var.github_repo}:ref:refs/heads/main",
      ]
    }
  }
}

resource "aws_iam_role" "gha_deploy" {
  name               = "${var.name_prefix}-gha-deploy"
  assume_role_policy = data.aws_iam_policy_document.gha_assume.json
  tags               = { Name = "${var.name_prefix}-gha-deploy" }
}

# Least-privilege: push images to this app's ECR repo only.
data "aws_iam_policy_document" "gha_ecr" {
  statement {
    sid       = "EcrAuth"
    actions   = ["ecr:GetAuthorizationToken"]
    resources = ["*"]
  }
  statement {
    sid = "EcrPush"
    actions = [
      "ecr:BatchCheckLayerAvailability",
      "ecr:InitiateLayerUpload",
      "ecr:UploadLayerPart",
      "ecr:CompleteLayerUpload",
      "ecr:PutImage",
      "ecr:BatchGetImage",
      "ecr:GetDownloadUrlForLayer",
    ]
    resources = [aws_ecr_repository.app.arn]
  }
}

resource "aws_iam_role_policy" "gha_ecr" {
  name   = "${var.name_prefix}-gha-ecr"
  role   = aws_iam_role.gha_deploy.id
  policy = data.aws_iam_policy_document.gha_ecr.json
}

output "github_actions_role_arn" {
  description = "Set as the GitHub repo variable AWS_DEPLOY_ROLE_ARN for the build workflow."
  value       = aws_iam_role.gha_deploy.arn
}
