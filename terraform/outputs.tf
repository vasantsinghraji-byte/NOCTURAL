output "api_url" {
  value = "https://${local.api_fqdn}"
}

output "web_urls" {
  value = local.web_origins
}

output "alb_dns_name" {
  value = aws_lb.api.dns_name
}

output "nat_public_ips" {
  description = "Add these to the MongoDB Atlas IP access list (egress IPs of the API tasks)"
  value       = module.vpc.nat_public_ips
}

output "uploads_bucket" {
  value = aws_s3_bucket.uploads.bucket
}

output "app_secret_arn" {
  description = "Put the Atlas MONGODB_URI (and Razorpay keys, etc.) into this secret"
  value       = aws_secretsmanager_secret.app.arn
}

output "hosted_zone_name_servers" {
  description = "Delegate these at your registrar when create_hosted_zone = true"
  value       = var.create_hosted_zone ? aws_route53_zone.main[0].name_servers : null
}

# ── Values for GitHub → Settings → Environments → <env> → Variables ────────

output "github_environment_variables" {
  value = {
    AWS_REGION          = var.aws_region
    AWS_DEPLOY_ROLE_ARN = aws_iam_role.github_deploy.arn
    ECR_REPOSITORY      = aws_ecr_repository.api.repository_url
    ECS_CLUSTER         = aws_ecs_cluster.main.name
    ECS_SERVICE         = aws_ecs_service.api.name
    ECS_CONTAINER_NAME  = var.container_name
    ECS_SUBNETS         = join(",", module.vpc.private_subnets)
    ECS_SECURITY_GROUP  = aws_security_group.app.id
    DEPLOY_HEALTH_URL   = "https://${local.api_fqdn}/api/v1/health"
  }
}

output "amplify_default_domain" {
  value = var.enable_amplify ? aws_amplify_app.web[0].default_domain : null
}

output "redis_primary_endpoint" {
  value     = var.enable_redis ? aws_elasticache_replication_group.redis[0].primary_endpoint_address : null
  sensitive = true
}
