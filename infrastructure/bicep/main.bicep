targetScope = 'resourceGroup'

@allowed([
  'dev'
  'staging'
  'prod'
])
param environment string

param location string = resourceGroup().location
param prefix string = 'abacus'
param databaseName string = 'abacus'
param containerImageTag string = 'latest'
param frontendOrigin string
param objectStorageEndpoint string = ''
param objectStorageAccessKeyId string = ''
@secure()
param objectStorageSecretAccessKey string = ''
param objectStorageRegion string = 'us-east-1'
param documentsBucket string = 'accounting-documents'
param reportsBucket string = 'accounting-reports'
param invoicesBucket string = 'accounting-invoices'
param postgresAdminLogin string
@secure()
param postgresAdminPassword string
@secure()
param jwtSecret string
param enableStaticWebApp bool = true
param tags object = {}

var resourcePrefix = '${prefix}-${environment}'
var mergedTags = union(tags, {
  application: 'abacus'
  environment: environment
})

module monitoring 'modules/monitoring.bicep' = {
  name: '${resourcePrefix}-monitoring'
  params: {
    applicationInsightsName: '${resourcePrefix}-appi'
    location: location
    tags: mergedTags
    workspaceName: '${resourcePrefix}-log'
  }
}

module registry 'modules/registry.bicep' = {
  name: '${resourcePrefix}-registry'
  params: {
    location: location
    registryName: replace('${resourcePrefix}cr', '-', '')
    tags: mergedTags
  }
}

module storage 'modules/storage.bicep' = {
  name: '${resourcePrefix}-storage'
  params: {
    containerNames: [
      documentsBucket
      reportsBucket
      invoicesBucket
    ]
    location: location
    storageAccountName: take(replace('${resourcePrefix}storage', '-', ''), 24)
    tags: mergedTags
  }
}

module keyVault 'modules/keyvault.bicep' = {
  name: '${resourcePrefix}-keyvault'
  params: {
    keyVaultName: take(replace('${resourcePrefix}-kv', '-', ''), 24)
    location: location
    tags: mergedTags
  }
}

module redis 'modules/redis.bicep' = {
  name: '${resourcePrefix}-redis'
  params: {
    location: location
    redisName: '${resourcePrefix}-redis'
    tags: mergedTags
  }
}

module postgresql 'modules/postgresql.bicep' = {
  name: '${resourcePrefix}-postgresql'
  params: {
    administratorLogin: postgresAdminLogin
    administratorLoginPassword: postgresAdminPassword
    databaseName: databaseName
    location: location
    serverName: '${resourcePrefix}-pg'
    tags: mergedTags
  }
}

var identityDatabaseUrl = 'postgresql://${postgresAdminLogin}:${postgresAdminPassword}@${postgresql.outputs.fullyQualifiedDomainName}:5432/${databaseName}?sslmode=require&schema=identity'
var ledgerDatabaseUrl = 'postgresql://${postgresAdminLogin}:${postgresAdminPassword}@${postgresql.outputs.fullyQualifiedDomainName}:5432/${databaseName}?sslmode=require&schema=ledger'
var documentsDatabaseUrl = 'postgresql://${postgresAdminLogin}:${postgresAdminPassword}@${postgresql.outputs.fullyQualifiedDomainName}:5432/${databaseName}?sslmode=require&schema=documents'
var reportingDatabaseUrl = 'postgresql://${postgresAdminLogin}:${postgresAdminPassword}@${postgresql.outputs.fullyQualifiedDomainName}:5432/${databaseName}?sslmode=require&schema=reporting'
var invoicingDatabaseUrl = 'postgresql://${postgresAdminLogin}:${postgresAdminPassword}@${postgresql.outputs.fullyQualifiedDomainName}:5432/${databaseName}?sslmode=require&schema=invoicing'
var redisConnectionString = 'rediss://default:${redis.outputs.primaryKey}@${redis.outputs.hostName}:${redis.outputs.sslPort}'

module containerApps 'modules/container-apps.bicep' = {
  name: '${resourcePrefix}-container-apps'
  params: {
    containerAppsEnvironmentName: '${resourcePrefix}-aca-env'
    documentsBucket: documentsBucket
    documentsDatabaseUrl: documentsDatabaseUrl
    documentsName: '${resourcePrefix}-documents'
    frontendOrigin: frontendOrigin
    gatewayName: '${resourcePrefix}-api-gateway'
    identityDatabaseUrl: identityDatabaseUrl
    identityName: '${resourcePrefix}-identity'
    imageTag: containerImageTag
    invoicesBucket: invoicesBucket
    invoicingDatabaseUrl: invoicingDatabaseUrl
    invoicingName: '${resourcePrefix}-invoicing'
    jwtSecret: jwtSecret
    ledgerDatabaseUrl: ledgerDatabaseUrl
    ledgerName: '${resourcePrefix}-ledger'
    location: location
    logAnalyticsCustomerId: monitoring.outputs.logAnalyticsCustomerId
    logAnalyticsSharedKey: monitoring.outputs.logAnalyticsSharedKey
    objectStorageAccessKeyId: objectStorageAccessKeyId
    objectStorageEndpoint: objectStorageEndpoint
    objectStorageRegion: objectStorageRegion
    objectStorageSecretAccessKey: objectStorageSecretAccessKey
    redisConnectionString: redisConnectionString
    registryLoginServer: registry.outputs.loginServer
    registryPassword: registry.outputs.password
    registryUsername: registry.outputs.username
    reportingDatabaseUrl: reportingDatabaseUrl
    reportingName: '${resourcePrefix}-reporting'
    reportsBucket: reportsBucket
    tags: mergedTags
  }
  dependsOn: [
    monitoring
    registry
    redis
    postgresql
  ]
}

module staticWeb 'modules/staticweb.bicep' = if (enableStaticWebApp) {
  name: '${resourcePrefix}-staticweb'
  params: {
    location: location
    staticWebAppName: '${resourcePrefix}-web'
    tags: mergedTags
  }
}

output containerRegistryLoginServer string = registry.outputs.loginServer
output gatewayUrl string = containerApps.outputs.gatewayUrl
output keyVaultUri string = keyVault.outputs.vaultUri
output postgresHost string = postgresql.outputs.fullyQualifiedDomainName
output redisHost string = redis.outputs.hostName
output staticWebAppHostName string = enableStaticWebApp ? staticWeb.outputs.defaultHostname : ''
output storageBlobEndpoint string = storage.outputs.blobEndpoint
