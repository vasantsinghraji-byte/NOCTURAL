# terraform init -reconfigure -backend-config=backend/production.hcl
bucket         = "medrush-terraform-state"
key            = "production/terraform.tfstate"
region         = "ap-south-1"
dynamodb_table = "medrush-terraform-lock"
encrypt        = true
