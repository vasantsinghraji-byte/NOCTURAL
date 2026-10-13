# Nabz real-time chat and calls (staging).
#
# - AppSync Events API (managed WebSockets): App Runner can't hold WebSocket
#   connections, so the apps connect here. Clients authenticate with short-lived
#   tokens from our API, checked by a Lambda authorizer; the API publishes with
#   its IAM role.
# - TURN relay (coturn on a small EC2 instance) so WebRTC voice calls connect on
#   mobile networks that block direct peer-to-peer traffic.
#
# Separate from apprunner-staging so this needs AWS provider 6.x without
# touching the existing stack. Apply this first; apprunner-staging reads its
# outputs from the remote state.

terraform {
  required_version = ">= 1.6"
  required_providers {
    aws     = { source = "hashicorp/aws", version = "~> 6.14" }
    archive = { source = "hashicorp/archive", version = "~> 2.7" }
    random  = { source = "hashicorp/random", version = "~> 3.6" }
  }
  backend "s3" {}
}

provider "aws" {
  region = var.region
  default_tags {
    tags = { Project = var.project, Environment = var.environment, ManagedBy = "terraform", Stack = "realtime" }
  }
}

data "aws_caller_identity" "current" {}

locals {
  name    = "${var.project}-${var.environment}"
  account = data.aws_caller_identity.current.account_id
}

# ── Secrets (generated, never shown) ───────────────────────────────────────

resource "random_password" "token" {
  length  = 64
  special = false
}

resource "random_password" "turn" {
  length  = 48
  special = false
}

resource "aws_secretsmanager_secret" "token" {
  name                    = "${var.project}/${var.environment}/REALTIME_TOKEN_SECRET"
  description             = "Signs Nabz real-time channel tokens (API issues, Lambda authorizer checks)"
  recovery_window_in_days = 7
}

resource "aws_secretsmanager_secret_version" "token" {
  secret_id     = aws_secretsmanager_secret.token.id
  secret_string = random_password.token.result
}

resource "aws_secretsmanager_secret" "turn" {
  name                    = "${var.project}/${var.environment}/TURN_SECRET"
  description             = "coturn shared secret for short-lived TURN credentials"
  recovery_window_in_days = 7
}

resource "aws_secretsmanager_secret_version" "turn" {
  secret_id     = aws_secretsmanager_secret.turn.id
  secret_string = random_password.turn.result
}

# ── Lambda authorizer ──────────────────────────────────────────────────────

data "archive_file" "authorizer" {
  type        = "zip"
  source_file = "${path.module}/../../infra/realtime-authorizer/index.js"
  output_path = "${path.module}/.build/realtime-authorizer.zip"
}

resource "aws_iam_role" "authorizer" {
  name = "${local.name}-realtime-authorizer"
  assume_role_policy = jsonencode({
    Version   = "2012-10-17"
    Statement = [{ Effect = "Allow", Principal = { Service = "lambda.amazonaws.com" }, Action = "sts:AssumeRole" }]
  })
}

resource "aws_iam_role_policy" "authorizer" {
  name = "logs-and-token-secret"
  role = aws_iam_role.authorizer.id
  policy = jsonencode({
    Version = "2012-10-17"
    Statement = [
      { Effect = "Allow", Action = ["logs:CreateLogGroup", "logs:CreateLogStream", "logs:PutLogEvents"], Resource = "arn:aws:logs:${var.region}:${local.account}:*" },
      { Effect = "Allow", Action = ["secretsmanager:GetSecretValue"], Resource = aws_secretsmanager_secret.token.arn }
    ]
  })
}

resource "aws_cloudwatch_log_group" "authorizer" {
  name              = "/aws/lambda/${local.name}-realtime-authorizer"
  retention_in_days = 14
}

resource "aws_lambda_function" "authorizer" {
  function_name    = "${local.name}-realtime-authorizer"
  role             = aws_iam_role.authorizer.arn
  runtime          = "nodejs22.x"
  architectures    = ["arm64"]
  handler          = "index.handler"
  filename         = data.archive_file.authorizer.output_path
  source_code_hash = data.archive_file.authorizer.output_base64sha256
  memory_size      = 256
  timeout          = 5
  environment {
    variables = { TOKEN_SECRET_ARN = aws_secretsmanager_secret.token.arn }
  }
  depends_on = [aws_cloudwatch_log_group.authorizer, aws_iam_role_policy.authorizer]
}

resource "aws_lambda_permission" "appsync" {
  statement_id  = "AllowAppSyncEvents"
  action        = "lambda:InvokeFunction"
  function_name = aws_lambda_function.authorizer.function_name
  principal     = "appsync.amazonaws.com"
  source_arn    = aws_appsync_api.realtime.api_arn
}

# ── AppSync Events API ─────────────────────────────────────────────────────

resource "aws_appsync_api" "realtime" {
  name = "${local.name}-realtime"
  event_config {
    auth_provider {
      auth_type = "AWS_LAMBDA"
      lambda_authorizer_config {
        authorizer_uri                   = aws_lambda_function.authorizer.arn
        authorizer_result_ttl_in_seconds = 300
        # Our tokens: base64url "." base64url. Anything else is rejected before the Lambda runs.
        identity_validation_expression = "^[A-Za-z0-9_-]{20,4000}\\.[A-Za-z0-9_-]{20,100}$"
      }
    }
    auth_provider {
      auth_type = "AWS_IAM"
    }
    connection_auth_mode {
      auth_type = "AWS_LAMBDA"
    }
    default_publish_auth_mode {
      auth_type = "AWS_IAM"
    }
    default_subscribe_auth_mode {
      auth_type = "AWS_LAMBDA"
    }
  }
}

# Apps subscribe with their token; publishing is the API (IAM) or, on call
# channels only, the two phones (token lists the channel; Lambda checks it).
resource "aws_appsync_channel_namespace" "nabz" {
  api_id = aws_appsync_api.realtime.api_id
  name   = "nabz"
  publish_auth_mode {
    auth_type = "AWS_IAM"
  }
  publish_auth_mode {
    auth_type = "AWS_LAMBDA"
  }
  subscribe_auth_mode {
    auth_type = "AWS_LAMBDA"
  }
}

# The API (App Runner instance role) publishes over HTTP with IAM.
data "aws_iam_role" "api_instance" {
  name = "${local.name}-api-instance"
}

resource "aws_iam_role_policy" "api_publish" {
  name = "realtime-publish"
  role = data.aws_iam_role.api_instance.id
  policy = jsonencode({
    Version = "2012-10-17"
    Statement = [{
      Effect   = "Allow"
      Action   = ["appsync:EventPublish"]
      Resource = ["${aws_appsync_api.realtime.api_arn}/channelNamespace/${aws_appsync_channel_namespace.nabz.name}"]
    }]
  })
}

# ── TURN relay (coturn) ────────────────────────────────────────────────────

data "aws_ssm_parameter" "ubuntu" {
  name = "/aws/service/canonical/ubuntu/server/24.04/stable/current/arm64/hvm/ebs-gp3/ami-id"
}

data "aws_vpc" "default" {
  default = true
}

data "aws_subnets" "default" {
  filter {
    name   = "vpc-id"
    values = [data.aws_vpc.default.id]
  }
  filter {
    name   = "default-for-az"
    values = ["true"]
  }
}

resource "aws_security_group" "turn" {
  name        = "${local.name}-turn"
  description = "TURN/STUN for Nabz voice calls"
  vpc_id      = data.aws_vpc.default.id

  ingress {
    description = "STUN/TURN UDP"
    from_port   = 3478
    to_port     = 3478
    protocol    = "udp"
    cidr_blocks = ["0.0.0.0/0"]
  }
  ingress {
    description = "STUN/TURN TCP (networks that block UDP)"
    from_port   = 3478
    to_port     = 3478
    protocol    = "tcp"
    cidr_blocks = ["0.0.0.0/0"]
  }
  ingress {
    description = "Relayed media"
    from_port   = var.turn_min_port
    to_port     = var.turn_max_port
    protocol    = "udp"
    cidr_blocks = ["0.0.0.0/0"]
  }
  egress {
    from_port   = 0
    to_port     = 0
    protocol    = "-1"
    cidr_blocks = ["0.0.0.0/0"]
  }
}

resource "aws_iam_role" "turn" {
  name = "${local.name}-turn"
  assume_role_policy = jsonencode({
    Version   = "2012-10-17"
    Statement = [{ Effect = "Allow", Principal = { Service = "ec2.amazonaws.com" }, Action = "sts:AssumeRole" }]
  })
}

resource "aws_iam_role_policy" "turn_secret" {
  name = "turn-secret"
  role = aws_iam_role.turn.id
  policy = jsonencode({
    Version   = "2012-10-17"
    Statement = [{ Effect = "Allow", Action = ["secretsmanager:GetSecretValue"], Resource = aws_secretsmanager_secret.turn.arn }]
  })
}

# Admin access through Session Manager: no SSH port, no key pair.
resource "aws_iam_role_policy_attachment" "turn_ssm" {
  role       = aws_iam_role.turn.name
  policy_arn = "arn:aws:iam::aws:policy/AmazonSSMManagedInstanceCore"
}

resource "aws_iam_instance_profile" "turn" {
  name = "${local.name}-turn"
  role = aws_iam_role.turn.name
}

resource "aws_eip" "turn" {
  domain = "vpc"
  tags   = { Name = "${local.name}-turn" }
}

resource "aws_instance" "turn" {
  ami                         = data.aws_ssm_parameter.ubuntu.value
  instance_type               = var.turn_instance_type
  subnet_id                   = data.aws_subnets.default.ids[0]
  vpc_security_group_ids      = [aws_security_group.turn.id]
  iam_instance_profile        = aws_iam_instance_profile.turn.name
  associate_public_ip_address = true
  user_data_replace_on_change = true
  user_data = templatefile("${path.module}/turn-init.sh.tftpl", {
    region     = var.region
    secret_arn = aws_secretsmanager_secret.turn.arn
    public_ip  = aws_eip.turn.public_ip
    min_port   = var.turn_min_port
    max_port   = var.turn_max_port
  })
  metadata_options {
    http_tokens = "required" # IMDSv2 only
  }
  root_block_device {
    volume_size = 8
    volume_type = "gp3"
    encrypted   = true
  }
  tags = { Name = "${local.name}-turn" }

  lifecycle {
    ignore_changes = [ami] # don't replace the relay every time Ubuntu publishes a new image
  }
}

resource "aws_eip_association" "turn" {
  instance_id   = aws_instance.turn.id
  allocation_id = aws_eip.turn.id
}
