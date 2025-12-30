# Event Planner (Luxury / Wedding + Corporate)

A static, local-first event planner built with HTML/CSS/JS:
- Dashboard with search & filters
- Calendar month view (click a day to create)
- Event editor: tasks, guests (RSVP), vendors, budget
- LocalStorage persistence
- Export/Import JSON
- Light/Dark luxury theme

## Run locally
Just open `index.html` in a browser.

## Build & run with Docker (production)
```bash
docker build -t event-planner:luxury .
docker run --rm -p 8080:8080 event-planner:luxury
```

Then open:
- http://localhost:8080

Health check:
- http://localhost:8080/healthz

---

## Deploy to AWS ECS with Load Balancer & Auto Scaling

### Prerequisites
- AWS CLI configured with appropriate permissions
- Docker installed locally
- An AWS account with access to ECR, ECS, EC2 (for ALB), and IAM

---

### Step 1: Create an ECR Repository

```bash
aws ecr create-repository \
  --repository-name demo-website \
  --region us-east-1
```

Note the `repositoryUri` from the output (e.g., `123456789012.dkr.ecr.us-east-1.amazonaws.com/demo-website`).

---

### Step 2: Build and Push Docker Image to ECR

```bash
# Authenticate Docker to ECR
aws ecr get-login-password --region us-east-1 | \
  docker login --username AWS --password-stdin 123456789012.dkr.ecr.us-east-1.amazonaws.com

# Build the image
docker build -t demo-website .

# Tag the image
docker tag demo-website:latest 123456789012.dkr.ecr.us-east-1.amazonaws.com/demo-website:latest

# Push to ECR
docker push 123456789012.dkr.ecr.us-east-1.amazonaws.com/demo-website:latest
```

---

### Step 3: Create an ECS Cluster

```bash
aws ecs create-cluster \
  --cluster-name demo-website \
  --capacity-providers FARGATE FARGATE_SPOT \
  --default-capacity-provider-strategy capacityProvider=FARGATE,weight=1
```

---

### Step 4: Create IAM Roles

#### 4a. ECS Task Execution Role
```bash
# Create trust policy file
cat > ecs-trust-policy.json << 'EOF'
{
  "Version": "2012-10-17",
  "Statement": [
    {
      "Effect": "Allow",
      "Principal": {
        "Service": "ecs-tasks.amazonaws.com"
      },
      "Action": "sts:AssumeRole"
    }
  ]
}
EOF

# Create the role
aws iam create-role \
  --role-name ecsTaskExecutionRole \
  --assume-role-policy-document file://ecs-trust-policy.json

# Attach the managed policy
aws iam attach-role-policy \
  --role-name ecsTaskExecutionRole \
  --policy-arn arn:aws:iam::aws:policy/service-role/AmazonECSTaskExecutionRolePolicy
```

---

### Step 5: Create Application Load Balancer (ALB)

#### 5a. Create a Security Group for ALB
```bash
# Get your VPC ID
VPC_ID=$(aws ec2 describe-vpcs --filters "Name=isDefault,Values=true" --query "Vpcs[0].VpcId" --output text)

# Create security group
aws ec2 create-security-group \
  --group-name demo-website-alb-sg \
  --description "Security group for demo-website ALB" \
  --vpc-id $VPC_ID

# Allow inbound HTTP (port 80)
aws ec2 authorize-security-group-ingress \
  --group-name demo-website-alb-sg \
  --protocol tcp \
  --port 80 \
  --cidr 0.0.0.0/0
```

#### 5b. Create a Security Group for ECS Tasks
```bash
ALB_SG_ID=$(aws ec2 describe-security-groups --group-names demo-website-alb-sg --query "SecurityGroups[0].GroupId" --output text)

aws ec2 create-security-group \
  --group-name demo-website-ecs-sg \
  --description "Security group for demo-website ECS tasks" \
  --vpc-id $VPC_ID

ECS_SG_ID=$(aws ec2 describe-security-groups --group-names demo-website-ecs-sg --query "SecurityGroups[0].GroupId" --output text)

# Allow inbound from ALB only on port 8080
aws ec2 authorize-security-group-ingress \
  --group-id $ECS_SG_ID \
  --protocol tcp \
  --port 8080 \
  --source-group $ALB_SG_ID
```

#### 5c. Create the ALB
```bash
# Get subnet IDs (need at least 2 in different AZs)
SUBNET_IDS=$(aws ec2 describe-subnets --filters "Name=vpc-id,Values=$VPC_ID" --query "Subnets[*].SubnetId" --output text | tr '\t' ',')

aws elbv2 create-load-balancer \
  --name demo-website-alb \
  --subnets $(echo $SUBNET_IDS | tr ',' ' ') \
  --security-groups $ALB_SG_ID \
  --scheme internet-facing \
  --type application
```

Note the `LoadBalancerArn` and `DNSName` from the output.

#### 5d. Create Target Group
```bash
aws elbv2 create-target-group \
  --name demo-website-tg \
  --protocol HTTP \
  --port 8080 \
  --vpc-id $VPC_ID \
  --target-type ip \
  --health-check-path /healthz \
  --health-check-interval-seconds 30 \
  --healthy-threshold-count 2
```

Note the `TargetGroupArn` from the output.

#### 5e. Create Listener
```bash
ALB_ARN=<your-load-balancer-arn>
TG_ARN=<your-target-group-arn>

aws elbv2 create-listener \
  --load-balancer-arn $ALB_ARN \
  --protocol HTTP \
  --port 80 \
  --default-actions Type=forward,TargetGroupArn=$TG_ARN
```

---

### Step 6: Register ECS Task Definition

Update `.github/templates/ecs-task-definition-backend-staging.json` with your actual AWS account ID, then register:

```bash
aws ecs register-task-definition \
  --cli-input-json file://.github/templates/ecs-task-definition-backend-staging.json
```

---

### Step 7: Create ECS Service with Load Balancer

```bash
SUBNET_IDS="subnet-xxx,subnet-yyy"  # Your private/public subnets
ECS_SG_ID="sg-xxx"                   # ECS security group
TG_ARN="arn:aws:elasticloadbalancing:..."  # Target group ARN

aws ecs create-service \
  --cluster demo-website \
  --service-name demo-website \
  --task-definition demo-website \
  --desired-count 2 \
  --launch-type FARGATE \
  --network-configuration "awsvpcConfiguration={subnets=[$SUBNET_IDS],securityGroups=[$ECS_SG_ID],assignPublicIp=ENABLED}" \
  --load-balancers "targetGroupArn=$TG_ARN,containerName=demo-website,containerPort=8080"
```

---

### Step 8: Configure Auto Scaling

#### 8a. Register Scalable Target
```bash
aws application-autoscaling register-scalable-target \
  --service-namespace ecs \
  --resource-id service/demo-website/demo-website \
  --scalable-dimension ecs:service:DesiredCount \
  --min-capacity 1 \
  --max-capacity 10
```

#### 8b. Create Scaling Policy (Target Tracking - CPU)
```bash
cat > scaling-policy-cpu.json << 'EOF'
{
  "TargetValue": 70.0,
  "PredefinedMetricSpecification": {
    "PredefinedMetricType": "ECSServiceAverageCPUUtilization"
  },
  "ScaleOutCooldown": 60,
  "ScaleInCooldown": 120
}
EOF

aws application-autoscaling put-scaling-policy \
  --service-namespace ecs \
  --resource-id service/demo-website/demo-website \
  --scalable-dimension ecs:service:DesiredCount \
  --policy-name demo-website-cpu-scaling \
  --policy-type TargetTrackingScaling \
  --target-tracking-scaling-policy-configuration file://scaling-policy-cpu.json
```

#### 8c. (Optional) Create Scaling Policy (Target Tracking - Memory)
```bash
cat > scaling-policy-memory.json << 'EOF'
{
  "TargetValue": 70.0,
  "PredefinedMetricSpecification": {
    "PredefinedMetricType": "ECSServiceAverageMemoryUtilization"
  },
  "ScaleOutCooldown": 60,
  "ScaleInCooldown": 120
}
EOF

aws application-autoscaling put-scaling-policy \
  --service-namespace ecs \
  --resource-id service/demo-website/demo-website \
  --scalable-dimension ecs:service:DesiredCount \
  --policy-name demo-website-memory-scaling \
  --policy-type TargetTrackingScaling \
  --target-tracking-scaling-policy-configuration file://scaling-policy-memory.json
```

---

### Step 9: Verify Deployment

```bash
# Check service status
aws ecs describe-services \
  --cluster demo-website \
  --services demo-website \
  --query "services[0].{Status:status,Running:runningCount,Desired:desiredCount}"

# Get ALB DNS name
aws elbv2 describe-load-balancers \
  --names demo-website-alb \
  --query "LoadBalancers[0].DNSName" \
  --output text
```

Access your website at: `http://<ALB-DNS-Name>`

---

### Step 10: Set Up GitHub Actions (CI/CD)

Ensure these AWS resources exist:
1. **OIDC Identity Provider** for GitHub in IAM
2. **IAM Role** (`ola-github-actions`) with trust policy for GitHub OIDC and permissions for ECR/ECS

The workflow at `.github/workflows/deploy-backend.yml` will automatically:
- Build and push Docker image to ECR
- Update ECS task definition with new image
- Deploy to ECS service

---

### Architecture Summary

```
┌─────────────┐     ┌─────────────────┐     ┌──────────────────┐
│   Internet  │────▶│  ALB (Port 80)  │────▶│  ECS Fargate     │
└─────────────┘     └─────────────────┘     │  Tasks (Port     │
                                            │  8080)           │
                                            │  ┌────┐ ┌────┐   │
                                            │  │Task│ │Task│   │
                                            │  └────┘ └────┘   │
                                            └──────────────────┘
                                                    │
                                            ┌───────▼────────┐
                                            │  Auto Scaling  │
                                            │  (1-10 tasks)  │
                                            │  CPU/Memory    │
                                            │  Target: 70%   │
                                            └────────────────┘
```

---

### Cleanup

```bash
# Delete ECS service
aws ecs update-service --cluster demo-website --service demo-website --desired-count 0
aws ecs delete-service --cluster demo-website --service demo-website

# Delete auto scaling
aws application-autoscaling deregister-scalable-target \
  --service-namespace ecs \
  --resource-id service/demo-website/demo-website \
  --scalable-dimension ecs:service:DesiredCount

# Delete ALB resources
aws elbv2 delete-listener --listener-arn <listener-arn>
aws elbv2 delete-target-group --target-group-arn <target-group-arn>
aws elbv2 delete-load-balancer --load-balancer-arn <load-balancer-arn>

# Delete ECS cluster
aws ecs delete-cluster --cluster demo-website

# Delete ECR repository
aws ecr delete-repository --repository-name demo-website --force
```
