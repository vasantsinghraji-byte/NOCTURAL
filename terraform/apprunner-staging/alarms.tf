# Alerts (audit P4): monitoring.triggerAlert only logs, so page someone when
# the background tick stops or fails, or the API starts returning 5xx errors.
# Alarms publish to an SNS topic; set var.alert_email to get them by email
# (AWS sends a confirmation link first).

resource "aws_sns_topic" "alerts" {
  name = "${local.name}-alerts"
}

resource "aws_sns_topic_subscription" "alerts_email" {
  count     = var.alert_email == "" ? 0 : 1
  topic_arn = aws_sns_topic.alerts.arn
  protocol  = "email"
  endpoint  = var.alert_email
}

# The minute tick drives dispatch, pharmacy timeouts and refunds.
resource "aws_cloudwatch_metric_alarm" "tick_failed" {
  count               = var.create_api ? 1 : 0
  alarm_name          = "${local.name}-tick-failed"
  alarm_description   = "EventBridge could not deliver the background tick to the API (sweeps are not running)."
  namespace           = "AWS/Events"
  metric_name         = "FailedInvocations"
  dimensions          = { RuleName = aws_cloudwatch_event_rule.tick[0].name }
  statistic           = "Sum"
  period              = 300
  evaluation_periods  = 2
  threshold           = 3
  comparison_operator = "GreaterThanOrEqualToThreshold"
  treat_missing_data  = "notBreaching"
  alarm_actions       = [aws_sns_topic.alerts.arn]
  ok_actions          = [aws_sns_topic.alerts.arn]
}

resource "aws_cloudwatch_metric_alarm" "tick_stopped" {
  count               = var.create_api ? 1 : 0
  alarm_name          = "${local.name}-tick-stopped"
  alarm_description   = "The background tick has not fired for 10 minutes (rule disabled or deleted)."
  namespace           = "AWS/Events"
  metric_name         = "Invocations"
  dimensions          = { RuleName = aws_cloudwatch_event_rule.tick[0].name }
  statistic           = "Sum"
  period              = 300
  evaluation_periods  = 2
  threshold           = 1
  comparison_operator = "LessThanThreshold"
  treat_missing_data  = "breaching"
  alarm_actions       = [aws_sns_topic.alerts.arn]
  ok_actions          = [aws_sns_topic.alerts.arn]
}

resource "aws_cloudwatch_metric_alarm" "api_5xx" {
  count             = var.create_api ? 1 : 0
  alarm_name        = "${local.name}-api-5xx"
  alarm_description = "The API returned 20+ server errors in 5 minutes, twice in a row."
  namespace         = "AWS/AppRunner"
  metric_name       = "5xxStatusResponses"
  dimensions = {
    ServiceName = aws_apprunner_service.api[0].service_name
    ServiceID   = aws_apprunner_service.api[0].service_id
  }
  statistic           = "Sum"
  period              = 300
  evaluation_periods  = 2
  threshold           = 20
  comparison_operator = "GreaterThanOrEqualToThreshold"
  treat_missing_data  = "notBreaching"
  alarm_actions       = [aws_sns_topic.alerts.arn]
  ok_actions          = [aws_sns_topic.alerts.arn]
}
