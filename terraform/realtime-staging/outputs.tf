output "realtime_http_domain" {
  description = "AppSync Events HTTP host (publishing, and the host in client auth headers)."
  value       = aws_appsync_api.realtime.dns["HTTP"]
}

output "realtime_ws_domain" {
  description = "AppSync Events real-time (WebSocket) host."
  value       = aws_appsync_api.realtime.dns["REALTIME"]
}

output "realtime_token_secret_arn" {
  value = aws_secretsmanager_secret.token.arn
}

output "turn_secret_arn" {
  value = aws_secretsmanager_secret.turn.arn
}

output "turn_host" {
  description = "Public IP of the TURN relay."
  value       = aws_eip.turn.public_ip
}

output "turn_instance_id" {
  value = aws_instance.turn.id
}
