# terraform init -reconfigure -backend-config=backend/staging.hcl
bucket         = "medrush-terraform-state"
key            = "staging/terraform.tfstate"
region         = "ap-south-1"
dynamodb_table = "medrush-terraform-lock"
encrypt        = true
