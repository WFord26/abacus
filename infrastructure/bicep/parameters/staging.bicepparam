using '../main.bicep'

param environment = 'staging'
param location = 'eastus2'
param prefix = 'abacus'
param containerImageTag = 'latest'
param frontendOrigin = 'https://abacus-staging-web.azurestaticapps.net'
param objectStorageEndpoint = 'https://replace-me-with-s3-compatible-endpoint.example.com'
param objectStorageAccessKeyId = 'replace-me'
param objectStorageSecretAccessKey = 'replace-me'
param postgresAdminLogin = 'abacusadmin'
param postgresAdminPassword = 'replace-me'
param jwtSecret = 'replace-me'
param tags = {
  application: 'abacus'
  owner: 'platform'
}

