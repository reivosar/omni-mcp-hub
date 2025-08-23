# Omni MCP Hub Helm Chart

This Helm chart deploys Omni MCP Hub on a Kubernetes cluster using the Helm package manager.

## Prerequisites

- Kubernetes 1.19+
- Helm 3.0+

## Installing the Chart

To install the chart with the release name `omni-mcp-hub`:

```bash
helm install omni-mcp-hub ./helm/omni-mcp-hub
```

The command deploys Omni MCP Hub on the Kubernetes cluster in the default configuration.

## Uninstalling the Chart

To uninstall/delete the `omni-mcp-hub` deployment:

```bash
helm delete omni-mcp-hub
```

## Configuration

The following table lists the configurable parameters and their default values.

### Global Parameters

| Parameter | Description | Default |
|-----------|-------------|---------|
| `replicaCount` | Number of replicas | `2` |
| `image.repository` | Image repository | `omni-mcp-hub` |
| `image.tag` | Image tag | `""` (uses chart appVersion) |
| `image.pullPolicy` | Image pull policy | `IfNotPresent` |
| `nameOverride` | String to partially override names | `""` |
| `fullnameOverride` | String to fully override names | `""` |

### Service Account

| Parameter | Description | Default |
|-----------|-------------|---------|
| `serviceAccount.create` | Create service account | `true` |
| `serviceAccount.annotations` | Service account annotations | `{}` |
| `serviceAccount.name` | Service account name | `""` |

### Security

| Parameter | Description | Default |
|-----------|-------------|---------|
| `podSecurityContext.fsGroup` | Pod security context fsGroup | `1000` |
| `podSecurityContext.runAsNonRoot` | Run as non-root user | `true` |
| `podSecurityContext.runAsUser` | User ID to run as | `1000` |
| `securityContext.allowPrivilegeEscalation` | Allow privilege escalation | `false` |
| `securityContext.readOnlyRootFilesystem` | Read-only root filesystem | `true` |

### Service

| Parameter | Description | Default |
|-----------|-------------|---------|
| `service.type` | Service type | `ClusterIP` |
| `service.port` | Service port | `80` |
| `service.targetPort` | Target port | `3000` |

### Ingress

| Parameter | Description | Default |
|-----------|-------------|---------|
| `ingress.enabled` | Enable ingress | `false` |
| `ingress.className` | Ingress class name | `""` |
| `ingress.annotations` | Ingress annotations | `{}` |
| `ingress.hosts` | Ingress hosts configuration | See values.yaml |
| `ingress.tls` | Ingress TLS configuration | `[]` |

### Resources

| Parameter | Description | Default |
|-----------|-------------|---------|
| `resources.limits.cpu` | CPU limit | `500m` |
| `resources.limits.memory` | Memory limit | `512Mi` |
| `resources.requests.cpu` | CPU request | `250m` |
| `resources.requests.memory` | Memory request | `256Mi` |

### Autoscaling

| Parameter | Description | Default |
|-----------|-------------|---------|
| `autoscaling.enabled` | Enable horizontal pod autoscaler | `false` |
| `autoscaling.minReplicas` | Minimum number of replicas | `1` |
| `autoscaling.maxReplicas` | Maximum number of replicas | `100` |
| `autoscaling.targetCPUUtilizationPercentage` | Target CPU utilization | `80` |

### Persistence

| Parameter | Description | Default |
|-----------|-------------|---------|
| `persistence.enabled` | Enable persistent storage | `false` |
| `persistence.storageClass` | Storage class name | `""` |
| `persistence.accessMode` | Access mode | `ReadWriteOnce` |
| `persistence.size` | Storage size | `1Gi` |

### Monitoring

| Parameter | Description | Default |
|-----------|-------------|---------|
| `monitoring.enabled` | Enable monitoring | `false` |
| `monitoring.serviceMonitor.enabled` | Enable ServiceMonitor | `false` |
| `monitoring.serviceMonitor.interval` | Scrape interval | `30s` |
| `monitoring.serviceMonitor.path` | Metrics path | `/metrics` |

### Configuration

| Parameter | Description | Default |
|-----------|-------------|---------|
| `config.omniConfig` | Main configuration content | See values.yaml |
| `env` | Environment variables | `{ NODE_ENV: "production", PORT: "3000" }` |

## Examples

### Basic Installation

```bash
helm install omni-mcp-hub ./helm/omni-mcp-hub
```

### Installation with Custom Values

```bash
helm install omni-mcp-hub ./helm/omni-mcp-hub \
  --set replicaCount=3 \
  --set image.tag=v1.0.0 \
  --set ingress.enabled=true
```

### Installation with Values File

Create a custom values file:

```yaml
# custom-values.yaml
replicaCount: 3
image:
  tag: v1.0.0
ingress:
  enabled: true
  hosts:
    - host: omni-mcp-hub.example.com
      paths:
        - path: /
          pathType: Prefix
autoscaling:
  enabled: true
  minReplicas: 2
  maxReplicas: 10
```

```bash
helm install omni-mcp-hub ./helm/omni-mcp-hub -f custom-values.yaml
```

### Production Configuration

```yaml
# production-values.yaml
replicaCount: 3

image:
  repository: your-registry/omni-mcp-hub
  tag: v1.0.0
  pullPolicy: Always

resources:
  limits:
    cpu: 1000m
    memory: 1Gi
  requests:
    cpu: 500m
    memory: 512Mi

autoscaling:
  enabled: true
  minReplicas: 3
  maxReplicas: 20
  targetCPUUtilizationPercentage: 70

ingress:
  enabled: true
  className: nginx
  annotations:
    cert-manager.io/cluster-issuer: letsencrypt-prod
    nginx.ingress.kubernetes.io/ssl-redirect: "true"
  hosts:
    - host: omni-mcp-hub.yourdomain.com
      paths:
        - path: /
          pathType: Prefix
  tls:
    - secretName: omni-mcp-hub-tls
      hosts:
        - omni-mcp-hub.yourdomain.com

persistence:
  enabled: true
  storageClass: fast-ssd
  size: 10Gi

monitoring:
  enabled: true
  serviceMonitor:
    enabled: true

podDisruptionBudget:
  enabled: true
  minAvailable: 2

networkPolicy:
  enabled: true
  ingress:
    - from:
      - namespaceSelector:
          matchLabels:
            name: nginx-ingress
  egress:
    - {}
```

## Upgrading

To upgrade an existing release:

```bash
helm upgrade omni-mcp-hub ./helm/omni-mcp-hub
```

## Troubleshooting

### Check Pod Status

```bash
kubectl get pods -l app.kubernetes.io/name=omni-mcp-hub
```

### View Pod Logs

```bash
kubectl logs -l app.kubernetes.io/name=omni-mcp-hub --tail=100
```

### Check Service

```bash
kubectl get svc -l app.kubernetes.io/name=omni-mcp-hub
```

### Debug Configuration

```bash
helm get values omni-mcp-hub
helm get manifest omni-mcp-hub
```

## Development

To render templates locally without installing:

```bash
helm template omni-mcp-hub ./helm/omni-mcp-hub
```

To validate the chart:

```bash
helm lint ./helm/omni-mcp-hub
```