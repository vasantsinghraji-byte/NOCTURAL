# ── Web application firewall (AWS WAF) in front of both App Runner services ──
#
# Layers, in order:
#   1. IP reputation      AWS list of known attacker / botnet IPs
#   2. Common rules       OWASP-style attacks (XSS, bad paths, LFI/RFI, ...)
#   3. Known bad inputs   exploit payloads (Log4j, Java deserialisation, ...)
#   4. SQL injection      cheap extra net for injection-shaped input
#   5. Sign-in flood      per-IP cap on login / OTP / password-reset endpoints
#   6. Request flood      per-IP cap on everything
#
# Limits are generous because many Indian mobile users share one public IP
# (carrier-grade NAT); per-account lockouts in the app handle brute force.
# Upload endpoints send bodies larger than 8 KB, so the common set's body-size
# rule only counts. Cost: about $5/month per web ACL + $1/rule + $0.60 per
# million requests.

resource "aws_wafv2_web_acl" "main" {
  name        = "${local.name}-waf"
  description = "Nabz ${var.environment}: managed protections and flood limits"
  scope       = "REGIONAL"

  default_action {
    allow {}
  }

  rule {
    name     = "aws-ip-reputation"
    priority = 0
    override_action {
      none {}
    }
    statement {
      managed_rule_group_statement {
        vendor_name = "AWS"
        name        = "AWSManagedRulesAmazonIpReputationList"
      }
    }
    visibility_config {
      cloudwatch_metrics_enabled = true
      metric_name                = "ip-reputation"
      sampled_requests_enabled   = true
    }
  }

  rule {
    name     = "aws-common"
    priority = 1
    override_action {
      none {}
    }
    statement {
      managed_rule_group_statement {
        vendor_name = "AWS"
        name        = "AWSManagedRulesCommonRuleSet"
        # Photos and documents are uploaded as multipart bodies up to 10 MB.
        rule_action_override {
          name = "SizeRestrictions_BODY"
          action_to_use {
            count {}
          }
        }
      }
    }
    visibility_config {
      cloudwatch_metrics_enabled = true
      metric_name                = "common"
      sampled_requests_enabled   = true
    }
  }

  rule {
    name     = "aws-known-bad-inputs"
    priority = 2
    override_action {
      none {}
    }
    statement {
      managed_rule_group_statement {
        vendor_name = "AWS"
        name        = "AWSManagedRulesKnownBadInputsRuleSet"
      }
    }
    visibility_config {
      cloudwatch_metrics_enabled = true
      metric_name                = "known-bad-inputs"
      sampled_requests_enabled   = true
    }
  }

  rule {
    name     = "aws-sqli"
    priority = 3
    override_action {
      none {}
    }
    statement {
      managed_rule_group_statement {
        vendor_name = "AWS"
        name        = "AWSManagedRulesSQLiRuleSet"
      }
    }
    visibility_config {
      cloudwatch_metrics_enabled = true
      metric_name                = "sqli"
      sampled_requests_enabled   = true
    }
  }

  rule {
    name     = "signin-flood"
    priority = 4
    action {
      block {
        custom_response {
          response_code = 429
        }
      }
    }
    statement {
      rate_based_statement {
        limit                 = var.waf_signin_limit_per_5min
        aggregate_key_type    = "IP"
        evaluation_window_sec = 300
        scope_down_statement {
          regex_match_statement {
            regex_string = "^/api/(v1/)?(auth/(login|social/phone/(start|verify)|password/.*|admin-mfa/.*)|patients/(login|register))$"
            field_to_match {
              uri_path {}
            }
            text_transformation {
              priority = 0
              type     = "LOWERCASE"
            }
          }
        }
      }
    }
    visibility_config {
      cloudwatch_metrics_enabled = true
      metric_name                = "signin-flood"
      sampled_requests_enabled   = true
    }
  }

  rule {
    name     = "request-flood"
    priority = 5
    action {
      block {
        custom_response {
          response_code = 429
        }
      }
    }
    statement {
      rate_based_statement {
        limit                 = var.waf_requests_limit_per_5min
        aggregate_key_type    = "IP"
        evaluation_window_sec = 300
      }
    }
    visibility_config {
      cloudwatch_metrics_enabled = true
      metric_name                = "request-flood"
      sampled_requests_enabled   = true
    }
  }

  visibility_config {
    cloudwatch_metrics_enabled = true
    metric_name                = "${local.name}-waf"
    sampled_requests_enabled   = true
  }

  tags = { Project = var.project, Environment = var.environment }
}

resource "aws_wafv2_web_acl_association" "api" {
  count        = var.create_api ? 1 : 0
  resource_arn = aws_apprunner_service.api[0].arn
  web_acl_arn  = aws_wafv2_web_acl.main.arn
}

resource "aws_wafv2_web_acl_association" "web" {
  count        = var.create_web ? 1 : 0
  resource_arn = aws_apprunner_service.web[0].arn
  web_acl_arn  = aws_wafv2_web_acl.main.arn
}

# Firewall log (name must start with aws-waf-logs-). Sign-in secrets are never
# written: the Authorization and Cookie headers are redacted.
resource "aws_cloudwatch_log_group" "waf" {
  name              = "aws-waf-logs-${local.name}"
  retention_in_days = 30
}

resource "aws_wafv2_web_acl_logging_configuration" "main" {
  resource_arn            = aws_wafv2_web_acl.main.arn
  log_destination_configs = [aws_cloudwatch_log_group.waf.arn]

  redacted_fields {
    single_header {
      name = "authorization"
    }
  }
  redacted_fields {
    single_header {
      name = "cookie"
    }
  }

  # Keep only blocked requests: that's what we investigate, and it keeps the log small.
  logging_filter {
    default_behavior = "DROP"
    filter {
      behavior    = "KEEP"
      requirement = "MEETS_ANY"
      condition {
        action_condition {
          action = "BLOCK"
        }
      }
    }
  }
}

# Tell the team when the firewall starts blocking a lot (an attack, or a rule
# catching real users).
resource "aws_cloudwatch_metric_alarm" "waf_blocks" {
  alarm_name          = "${local.name}-waf-blocking-spike"
  alarm_description   = "The firewall blocked more than ${var.waf_block_alarm_per_5min} requests in 5 minutes. Check the aws-waf-logs log group."
  namespace           = "AWS/WAFV2"
  metric_name         = "BlockedRequests"
  dimensions          = { WebACL = aws_wafv2_web_acl.main.name, Region = var.region, Rule = "ALL" }
  statistic           = "Sum"
  period              = 300
  evaluation_periods  = 1
  threshold           = var.waf_block_alarm_per_5min
  comparison_operator = "GreaterThanThreshold"
  treat_missing_data  = "notBreaching"
  alarm_actions       = [aws_sns_topic.alerts.arn]
  ok_actions          = [aws_sns_topic.alerts.arn]
}
