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
