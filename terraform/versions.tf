# MedRush on AWS (ap-south-1 / Mumbai)
#
#   Route53 ─┬─ api.<domain>  → WAF → ALB (public subnets) → ECS Fargate API (private subnets)
#            │                                                  ├─ S3 uploads bucket (private, SSE, via VPC endpoint)
#            │                                                  ├─ ElastiCache Redis (TLS + AUTH)
#            │                                                  ├─ Secrets Manager (injected as env vars)
#            │                                                  └─ NAT → MongoDB Atlas (AWS ap-south-1), Razorpay
#            └─ <domain>, www  → Amplify Hosting (Next.js SSR web app)
#
# Containers are stateless: nothing is stored on task disks. Data lives in
# Atlas (documents), S3 (files) and Redis (cache/rate limits, rebuildable).
#
# One state per environment (partial backend config):
#   terraform init -backend-config=backend/production.hcl
#   terraform apply -var-file=environments/production.tfvars

terraform {
  required_version = ">= 1.5"

  required_providers {
    aws = {
      source  = "hashicorp/aws"
      version = "~> 5.60"
    }
    random = {
      source  = "hashicorp/random"
      version = "~> 3.6"
    }
  }

  backend "s3" {}
}

provider "aws" {
  region = var.aws_region

  default_tags {
    tags = {
      Project     = "MedRush"
      Environment = var.environment
      ManagedBy   = "Terraform"
    }
  }
}

data "aws_caller_identity" "current" {}

data "aws_availability_zones" "available" {
  state = "available"
}

locals {
  name       = "${var.project_name}-${var.environment}"
  is_prod    = var.environment == "production"
  account_id = data.aws_caller_identity.current.account_id
  azs        = slice(data.aws_availability_zones.available.names, 0, 3)

  # Web and API share one registrable domain so SameSite=strict auth cookies
  # set by the API are sent from the web app (same-site, cross-origin).
  api_fqdn = local.is_prod ? "api.${var.domain_name}" : "api.${var.environment}.${var.domain_name}"
  web_origins = local.is_prod ? [
    "https://${var.domain_name}",
    "https://www.${var.domain_name}",
  ] : ["https://${var.environment}.${var.domain_name}"]
}
