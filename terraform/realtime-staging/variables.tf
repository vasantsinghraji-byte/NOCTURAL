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

variable "turn_instance_type" {
  description = "Graviton is enough: TURN only relays calls that can't connect directly."
  type        = string
  default     = "t4g.small"
}

variable "turn_min_port" {
  description = "Relayed media port range (each relayed call uses a couple of ports)."
  type        = number
  default     = 49160
}

variable "turn_max_port" {
  type    = number
  default = 49400
}
