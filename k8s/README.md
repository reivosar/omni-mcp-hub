# Kubernetes Deployment Guide

This directory contains Kubernetes manifests for deploying Omni MCP Hub.

## Quick Start

### Using Helm (Recommended)

```bash
# Install using Helm
helm install omni-mcp-hub ./helm/omni-mcp-hub

# Or with custom values
helm install omni-mcp-hub ./helm/omni-mcp-hub -f my-values.yaml
```

### Using kubectl

```bash
# Apply all manifests
kubectl apply -f k8s/

# Or apply individually
kubectl apply -f k8s/namespace.yaml
kubectl apply -f k8s/configmap.yaml
kubectl apply -f k8s/deployment.yaml
kubectl apply -f k8s/service.yaml
```

## Manifests

### namespace.yaml
Creates the `omni-mcp-hub` namespace for all resources.

### configmap.yaml
Contains the main configuration file (`omni-config.yaml`).

### deployment.yaml
Defines the main application deployment with:
- 2 replicas for high availability
- Resource limits and requests
- Health checks (liveness and readiness probes)
- Security context (non-root user)
- Configuration volume mount

### service.yaml
Creates a ClusterIP service to expose the application internally.

## Configuration

### Environment Variables

The deployment uses these environment variables:

- `NODE_ENV`: Set to "production"
- `PORT`: Application port (3000)

### Volume Mounts

- `/app/omni-config.yaml`: Main configuration file from ConfigMap
- `/tmp`: Temporary directory (emptyDir)
- `/app/.cache`: Application cache (emptyDir)

### Resource Requirements

Default resource configuration:
- **Requests**: 250m CPU, 256Mi memory
- **Limits**: 500m CPU, 512Mi memory

## Health Checks

The deployment includes:

- **Liveness Probe**: HTTP GET to `/health` on port 3000
  - Initial delay: 30 seconds
  - Period: 10 seconds

- **Readiness Probe**: HTTP GET to `/health` on port 3000
  - Initial delay: 5 seconds
  - Period: 5 seconds

## Security

Security features:
- Runs as non-root user (UID 1000)
- Read-only root filesystem
- No privilege escalation allowed
- Drops all capabilities

## Scaling

### Manual Scaling

```bash
kubectl scale deployment omni-mcp-hub -n omni-mcp-hub --replicas=5
```

### Auto-scaling with HPA

```yaml
apiVersion: autoscaling/v2
kind: HorizontalPodAutoscaler
metadata:
  name: omni-mcp-hub-hpa
  namespace: omni-mcp-hub
spec:
  scaleTargetRef:
    apiVersion: apps/v1
    kind: Deployment
    name: omni-mcp-hub
  minReplicas: 2
  maxReplicas: 10
  metrics:
  - type: Resource
    resource:
      name: cpu
      target:
        type: Utilization
        averageUtilization: 70
```

## Monitoring

### Service Monitor (for Prometheus)

```yaml
apiVersion: monitoring.coreos.com/v1
kind: ServiceMonitor
metadata:
  name: omni-mcp-hub
  namespace: omni-mcp-hub
spec:
  selector:
    matchLabels:
      app: omni-mcp-hub
  endpoints:
  - port: http
    path: /metrics
    interval: 30s
```

## Ingress

### NGINX Ingress Example

```yaml
apiVersion: networking.k8s.io/v1
kind: Ingress
metadata:
  name: omni-mcp-hub-ingress
  namespace: omni-mcp-hub
  annotations:
    nginx.ingress.kubernetes.io/ssl-redirect: "true"
    cert-manager.io/cluster-issuer: "letsencrypt-prod"
spec:
  ingressClassName: nginx
  tls:
  - hosts:
    - omni-mcp-hub.yourdomain.com
    secretName: omni-mcp-hub-tls
  rules:
  - host: omni-mcp-hub.yourdomain.com
    http:
      paths:
      - path: /
        pathType: Prefix
        backend:
          service:
            name: omni-mcp-hub
            port:
              number: 80
```

## Persistence

For persistent storage (optional):

```yaml
apiVersion: v1
kind: PersistentVolumeClaim
metadata:
  name: omni-mcp-hub-data
  namespace: omni-mcp-hub
spec:
  accessModes:
    - ReadWriteOnce
  storageClassName: fast-ssd
  resources:
    requests:
      storage: 10Gi
```

Add to deployment:

```yaml
volumeMounts:
- name: data
  mountPath: /app/data
volumes:
- name: data
  persistentVolumeClaim:
    claimName: omni-mcp-hub-data
```

## Troubleshooting

### Check Pod Status

```bash
kubectl get pods -n omni-mcp-hub
```

### View Logs

```bash
kubectl logs -n omni-mcp-hub deployment/omni-mcp-hub --tail=100 -f
```

### Debug Configuration

```bash
# Check ConfigMap
kubectl get configmap -n omni-mcp-hub omni-mcp-hub-config -o yaml

# Exec into pod
kubectl exec -it -n omni-mcp-hub deployment/omni-mcp-hub -- /bin/sh
```

### Common Issues

1. **Pod stuck in Pending**: Check resource availability and node selectors
2. **Pod crash loops**: Check logs and health check endpoints
3. **Config issues**: Verify ConfigMap content and volume mounts
4. **Network issues**: Check service and ingress configuration

## Production Considerations

1. **Resource Limits**: Adjust based on actual usage patterns
2. **Replica Count**: Scale based on load requirements
3. **Persistent Storage**: Use for configuration persistence
4. **Monitoring**: Set up comprehensive monitoring and alerting
5. **Backup**: Regular backups of configuration data
6. **Security**: Network policies, RBAC, and security contexts
7. **Updates**: Use rolling updates with proper health checks

## Migration from Docker Compose

If migrating from Docker Compose:

1. Convert environment variables to ConfigMap
2. Convert volumes to PVCs if persistence is needed
3. Set up proper networking (Services, Ingress)
4. Configure health checks
5. Test thoroughly in a staging environment