import { getEnvironmentConfig, getAvailableStages, isValidStage } from './environment-configs';
import { EcsEnvironmentConfig } from './types';


// Helper function to validate environment configuration
export function validateEnvironmentConfig(stage: string): boolean {
  const envConfig = getEnvironmentConfig(stage);
  
  if (!envConfig) {
    throw new Error(`No environment configuration found for stage: ${stage}`);
  }
  
  return validateEcsConfig(envConfig.serviceConfig.ecsConfig);
}

function validateEcsConfig(ecsConfig: EcsEnvironmentConfig){
  // Validate CPU and memory combinations (Fargate requirements)
  const validCombinations = [
    { cpu: 256, memoryMin: 512, memoryMax: 2048 },
    { cpu: 512, memoryMin: 1024, memoryMax: 4096 },
    { cpu: 1024, memoryMin: 2048, memoryMax: 8192 },
    { cpu: 2048, memoryMin: 4096, memoryMax: 16384 },
    { cpu: 4096, memoryMin: 8192, memoryMax: 30720 },
  ];
  
  const validCombo = validCombinations.find(combo => 
    combo.cpu === ecsConfig.cpu && 
    ecsConfig.memoryLimitMiB >= combo.memoryMin && 
    ecsConfig.memoryLimitMiB <= combo.memoryMax
  );
  
  if (!validCombo) {
    throw new Error(`Invalid CPU/Memory combination: ${ecsConfig.cpu} CPU, ${ecsConfig.memoryLimitMiB} MB memory`);
  }
  
  // Validate capacity settings
  if (ecsConfig.minCapacity > ecsConfig.maxCapacity) {
    throw new Error('minCapacity cannot be greater than maxCapacity');
  }
  
  if (ecsConfig.desiredCount < ecsConfig.minCapacity || ecsConfig.desiredCount > ecsConfig.maxCapacity) {
    throw new Error('desiredCount must be between minCapacity and maxCapacity');
  }
  
  // Validate deployment percentages
  if (ecsConfig.minHealthyPercent > 100) {
    throw new Error('minHealthyPercent cannot be greater than 100');
  }
  
  return true;
}

/**
 * Get all available deployment stages.
 * 
 * @returns Array of configured deployment stage names
 */
export function getAvailableDeploymentStages(): string[] {
  return getAvailableStages();
}

/**
 * Check if a deployment stage is valid/configured.
 * 
 * @param stage - Stage name to validate
 * @returns True if stage is configured
 */
export function isValidDeploymentStage(stage: string): boolean {
  return isValidStage(stage);
}