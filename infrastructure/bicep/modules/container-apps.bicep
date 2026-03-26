param containerAppsEnvironmentName string
param location string
param registryLoginServer string
param registryUsername string
@secure()
param registryPassword string
param imageTag string
param identityName string
param ledgerName string
param reportingName string
param documentsName string = 'abacus-documents'
param invoicingName string
param gatewayName string
@secure()
param jwtSecret string
@secure()
param redisConnectionString string
@secure()
param identityDatabaseUrl string
@secure()
param ledgerDatabaseUrl string
@secure()
param documentsDatabaseUrl string
@secure()
param reportingDatabaseUrl string
@secure()
param invoicingDatabaseUrl string
param frontendOrigin string
param objectStorageEndpoint string
param objectStorageAccessKeyId string
@secure()
param objectStorageSecretAccessKey string
param objectStorageRegion string
param documentsBucket string
param reportsBucket string
param invoicesBucket string
param logAnalyticsCustomerId string
@secure()
param logAnalyticsSharedKey string
param tags object = {}

resource managedEnvironment 'Microsoft.App/managedEnvironments@2024-03-01' = {
  name: containerAppsEnvironmentName
  location: location
  tags: tags
  properties: {
    appLogsConfiguration: {
      destination: 'log-analytics'
      logAnalyticsConfiguration: {
        customerId: logAnalyticsCustomerId
        sharedKey: logAnalyticsSharedKey
      }
    }
    zoneRedundant: false
  }
}

var commonRegistryConfig = [
  {
    passwordSecretRef: 'registry-password'
    server: registryLoginServer
    username: registryUsername
  }
]

resource identityApp 'Microsoft.App/containerApps@2024-03-01' = {
  name: identityName
  location: location
  tags: tags
  properties: {
    managedEnvironmentId: managedEnvironment.id
    configuration: {
      activeRevisionsMode: 'Single'
      ingress: {
        allowInsecure: false
        external: false
        targetPort: 3001
        transport: 'auto'
      }
      registries: commonRegistryConfig
      secrets: [
        {
          name: 'database-url'
          value: identityDatabaseUrl
        }
        {
          name: 'jwt-secret'
          value: jwtSecret
        }
        {
          name: 'redis-url'
          value: redisConnectionString
        }
        {
          name: 'registry-password'
          value: registryPassword
        }
      ]
    }
    template: {
      containers: [
        {
          env: [
            {
              name: 'DATABASE_URL'
              secretRef: 'database-url'
            }
            {
              name: 'HOST'
              value: '0.0.0.0'
            }
            {
              name: 'JWT_SECRET'
              secretRef: 'jwt-secret'
            }
            {
              name: 'PORT'
              value: '3001'
            }
            {
              name: 'REDIS_URL'
              secretRef: 'redis-url'
            }
          ]
          image: '${registryLoginServer}/abacus/identity-service:${imageTag}'
          name: 'identity-service'
          resources: {
            cpu: 0.5
            memory: '1Gi'
          }
        }
      ]
      scale: {
        maxReplicas: 2
        minReplicas: 1
      }
    }
  }
}

resource ledgerApp 'Microsoft.App/containerApps@2024-03-01' = {
  name: ledgerName
  location: location
  tags: tags
  properties: {
    managedEnvironmentId: managedEnvironment.id
    configuration: {
      activeRevisionsMode: 'Single'
      ingress: {
        allowInsecure: false
        external: false
        targetPort: 3002
        transport: 'auto'
      }
      registries: commonRegistryConfig
      secrets: [
        {
          name: 'database-url'
          value: ledgerDatabaseUrl
        }
        {
          name: 'jwt-secret'
          value: jwtSecret
        }
        {
          name: 'redis-url'
          value: redisConnectionString
        }
        {
          name: 'registry-password'
          value: registryPassword
        }
      ]
    }
    template: {
      containers: [
        {
          env: [
            {
              name: 'DATABASE_URL'
              secretRef: 'database-url'
            }
            {
              name: 'HOST'
              value: '0.0.0.0'
            }
            {
              name: 'JWT_SECRET'
              secretRef: 'jwt-secret'
            }
            {
              name: 'PORT'
              value: '3002'
            }
            {
              name: 'REDIS_URL'
              secretRef: 'redis-url'
            }
          ]
          image: '${registryLoginServer}/abacus/ledger-service:${imageTag}'
          name: 'ledger-service'
          resources: {
            cpu: 0.5
            memory: '1Gi'
          }
        }
      ]
      scale: {
        maxReplicas: 2
        minReplicas: 1
      }
    }
  }
}

resource documentsApp 'Microsoft.App/containerApps@2024-03-01' = {
  name: documentsName
  location: location
  tags: tags
  properties: {
    managedEnvironmentId: managedEnvironment.id
    configuration: {
      activeRevisionsMode: 'Single'
      ingress: {
        allowInsecure: false
        external: false
        targetPort: 3004
        transport: 'auto'
      }
      registries: commonRegistryConfig
      secrets: [
        {
          name: 'database-url'
          value: documentsDatabaseUrl
        }
        {
          name: 'object-storage-access-key'
          value: objectStorageAccessKeyId
        }
        {
          name: 'object-storage-secret-key'
          value: objectStorageSecretAccessKey
        }
        {
          name: 'redis-url'
          value: redisConnectionString
        }
        {
          name: 'registry-password'
          value: registryPassword
        }
      ]
    }
    template: {
      containers: [
        {
          env: [
            {
              name: 'DATABASE_URL'
              secretRef: 'database-url'
            }
            {
              name: 'DOCUMENTS_BUCKET'
              value: documentsBucket
            }
            {
              name: 'HOST'
              value: '0.0.0.0'
            }
            {
              name: 'PORT'
              value: '3004'
            }
            {
              name: 'REDIS_URL'
              secretRef: 'redis-url'
            }
            {
              name: 'S3_ACCESS_KEY_ID'
              secretRef: 'object-storage-access-key'
            }
            {
              name: 'S3_ENDPOINT'
              value: objectStorageEndpoint
            }
            {
              name: 'S3_REGION'
              value: objectStorageRegion
            }
            {
              name: 'S3_SECRET_ACCESS_KEY'
              secretRef: 'object-storage-secret-key'
            }
          ]
          image: '${registryLoginServer}/abacus/documents-service:${imageTag}'
          name: 'documents-service'
          resources: {
            cpu: 0.5
            memory: '1Gi'
          }
        }
      ]
      scale: {
        maxReplicas: 2
        minReplicas: 1
      }
    }
  }
}

resource reportingApp 'Microsoft.App/containerApps@2024-03-01' = {
  name: reportingName
  location: location
  tags: tags
  properties: {
    managedEnvironmentId: managedEnvironment.id
    configuration: {
      activeRevisionsMode: 'Single'
      ingress: {
        allowInsecure: false
        external: false
        targetPort: 3003
        transport: 'auto'
      }
      registries: commonRegistryConfig
      secrets: [
        {
          name: 'database-url'
          value: reportingDatabaseUrl
        }
        {
          name: 'object-storage-access-key'
          value: objectStorageAccessKeyId
        }
        {
          name: 'object-storage-secret-key'
          value: objectStorageSecretAccessKey
        }
        {
          name: 'redis-url'
          value: redisConnectionString
        }
        {
          name: 'registry-password'
          value: registryPassword
        }
      ]
    }
    template: {
      containers: [
        {
          env: [
            {
              name: 'DATABASE_URL'
              secretRef: 'database-url'
            }
            {
              name: 'HOST'
              value: '0.0.0.0'
            }
            {
              name: 'PORT'
              value: '3003'
            }
            {
              name: 'REDIS_URL'
              secretRef: 'redis-url'
            }
            {
              name: 'REPORTS_BUCKET'
              value: reportsBucket
            }
            {
              name: 'S3_ACCESS_KEY_ID'
              secretRef: 'object-storage-access-key'
            }
            {
              name: 'S3_ENDPOINT'
              value: objectStorageEndpoint
            }
            {
              name: 'S3_REGION'
              value: objectStorageRegion
            }
            {
              name: 'S3_SECRET_ACCESS_KEY'
              secretRef: 'object-storage-secret-key'
            }
          ]
          image: '${registryLoginServer}/abacus/reporting-service:${imageTag}'
          name: 'reporting-service'
          resources: {
            cpu: 0.5
            memory: '1Gi'
          }
        }
      ]
      scale: {
        maxReplicas: 2
        minReplicas: 1
      }
    }
  }
}

resource invoicingApp 'Microsoft.App/containerApps@2024-03-01' = {
  name: invoicingName
  location: location
  tags: tags
  properties: {
    managedEnvironmentId: managedEnvironment.id
    configuration: {
      activeRevisionsMode: 'Single'
      ingress: {
        allowInsecure: false
        external: false
        targetPort: 3006
        transport: 'auto'
      }
      registries: commonRegistryConfig
      secrets: [
        {
          name: 'database-url'
          value: invoicingDatabaseUrl
        }
        {
          name: 'jwt-secret'
          value: jwtSecret
        }
        {
          name: 'object-storage-access-key'
          value: objectStorageAccessKeyId
        }
        {
          name: 'object-storage-secret-key'
          value: objectStorageSecretAccessKey
        }
        {
          name: 'redis-url'
          value: redisConnectionString
        }
        {
          name: 'registry-password'
          value: registryPassword
        }
      ]
    }
    template: {
      containers: [
        {
          env: [
            {
              name: 'DATABASE_URL'
              secretRef: 'database-url'
            }
            {
              name: 'HOST'
              value: '0.0.0.0'
            }
            {
              name: 'INVOICES_BUCKET'
              value: invoicesBucket
            }
            {
              name: 'JWT_SECRET'
              secretRef: 'jwt-secret'
            }
            {
              name: 'PORT'
              value: '3006'
            }
            {
              name: 'REDIS_URL'
              secretRef: 'redis-url'
            }
            {
              name: 'S3_ACCESS_KEY_ID'
              secretRef: 'object-storage-access-key'
            }
            {
              name: 'S3_ENDPOINT'
              value: objectStorageEndpoint
            }
            {
              name: 'S3_REGION'
              value: objectStorageRegion
            }
            {
              name: 'S3_SECRET_ACCESS_KEY'
              secretRef: 'object-storage-secret-key'
            }
          ]
          image: '${registryLoginServer}/abacus/invoicing-service:${imageTag}'
          name: 'invoicing-service'
          resources: {
            cpu: 0.5
            memory: '1Gi'
          }
        }
      ]
      scale: {
        maxReplicas: 2
        minReplicas: 1
      }
    }
  }
}

resource gatewayApp 'Microsoft.App/containerApps@2024-03-01' = {
  name: gatewayName
  location: location
  tags: tags
  properties: {
    managedEnvironmentId: managedEnvironment.id
    configuration: {
      activeRevisionsMode: 'Single'
      ingress: {
        allowInsecure: false
        external: true
        targetPort: 3000
        transport: 'auto'
      }
      registries: commonRegistryConfig
      secrets: [
        {
          name: 'jwt-secret'
          value: jwtSecret
        }
        {
          name: 'registry-password'
          value: registryPassword
        }
      ]
    }
    template: {
      containers: [
        {
          env: [
            {
              name: 'DOCUMENTS_SERVICE_URL'
              value: 'https://${documentsApp.properties.configuration.ingress.fqdn}'
            }
            {
              name: 'FRONTEND_ORIGIN'
              value: frontendOrigin
            }
            {
              name: 'HOST'
              value: '0.0.0.0'
            }
            {
              name: 'IDENTITY_SERVICE_URL'
              value: 'https://${identityApp.properties.configuration.ingress.fqdn}'
            }
            {
              name: 'INVOICING_SERVICE_URL'
              value: 'https://${invoicingApp.properties.configuration.ingress.fqdn}'
            }
            {
              name: 'JWT_SECRET'
              secretRef: 'jwt-secret'
            }
            {
              name: 'LEDGER_SERVICE_URL'
              value: 'https://${ledgerApp.properties.configuration.ingress.fqdn}'
            }
            {
              name: 'PORT'
              value: '3000'
            }
            {
              name: 'REPORTING_SERVICE_URL'
              value: 'https://${reportingApp.properties.configuration.ingress.fqdn}'
            }
          ]
          image: '${registryLoginServer}/abacus/api-gateway:${imageTag}'
          name: 'api-gateway'
          resources: {
            cpu: 0.5
            memory: '1Gi'
          }
        }
      ]
      scale: {
        maxReplicas: 2
        minReplicas: 1
      }
    }
  }
}

output gatewayUrl string = 'https://${gatewayApp.properties.configuration.ingress.fqdn}'
output managedEnvironmentId string = managedEnvironment.id

