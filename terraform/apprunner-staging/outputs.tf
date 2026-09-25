output "api_url" {
  value = local.api_url
}

output "web_url" {
  value = local.web_url
}

output "codebuild_project" {
  value = aws_codebuild_project.images.name
}

output "build_bucket" {
  value = aws_s3_bucket.build.id
}

output "uploads_bucket" {
  value = aws_s3_bucket.uploads.id
}
