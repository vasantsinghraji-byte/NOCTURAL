# Nabz staging without a domain: API + website on AWS App Runner (free HTTPS
# URLs), images built by CodeBuild (no Docker needed locally), MongoDB Atlas.
# See README.md in this folder for the step-by-step deploy.

terraform {
  required_version = ">= 1.5"
  required_providers {
    aws    = { source = "hashicorp/aws", version = "~> 5.60" }
    random = { source = "hashicorp/random", version = "~> 3.6" }
  }
  backend "s3" {} # bucket/key/region passed with -backend-config (see README)
}

provider "aws" {
  region = var.region
  default_tags {
    tags = { Project = "Nabz", Environment = var.environment, ManagedBy = "Terraform" }
  }
}

data "aws_caller_identity" "current" {}

locals {
  name      = "${var.project}-${var.environment}"
  account   = data.aws_caller_identity.current.account_id
  registry  = "${local.account}.dkr.ecr.${var.region}.amazonaws.com"
  web_url   = var.create_web ? "https://${aws_apprunner_service.web[0].service_url}" : ""
  api_url   = var.create_api ? "https://${aws_apprunner_service.api[0].service_url}" : ""
  generated = ["JWT_SECRET", "JWT_REFRESH_SECRET", "ENCRYPTION_KEY"]
}

# ── Secrets: generated here (never shown), plus the Atlas string stored by hand ──
resource "random_password" "jwt" {
  length  = 64
  special = false
}

resource "random_password" "jwt_refresh" {
  length  = 64
  special = false
}

resource "random_id" "encryption_key" {
  byte_length = 32 # 64 hex chars (AES-256)
}

resource "aws_secretsmanager_secret" "generated" {
  for_each                = toset(local.generated)
  name                    = "${var.project}/${var.environment}/${each.key}"
  recovery_window_in_days = 7
}

resource "aws_secretsmanager_secret_version" "generated" {
  for_each  = toset(local.generated)
  secret_id = aws_secretsmanager_secret.generated[each.key].id
  secret_string = {
    JWT_SECRET         = random_password.jwt.result
    JWT_REFRESH_SECRET = random_password.jwt_refresh.result
    ENCRYPTION_KEY     = random_id.encryption_key.hex
  }[each.key]
}

data "aws_secretsmanager_secret" "mongodb_uri" {
  name = var.mongodb_uri_secret_name
}

# ── Container registries ─────────────────────────────────────────────────────
resource "aws_ecr_repository" "repo" {
  for_each             = toset(["api", "web"])
  name                 = "${local.name}-${each.key}"
  image_tag_mutability = "MUTABLE"
  force_delete         = true
  image_scanning_configuration {
    scan_on_push = true
  }
  encryption_configuration {
    encryption_type = "AES256"
  }
}

resource "aws_ecr_lifecycle_policy" "repo" {
  for_each   = aws_ecr_repository.repo
  repository = each.value.name
  policy = jsonencode({
    rules = [{
      rulePriority = 1
      description  = "Keep the last 10 images"
      selection    = { tagStatus = "any", countType = "imageCountMoreThan", countNumber = 10 }
      action       = { type = "expire" }
    }]
  })
}

# ── S3: private uploads (prescriptions) + build sources ─────────────────────
resource "aws_s3_bucket" "uploads" {
  bucket = "${local.name}-uploads-${local.account}"
}

resource "aws_s3_bucket" "build" {
  bucket        = "${local.name}-build-${local.account}"
  force_destroy = true
}

locals {
  buckets = { uploads = aws_s3_bucket.uploads, build = aws_s3_bucket.build }
}

resource "aws_s3_bucket_public_access_block" "all" {
  for_each                = local.buckets
  bucket                  = each.value.id
  block_public_acls       = true
  block_public_policy     = true
  ignore_public_acls      = true
  restrict_public_buckets = true
}

resource "aws_s3_bucket_ownership_controls" "all" {
  for_each = local.buckets
  bucket   = each.value.id
  rule {
    object_ownership = "BucketOwnerEnforced"
  }
}

resource "aws_s3_bucket_server_side_encryption_configuration" "all" {
  for_each = local.buckets
  bucket   = each.value.id
  rule {
    apply_server_side_encryption_by_default {
      sse_algorithm = "AES256"
    }
  }
}

resource "aws_s3_bucket_versioning" "uploads" {
  bucket = aws_s3_bucket.uploads.id
  versioning_configuration {
    status = "Enabled"
  }
}

resource "aws_s3_bucket_lifecycle_configuration" "build" {
  bucket = aws_s3_bucket.build.id
  rule {
    id     = "expire-build-sources"
    status = "Enabled"
    filter {}
    expiration {
      days = 14
    }
  }
}

resource "aws_s3_bucket_policy" "tls_only" {
  for_each = local.buckets
  bucket   = each.value.id
  policy = jsonencode({
    Version = "2012-10-17"
    Statement = [{
      Sid       = "DenyInsecureTransport"
      Effect    = "Deny"
      Principal = "*"
      Action    = "s3:*"
      Resource  = [each.value.arn, "${each.value.arn}/*"]
      Condition = { Bool = { "aws:SecureTransport" = "false" } }
    }]
  })
  depends_on = [aws_s3_bucket_public_access_block.all]
}

# ── CodeBuild: builds the api / web images from a source zip in S3 ──────────
resource "aws_cloudwatch_log_group" "build" {
  name              = "/codebuild/${local.name}-images"
  retention_in_days = 14
}

resource "aws_iam_role" "codebuild" {
  name = "${local.name}-codebuild"
  assume_role_policy = jsonencode({
    Version   = "2012-10-17"
    Statement = [{ Effect = "Allow", Principal = { Service = "codebuild.amazonaws.com" }, Action = "sts:AssumeRole" }]
  })
}

resource "aws_iam_role_policy" "codebuild" {
  name = "build-and-push"
  role = aws_iam_role.codebuild.id
  policy = jsonencode({
    Version = "2012-10-17"
    Statement = [
      { Effect = "Allow", Action = ["logs:CreateLogStream", "logs:PutLogEvents"], Resource = "${aws_cloudwatch_log_group.build.arn}:*" },
      { Effect = "Allow", Action = ["s3:GetObject", "s3:GetObjectVersion"], Resource = "${aws_s3_bucket.build.arn}/*" },
      { Effect = "Allow", Action = ["ecr:GetAuthorizationToken"], Resource = "*" },
      {
        Effect = "Allow"
        Action = [
          "ecr:BatchCheckLayerAvailability", "ecr:CompleteLayerUpload", "ecr:InitiateLayerUpload",
          "ecr:PutImage", "ecr:UploadLayerPart", "ecr:BatchGetImage", "ecr:GetDownloadUrlForLayer"
        ]
        Resource = [for r in aws_ecr_repository.repo : r.arn]
      }
    ]
  })
}

resource "aws_codebuild_project" "images" {
  name          = "${local.name}-images"
  service_role  = aws_iam_role.codebuild.arn
  build_timeout = 30

  artifacts {
    type = "NO_ARTIFACTS"
  }

  environment {
    compute_type    = "BUILD_GENERAL1_MEDIUM"
    image           = "aws/codebuild/amazonlinux2-x86_64-standard:5.0"
    type            = "LINUX_CONTAINER"
    privileged_mode = true # docker build

    environment_variable {
      name  = "ECR_REGISTRY"
      value = local.registry
    }
    environment_variable {
      name  = "API_REPO"
      value = aws_ecr_repository.repo["api"].name
    }
    environment_variable {
      name  = "WEB_REPO"
      value = aws_ecr_repository.repo["web"].name
    }
    environment_variable {
      name  = "NODE_IMAGE"
      value = "public.ecr.aws/docker/library/node:22-alpine" # Docker Hub rate-limits shared build hosts
    }
    environment_variable {
      name  = "TARGET"
      value = "api" # overridden per build: api | web
    }
    environment_variable {
      name  = "API_ORIGIN"
      value = "none" # web builds override with https://<api host>
    }
  }

  source {
    type      = "S3"
    location  = "${aws_s3_bucket.build.id}/source.zip"
    buildspec = file("${path.module}/buildspec.yml")
  }

  logs_config {
    cloudwatch_logs {
      group_name = aws_cloudwatch_log_group.build.name
    }
  }
}

# ── App Runner roles ────────────────────────────────────────────────────────
resource "aws_iam_role" "apprunner_access" {
  name = "${local.name}-apprunner-ecr"
  assume_role_policy = jsonencode({
    Version   = "2012-10-17"
    Statement = [{ Effect = "Allow", Principal = { Service = "build.apprunner.amazonaws.com" }, Action = "sts:AssumeRole" }]
  })
}

resource "aws_iam_role_policy_attachment" "apprunner_access" {
  role       = aws_iam_role.apprunner_access.name
  policy_arn = "arn:aws:iam::aws:policy/service-role/AWSAppRunnerServicePolicyForECRAccess"
}

resource "aws_iam_role" "api_instance" {
  name = "${local.name}-api-instance"
  assume_role_policy = jsonencode({
    Version   = "2012-10-17"
    Statement = [{ Effect = "Allow", Principal = { Service = "tasks.apprunner.amazonaws.com" }, Action = "sts:AssumeRole" }]
  })
}

# Least privilege: read its own secrets, read/write only its uploads bucket.
resource "aws_iam_role_policy" "api_instance" {
  name = "secrets-and-uploads"
  role = aws_iam_role.api_instance.id
  policy = jsonencode({
    Version = "2012-10-17"
    Statement = [
      {
        Effect   = "Allow"
        Action   = ["secretsmanager:GetSecretValue"]
        Resource = concat([for s in aws_secretsmanager_secret.generated : s.arn], [data.aws_secretsmanager_secret.mongodb_uri.arn])
      },
      { Effect = "Allow", Action = ["s3:PutObject", "s3:GetObject", "s3:DeleteObject"], Resource = "${aws_s3_bucket.uploads.arn}/*" },
      { Effect = "Allow", Action = ["s3:ListBucket"], Resource = aws_s3_bucket.uploads.arn }
    ]
  })
}

resource "aws_apprunner_auto_scaling_configuration_version" "small" {
  auto_scaling_configuration_name = "${local.name}-small"
  min_size                        = 1
  max_size                        = 2
  max_concurrency                 = 100
}

# ── App Runner services ─────────────────────────────────────────────────────
resource "aws_apprunner_service" "api" {
  count        = var.create_api ? 1 : 0
  service_name = "${local.name}-api"

  source_configuration {
    auto_deployments_enabled = true # a new :latest image redeploys automatically
    authentication_configuration {
      access_role_arn = aws_iam_role.apprunner_access.arn
    }
    image_repository {
      image_identifier      = "${aws_ecr_repository.repo["api"].repository_url}:latest"
      image_repository_type = "ECR"
      image_configuration {
        port = "5000"
        runtime_environment_variables = {
          NODE_ENV          = "production"
          PORT              = "5000"
          MONGODB_DB_NAME   = var.mongodb_db_name
          ALLOWED_ORIGINS   = var.create_web ? local.web_url : "https://placeholder.invalid"
          APP_URL           = var.create_web ? local.web_url : "https://placeholder.invalid"
          STORAGE_PROVIDER  = "s3"
          S3_UPLOADS_BUCKET = aws_s3_bucket.uploads.id
          AWS_REGION        = var.region
          REDIS_ENABLED     = "false"
          RAZORPAY_ENABLED  = "false"
          LOG_LEVEL         = "info"
          # STAGING ONLY: test stores deliver India-wide so testers anywhere can order supplies.
          SERVICEABILITY_TEST_RADIUS_KM = tostring(var.test_store_radius_km)
          # Testers need time to open the partner app; production default is 180s.
          PHARMACY_ACCEPT_SLA_SECONDS = tostring(var.pharmacy_accept_sla_seconds)
        }
        runtime_environment_secrets = merge(
          { for k in local.generated : k => aws_secretsmanager_secret.generated[k].arn },
          { MONGODB_URI = data.aws_secretsmanager_secret.mongodb_uri.arn }
        )
      }
    }
  }

  instance_configuration {
    cpu               = "1024"
    memory            = "2048"
    instance_role_arn = aws_iam_role.api_instance.arn
  }

  health_check_configuration {
    protocol            = "HTTP"
    path                = "/api/v1/health"
    interval            = 10
    timeout             = 5
    healthy_threshold   = 1
    unhealthy_threshold = 10
  }

  auto_scaling_configuration_arn = aws_apprunner_auto_scaling_configuration_version.small.arn
  depends_on                     = [aws_iam_role_policy_attachment.apprunner_access, aws_secretsmanager_secret_version.generated]
}

resource "aws_apprunner_service" "web" {
  count        = var.create_web ? 1 : 0
  service_name = "${local.name}-web"

  source_configuration {
    auto_deployments_enabled = true
    authentication_configuration {
      access_role_arn = aws_iam_role.apprunner_access.arn
    }
    image_repository {
      image_identifier      = "${aws_ecr_repository.repo["web"].repository_url}:latest"
      image_repository_type = "ECR"
      image_configuration {
        port = "3000"
      }
    }
  }

  instance_configuration {
    cpu    = "512"
    memory = "1024"
  }

  health_check_configuration {
    protocol            = "HTTP"
    path                = "/"
    interval            = 10
    timeout             = 5
    healthy_threshold   = 1
    unhealthy_threshold = 10
  }

  auto_scaling_configuration_arn = aws_apprunner_auto_scaling_configuration_version.small.arn
  depends_on                     = [aws_iam_role_policy_attachment.apprunner_access]
}
