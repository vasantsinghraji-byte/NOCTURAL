variable "region" {
  type    = string
  default = "ap-south-1"
}

variable "project" {
  type    = string
  default = "nabz"
}

variable "environment" {
  type    = string
  default = "staging"
}

variable "mongodb_uri_secret_name" {
  description = "Secrets Manager secret holding the Atlas connection string (created by hand, never in git)"
  type        = string
  default     = "nabz/staging/MONGODB_URI"
}

variable "mongodb_db_name" {
  type    = string
  default = "nabz"
}

# Built in stages because each service needs an image first (see README.md).
variable "create_api" {
  type    = bool
  default = false
}

variable "create_web" {
  type    = bool
  default = false
}

# Staging only: every approved store delivers within this radius (3500 km = all of India),
# so testers outside Jaipur can order supplies. Set 0 to use real store radii.
variable "test_store_radius_km" {
  type    = number
  default = 3500
}

# Seconds a store has to accept an order before it moves to the next store.
variable "pharmacy_accept_sla_seconds" {
  type    = number
  default = 600
}

variable "alert_email" {
  description = "Email for staging alarms (tick stopped/failed, API 5xx). Empty = alarms go to the SNS topic only."
  type        = string
  default     = ""
}
