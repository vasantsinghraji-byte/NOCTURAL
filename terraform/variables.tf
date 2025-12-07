variable "aws_region" {
  description = "AWS region"
  type        = string
  default     = "us-east-1"
}

variable "environment" {
  description = "Environment name"
  type        = string
  validation {
    condition     = contains(["development", "staging", "production"], var.environment)
    error_message = "Environment must be development, staging, or production."
  }
}

variable "project_name" {
  description = "Project name"
  type        = string
  default     = "noctural"
}

variable "vpc_cidr" {
  description = "VPC CIDR block"
  type        = string
  default     = "10.0.0.0/16"
}

variable "availability_zones" {
  description = "Availability zones"
  type        = list(string)
  default     = ["us-east-1a", "us-east-1b", "us-east-1c"]
}

variable "private_subnet_cidrs" {
  description = "Private subnet CIDR blocks"
  type        = list(string)
  default     = ["10.0.1.0/24", "10.0.2.0/24", "10.0.3.0/24"]
}

variable "public_subnet_cidrs" {
  description = "Public subnet CIDR blocks"
  type        = list(string)
  default     = ["10.0.101.0/24", "10.0.102.0/24", "10.0.103.0/24"]
}

variable "db_instance_class" {
  description = "Database instance class"
  type        = string
  default     = "db.t3.medium"
}

variable "db_allocated_storage" {
  description = "Database allocated storage in GB"
  type        = number
  default     = 50
}

variable "db_name" {
  description = "Database name"
  type        = string
  default     = "noctural"
}

variable "db_username" {
  description = "Database master username"
  type        = string
  default     = "admin"
}

variable "redis_node_type" {
  description = "Redis node type"
  type        = string
  default     = "cache.t3.micro"
}

variable "domain_name" {
  description = "Domain name"
  type        = string
}

variable "app_port" {
  description = "Application port"
  type        = number
  default     = 5000
}

variable "desired_count" {
  description = "Desired number of ECS tasks"
  type        = number
  default     = 3
}

variable "cpu" {
  description = "CPU units for ECS task"
  type        = number
  default     = 512
}

variable "memory" {
  description = "Memory for ECS task in MB"
  type        = number
  default     = 2048
}
