# Terraform placeholder — production infrastructure
#
# Modules to implement:
# - VPC with private subnets
# - EKS/GKE cluster with mTLS service mesh (SR-7.1)
# - RDS Postgres for audit/operations storage
# - ElastiCache Redis for job queue
# - AWS Secrets Manager / Vault for Fireblocks credentials (SR-4.1)
# - WAF + ALB with TLS 1.2+ (SR-7.2)

terraform {
  required_version = ">= 1.5"
}

variable "environment" {
  description = "Deployment environment"
  type        = string
  default     = "staging"
}

variable "region" {
  description = "Cloud region"
  type        = string
  default     = "us-east-1"
}

output "environment" {
  value = var.environment
}
