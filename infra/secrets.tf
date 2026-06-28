# App configuration is stored in SSM Parameter Store and read by instances at
# boot. NEXT_PUBLIC_* values are public-by-design (they ship to the browser), so
# the URL is a plain String; the anon key and cron secret are SecureStrings.

resource "aws_ssm_parameter" "supabase_url" {
  name  = "/${var.name_prefix}/NEXT_PUBLIC_SUPABASE_URL"
  type  = "String"
  value = var.supabase_url
  tags  = { Name = "${var.name_prefix}-supabase-url" }
}

resource "aws_ssm_parameter" "supabase_anon_key" {
  name  = "/${var.name_prefix}/NEXT_PUBLIC_SUPABASE_ANON_KEY"
  type  = "SecureString"
  value = var.supabase_anon_key
  tags  = { Name = "${var.name_prefix}-supabase-anon-key" }
}

resource "aws_ssm_parameter" "cron_secret" {
  name  = "/${var.name_prefix}/CRON_SECRET"
  type  = "SecureString"
  value = var.cron_secret
  tags  = { Name = "${var.name_prefix}-cron-secret" }
}

resource "aws_ssm_parameter" "next_public_app_url" {
  name  = "/${var.name_prefix}/NEXT_PUBLIC_APP_URL"
  type  = "String"
  value = var.next_public_app_url
  tags  = { Name = "${var.name_prefix}-next-public-app-url" }
}

resource "aws_ssm_parameter" "next_public_livekit_url" {
  name  = "/${var.name_prefix}/NEXT_PUBLIC_LIVEKIT_URL"
  type  = "String"
  value = var.next_public_livekit_url
  tags  = { Name = "${var.name_prefix}-next-public-livekit-url" }
}

resource "aws_ssm_parameter" "supabase_service_role_key" {
  name  = "/${var.name_prefix}/SUPABASE_SERVICE_ROLE_KEY"
  type  = "SecureString"
  value = var.supabase_service_role_key
  tags  = { Name = "${var.name_prefix}-supabase-service-role-key" }
}

resource "aws_ssm_parameter" "admin_email" {
  name  = "/${var.name_prefix}/ADMIN_EMAIL"
  type  = "String"
  value = var.admin_email
  tags  = { Name = "${var.name_prefix}-admin-email" }
}

resource "aws_ssm_parameter" "admin_password" {
  name  = "/${var.name_prefix}/ADMIN_PASSWORD"
  type  = "SecureString"
  value = var.admin_password
  tags  = { Name = "${var.name_prefix}-admin-password" }
}

resource "aws_ssm_parameter" "admin_session_secret" {
  name  = "/${var.name_prefix}/ADMIN_SESSION_SECRET"
  type  = "SecureString"
  value = var.admin_session_secret
  tags  = { Name = "${var.name_prefix}-admin-session-secret" }
}

resource "aws_ssm_parameter" "klipy_api_key" {
  name  = "/${var.name_prefix}/KLIPY_API_KEY"
  type  = "SecureString"
  value = var.klipy_api_key
  tags  = { Name = "${var.name_prefix}-klipy-api-key" }
}

resource "aws_ssm_parameter" "livekit_api_key" {
  name  = "/${var.name_prefix}/LIVEKIT_API_KEY"
  type  = "SecureString"
  value = var.livekit_api_key
  tags  = { Name = "${var.name_prefix}-livekit-api-key" }
}

resource "aws_ssm_parameter" "livekit_api_secret" {
  name  = "/${var.name_prefix}/LIVEKIT_API_SECRET"
  type  = "SecureString"
  value = var.livekit_api_secret
  tags  = { Name = "${var.name_prefix}-livekit-api-secret" }
}
