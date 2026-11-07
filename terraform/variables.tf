variable "aws_region" {
  description = "AWS region. Mumbai keeps health data (prescriptions) in India (DPDP Act)."
  type        = string
  default     = "ap-south-1"
}

variable "environment" {
  description = "Environment name"
  type        = string
  validation {
    condition     = contains(["staging", "production"], var.environment)
    error_message = "Environment must be staging or production."
  }
}

variable "project_name" {
  description = "Prefix for resource names"
  type        = string
  default     = "medrush"
}

variable "domain_name" {
  description = "Apex domain, e.g. medrush.in. API = api.<domain> (prod) / api.<env>.<domain>."
  type        = string
}

variable "create_hosted_zone" {
  description = "Create the Route53 hosted zone (then delegate NS at your registrar). False = look up an existing zone."
  type        = bool
  default     = false
}

# ── Network ────────────────────────────────────────────────────────────────

variable "vpc_cidr" {
  type    = string
  default = "10.20.0.0/16"
}

variable "public_subnet_cidrs" {
  type    = list(string)
  default = ["10.20.0.0/24", "10.20.1.0/24", "10.20.2.0/24"]
}

variable "private_subnet_cidrs" {
  type    = list(string)
  default = ["10.20.10.0/24", "10.20.11.0/24", "10.20.12.0/24"]
}

# ── API service (ECS Fargate) ──────────────────────────────────────────────

variable "container_name" {
  description = "Container name in the task definition (deploy workflow var ECS_CONTAINER_NAME)"
  type        = string
  default     = "medrush-api"
}

variable "app_port" {
  type    = number
  default = 5000
}

variable "image_tag" {
  description = "Image tag for the initial task definition. Later deploys come from the GitHub deploy workflow."
  type        = string
  default     = "bootstrap"
}

variable "cpu" {
  description = "Fargate task CPU units"
  type        = number
  default     = 512
}

variable "memory" {
  description = "Fargate task memory (MiB)"
  type        = number
  default     = 1024
}

variable "desired_count" {
  type    = number
  default = 2
}

variable "min_capacity" {
  type    = number
  default = 2
}

variable "max_capacity" {
  type    = number
  default = 6
}

variable "extra_app_secret_keys" {
  description = <<-EOT
    Extra keys to inject from the app secret as env vars, e.g.
    ["RAZORPAY_KEY_ID","RAZORPAY_KEY_SECRET","SMTP_PASSWORD"]. Add a key here
    only after it exists in the secret — ECS refuses to start tasks otherwise.
  EOT
  type        = list(string)
  default     = []
}

variable "extra_environment" {
  description = "Extra plain (non-secret) env vars for the API container"
  type        = map(string)
  default     = {}
}

# ── Data services ──────────────────────────────────────────────────────────

variable "enable_redis" {
  description = "ElastiCache Redis for shared rate limits/cache across tasks (the app degrades without it)"
  type        = bool
  default     = true
}

variable "redis_node_type" {
  type    = string
  default = "cache.t4g.micro"
}

variable "uploads_kms_key_arn" {
  description = "Optional customer-managed KMS key for the uploads bucket (default SSE-S3/AES256)"
  type        = string
  default     = null
}

# ── Web (Amplify Hosting) ──────────────────────────────────────────────────

variable "enable_amplify" {
  description = "Host the Next.js web app on Amplify (needs github_access_token)"
  type        = bool
  default     = true
}

variable "github_repository" {
  description = "owner/repo — used for the Amplify app and the GitHub OIDC deploy role"
  type        = string
}

variable "github_access_token" {
  description = "GitHub token Amplify uses to connect the repo (only needed at creation). Pass via TF_VAR_github_access_token."
  type        = string
  default     = null
  sensitive   = true
}

variable "web_branch" {
  description = "Git branch Amplify builds for this environment"
  type        = string
  default     = "main"
}

# ── CI/CD & ops ────────────────────────────────────────────────────────────

variable "create_github_oidc_provider" {
  description = "Create the account-wide GitHub OIDC provider (false if it already exists in the account)"
  type        = bool
  default     = true
}

variable "enable_waf" {
  description = "AWS WAF on the API load balancer (managed common rules + per-IP rate limit)"
  type        = bool
  default     = true
}

variable "waf_rate_limit_per_5min" {
  description = "Requests per 5 minutes per IP before WAF blocks"
  type        = number
  default     = 2000
}

variable "alarm_email" {
  description = "Email for CloudWatch alarm notifications (confirm the SNS subscription). Null = no email."
  type        = string
  default     = null
}

variable "log_retention_days" {
  type    = number
  default = 30
}
