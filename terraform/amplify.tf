# Next.js web app on Amplify Hosting (SSR, CDN, custom domain, auto-build on push).
# Monorepo: the app lives in frontends/web and imports ../shared from source.

resource "aws_amplify_app" "web" {
  count        = var.enable_amplify ? 1 : 0
  name         = "${local.name}-web"
  repository   = "https://github.com/${var.github_repository}"
  access_token = var.github_access_token
  platform     = "WEB_COMPUTE"

  build_spec = <<-YAML
    version: 1
    applications:
      - appRoot: frontends/web
        frontend:
          phases:
            preBuild:
              commands:
                - nvm install 22 && nvm use 22
                - npm ci
            build:
              commands:
                - npm run build
          artifacts:
            baseDirectory: .next
            files:
              - '**/*'
          cache:
            paths:
              - node_modules/**/*
              - .next/cache/**/*
  YAML

  environment_variables = {
    AMPLIFY_MONOREPO_APP_ROOT = "frontends/web"
    NEXT_PUBLIC_API_BASE_URL  = "https://${local.api_fqdn}"
  }

  lifecycle {
    # The token is only needed to connect the repo on creation.
    ignore_changes = [access_token]
  }
}

resource "aws_amplify_branch" "web" {
  count             = var.enable_amplify ? 1 : 0
  app_id            = aws_amplify_app.web[0].id
  branch_name       = var.web_branch
  framework         = "Next.js - SSR"
  stage             = local.is_prod ? "PRODUCTION" : "BETA"
  enable_auto_build = true
}

# Amplify issues the certificate and, for a Route53 zone in this account,
# creates the DNS records itself.
resource "aws_amplify_domain_association" "web" {
  count                 = var.enable_amplify ? 1 : 0
  app_id                = aws_amplify_app.web[0].id
  domain_name           = var.domain_name
  wait_for_verification = false

  dynamic "sub_domain" {
    for_each = local.is_prod ? ["", "www"] : [var.environment]
    content {
      branch_name = aws_amplify_branch.web[0].branch_name
      prefix      = sub_domain.value
    }
  }
}
