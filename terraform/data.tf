# Stateful services. The API containers keep nothing on disk:
#   documents → MongoDB Atlas (outside Terraform; see docs/MEDRUSH_AWS_DEPLOYMENT.md)
#   files     → S3 (below)
#   cache     → ElastiCache Redis (below; safe to lose)
#   secrets   → Secrets Manager (below)

# ── S3: uploads (prescriptions, reports, profile photos) ───────────────────

resource "aws_s3_bucket" "uploads" {
  # Account id suffix keeps the globally-unique name collision-free.
  bucket = "${local.name}-uploads-${local.account_id}"

  lifecycle {
    prevent_destroy = true
  }
}

resource "aws_s3_bucket_public_access_block" "uploads" {
  bucket                  = aws_s3_bucket.uploads.id
  block_public_acls       = true
  block_public_policy     = true
  ignore_public_acls      = true
  restrict_public_buckets = true
}

resource "aws_s3_bucket_ownership_controls" "uploads" {
  bucket = aws_s3_bucket.uploads.id
  rule {
    object_ownership = "BucketOwnerEnforced"
  }
}

resource "aws_s3_bucket_server_side_encryption_configuration" "uploads" {
  bucket = aws_s3_bucket.uploads.id
  rule {
    apply_server_side_encryption_by_default {
      sse_algorithm     = var.uploads_kms_key_arn == null ? "AES256" : "aws:kms"
      kms_master_key_id = var.uploads_kms_key_arn
    }
    bucket_key_enabled = var.uploads_kms_key_arn != null
  }
}

resource "aws_s3_bucket_versioning" "uploads" {
  bucket = aws_s3_bucket.uploads.id
  versioning_configuration {
    status = "Enabled"
  }
}

resource "aws_s3_bucket_lifecycle_configuration" "uploads" {
  bucket = aws_s3_bucket.uploads.id

  rule {
    id     = "expire-old-versions"
    status = "Enabled"
    filter {}
    noncurrent_version_expiration {
      noncurrent_days = 90
    }
    abort_incomplete_multipart_upload {
      days_after_initiation = 7
    }
  }
}

# Refuse any non-TLS access to health data.
data "aws_iam_policy_document" "uploads_tls_only" {
  statement {
    sid     = "DenyInsecureTransport"
    effect  = "Deny"
    actions = ["s3:*"]
    resources = [
      aws_s3_bucket.uploads.arn,
      "${aws_s3_bucket.uploads.arn}/*",
    ]
    principals {
      type        = "*"
      identifiers = ["*"]
    }
    condition {
      test     = "Bool"
      variable = "aws:SecureTransport"
      values   = ["false"]
    }
  }
}

resource "aws_s3_bucket_policy" "uploads" {
  bucket     = aws_s3_bucket.uploads.id
  policy     = data.aws_iam_policy_document.uploads_tls_only.json
  depends_on = [aws_s3_bucket_public_access_block.uploads]
}

# ── Redis (ElastiCache, TLS + AUTH) ────────────────────────────────────────

resource "random_password" "redis_auth" {
  count   = var.enable_redis ? 1 : 0
  length  = 48
  special = false
}

resource "aws_elasticache_subnet_group" "redis" {
  count      = var.enable_redis ? 1 : 0
  name       = "${local.name}-redis"
  subnet_ids = module.vpc.private_subnets
}

resource "aws_elasticache_replication_group" "redis" {
  count                = var.enable_redis ? 1 : 0
  replication_group_id = "${local.name}-redis"
  description          = "MedRush rate limits and cache"
  engine               = "redis"
  engine_version       = "7.1"
  node_type            = var.redis_node_type
  port                 = 6379
  parameter_group_name = "default.redis7"

  # Production: primary + replica across AZs with automatic failover.
  num_cache_clusters         = local.is_prod ? 2 : 1
  automatic_failover_enabled = local.is_prod
  multi_az_enabled           = local.is_prod

  subnet_group_name  = aws_elasticache_subnet_group.redis[0].name
  security_group_ids = [aws_security_group.redis[0].id]

  at_rest_encryption_enabled = true
  transit_encryption_enabled = true
  auth_token                 = random_password.redis_auth[0].result

  snapshot_retention_limit = local.is_prod ? 3 : 0
  apply_immediately        = !local.is_prod
}

# ── Secrets Manager ────────────────────────────────────────────────────────
#
# One JSON secret per environment. Terraform seeds generated values once;
# afterwards the secret is owned by operators (ignore_changes), e.g.:
#   aws secretsmanager put-secret-value --secret-id <arn> --secret-string file://secret.json
# MONGODB_URI starts as a placeholder: tasks fail fast at startup until the
# Atlas connection string is set (config/validateEnv.js).

resource "random_password" "jwt_secret" {
  length  = 96
  special = false
}

resource "random_id" "encryption_key" {
  byte_length = 32
}

resource "aws_secretsmanager_secret" "app" {
  name                    = "${var.project_name}/${var.environment}/app"
  description             = "MedRush API secrets (injected into ECS tasks as env vars)"
  recovery_window_in_days = local.is_prod ? 30 : 7
}

resource "aws_secretsmanager_secret_version" "app_initial" {
  secret_id = aws_secretsmanager_secret.app.id
  secret_string = jsonencode(merge(
    {
      MONGODB_URI    = "SET_ME: Atlas SRV connection string (Atlas > Connect > Drivers)"
      JWT_SECRET     = random_password.jwt_secret.result
      ENCRYPTION_KEY = random_id.encryption_key.hex
    },
    var.enable_redis ? {
      REDIS_PASSWORD = random_password.redis_auth[0].result
      REDIS_URL      = "rediss://:${random_password.redis_auth[0].result}@${aws_elasticache_replication_group.redis[0].primary_endpoint_address}:6379"
    } : {}
  ))

  lifecycle {
    ignore_changes = [secret_string]
  }
}
