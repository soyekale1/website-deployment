# Note you can use the following command to get the task definition:
aws ecs describe-task-definition --task-definition demo-website

# Note you can use the following command to get the service:
aws ecs describe-services --cluster demo-website --services demo-website
sss