/**
 * Unit tests for ResourceNameGenerator
 * 
 * These tests verify the resource name generation, validation, and collision resolution
 * functionality of the ResourceNameGenerator class.
 */

import {
  ResourceNameGenerator,
  AWS_NAMING_RULES,
  CollisionResolutionStrategy,
  DEFAULT_GENERATOR_CONFIG,
  NameGenerationContext
} from '../resource-name-generator';
import {
  ApplicationConfig,
  EnvironmentConfig,
  ResourceNames
} from '../configuration-types';

describe('ResourceNameGenerator', () => {
  let generator: ResourceNameGenerator;
  let mockApplicationConfig: ApplicationConfig;
  let mockEnvironmentConfig: EnvironmentConfig;

  beforeEach(() => {
    // Mock application configuration
    mockApplicationConfig = {
      applicationName: 'test-app',
      applicationDisplayName: 'Test Application',
      sourceDirectory: 'test-app',
      ecrRepositoryName: 'test-app-repo',
      dockerfilePath: 'Dockerfile',
      containerPort: 3000,
      healthCheckPath: '/health',
      serviceName: 'test-app-service',
      clusterNameSuffix: 'cluster',
      taskDefinitionFamily: 'test-app-task',
      albName: 'test-app-alb',
      targetGroupName: 'test-app-tg',
      buildCommands: ['npm ci', 'npm run build'],
      dockerBuildArgs: { NODE_ENV: 'production' }
    };

    // Mock environment configuration
    mockEnvironmentConfig = {
      stage: 'beta',
      namingConvention: {
        useStagePrefix: false,
        useStageSuffix: true,
        separator: '-'
      }
    };

    generator = new ResourceNameGenerator();
  });

  describe('constructor', () => {
    it('should initialize with default configuration', () => {
      const defaultGenerator = new ResourceNameGenerator();
      expect(defaultGenerator.getExistingNames()).toEqual([]);
    });

    it('should initialize with custom configuration', () => {
      const customConfig = {
        ...DEFAULT_GENERATOR_CONFIG,
        collisionResolution: CollisionResolutionStrategy.HASH_SUFFIX
      };
      const customGenerator = new ResourceNameGenerator(customConfig);
      expect(customGenerator.getExistingNames()).toEqual([]);
    });

    it('should initialize with existing names', () => {
      const existingNames = new Set(['existing-name-1', 'existing-name-2']);
      const generatorWithNames = new ResourceNameGenerator(DEFAULT_GENERATOR_CONFIG, existingNames);
      expect(generatorWithNames.getExistingNames()).toEqual(['existing-name-1', 'existing-name-2']);
    });
  });

  describe('generateResourceNames', () => {
    let context: NameGenerationContext;

    beforeEach(() => {
      context = {
        applicationConfig: mockApplicationConfig,
        stage: 'beta',
        environmentConfig: mockEnvironmentConfig
      };
    });

    it('should generate all resource names with stage suffix', () => {
      const resourceNames = generator.generateResourceNames(context);

      expect(resourceNames.ecrRepositoryName).toBe('test-app-repo-beta');
      expect(resourceNames.clusterName).toBe('test-app-cluster-beta');
      expect(resourceNames.serviceName).toBe('test-app-service-beta');
      expect(resourceNames.taskDefinitionFamily).toBe('test-app-task-beta');
      expect(resourceNames.albName).toBe('test-app-alb-beta');
      expect(resourceNames.targetGroupName).toBe('test-app-tg-beta');
      expect(resourceNames.logGroupName).toBe('/aws/ecs/test-app-beta');
      expect(resourceNames.albSecurityGroupName).toBe('test-app-alb-sg-beta');
      expect(resourceNames.ecsSecurityGroupName).toBe('test-app-ecs-sg-beta');
    });

    it('should generate names with stage prefix when configured', () => {
      context.environmentConfig = {
        stage: 'beta',
        namingConvention: {
          useStagePrefix: true,
          useStageSuffix: false,
          separator: '-'
        }
      };

      const resourceNames = generator.generateResourceNames(context);

      expect(resourceNames.ecrRepositoryName).toBe('beta-test-app-repo');
      expect(resourceNames.serviceName).toBe('beta-test-app-service');
      expect(resourceNames.albName).toBe('beta-test-app-alb');
    });

    it('should generate names with both prefix and suffix', () => {
      // Use shorter names to avoid length issues with both prefix and suffix
      const shortContext = {
        applicationConfig: {
          ...mockApplicationConfig,
          applicationName: 'app',
          ecrRepositoryName: 'app-repo',
          serviceName: 'app-svc',
          clusterNameSuffix: 'cls',
          taskDefinitionFamily: 'app-task',
          albName: 'app-alb',
          targetGroupName: 'app-tg'
        },
        stage: 'beta',
        environmentConfig: {
          stage: 'beta',
          namingConvention: {
            useStagePrefix: true,
            useStageSuffix: true,
            separator: '-'
          }
        }
      };

      const resourceNames = generator.generateResourceNames(shortContext);

      expect(resourceNames.ecrRepositoryName).toBe('beta-app-repo-beta');
      expect(resourceNames.serviceName).toBe('beta-app-svc-beta');
    });

    it('should generate names without environment config (defaults)', () => {
      const contextWithoutEnv = {
        applicationConfig: mockApplicationConfig,
        stage: 'prod'
      };

      const resourceNames = generator.generateResourceNames(contextWithoutEnv);

      expect(resourceNames.ecrRepositoryName).toBe('test-app-repo-prod');
      expect(resourceNames.serviceName).toBe('test-app-service-prod');
    });

    it('should normalize ECR repository names', () => {
      context.applicationConfig.ecrRepositoryName = 'Test_App.Repository';
      
      const resourceNames = generator.generateResourceNames(context);

      expect(resourceNames.ecrRepositoryName).toBe('test_app.repository-beta');
    });

    it('should handle existing names in context', () => {
      context.existingNames = new Set(['test-app-service-beta']);

      const resourceNames = generator.generateResourceNames(context);

      // Should generate unique name for service due to conflict
      expect(resourceNames.serviceName).toBe('test-app-service-beta-1');
      expect(resourceNames.ecrRepositoryName).toBe('test-app-repo-beta'); // No conflict
    });

    it('should throw error for invalid generated names', () => {
      // Create a name that will be too long
      context.applicationConfig.albName = 'a'.repeat(50);

      expect(() => generator.generateResourceNames(context)).toThrow('exceeds maximum length');
    });
  });

  describe('collision resolution', () => {
    beforeEach(() => {
      generator.addExistingNames(['test-name', 'test-name-1']);
    });

    it('should resolve conflicts with numeric suffix strategy', () => {
      const config = {
        ...DEFAULT_GENERATOR_CONFIG,
        collisionResolution: CollisionResolutionStrategy.NUMERIC_SUFFIX
      };
      const generatorWithNumeric = new ResourceNameGenerator(config, new Set(['test-name-beta', 'test-name-beta-1']));

      const context: NameGenerationContext = {
        applicationConfig: { ...mockApplicationConfig, serviceName: 'test-name' },
        stage: 'beta'
      };

      const resourceNames = generatorWithNumeric.generateResourceNames(context);
      expect(resourceNames.serviceName).toBe('test-name-beta-2');
    });

    it('should resolve conflicts with hash suffix strategy', () => {
      const config = {
        ...DEFAULT_GENERATOR_CONFIG,
        collisionResolution: CollisionResolutionStrategy.HASH_SUFFIX
      };
      const generatorWithHash = new ResourceNameGenerator(config, new Set(['test-name-beta']));

      const context: NameGenerationContext = {
        applicationConfig: { ...mockApplicationConfig, serviceName: 'test-name' },
        stage: 'beta'
      };

      const resourceNames = generatorWithHash.generateResourceNames(context);
      expect(resourceNames.serviceName).toMatch(/^test-name-beta-[a-z0-9]{6}$/);
    });

    it('should throw error with ERROR collision strategy', () => {
      const config = {
        ...DEFAULT_GENERATOR_CONFIG,
        collisionResolution: CollisionResolutionStrategy.ERROR
      };
      const generatorWithError = new ResourceNameGenerator(config, new Set(['test-name-beta']));

      const context: NameGenerationContext = {
        applicationConfig: { ...mockApplicationConfig, serviceName: 'test-name' },
        stage: 'beta'
      };

      expect(() => generatorWithError.generateResourceNames(context)).toThrow('Naming conflict detected');
    });

    it('should throw error when max collision attempts exceeded', () => {
      const config = {
        ...DEFAULT_GENERATOR_CONFIG,
        maxCollisionAttempts: 2
      };
      
      // Create many existing names to force collision limit
      const existingNames = new Set<string>();
      for (let i = 0; i <= 5; i++) {
        existingNames.add(`test-name-beta${i > 0 ? `-${i}` : ''}`);
      }
      
      const generatorWithLimit = new ResourceNameGenerator(config, existingNames);

      const context: NameGenerationContext = {
        applicationConfig: { ...mockApplicationConfig, serviceName: 'test-name' },
        stage: 'beta'
      };

      expect(() => generatorWithLimit.generateResourceNames(context)).toThrow('Unable to generate unique name');
    });
  });

  describe('validateResourceNames', () => {
    let validResourceNames: ResourceNames;

    beforeEach(() => {
      validResourceNames = {
        ecrRepositoryName: 'test-app-repo-beta',
        clusterName: 'test-app-cluster-beta',
        serviceName: 'test-app-service-beta',
        taskDefinitionFamily: 'test-app-task-beta',
        albName: 'test-app-alb-beta',
        targetGroupName: 'test-app-tg-beta',
        logGroupName: '/aws/ecs/test-app-beta',
        albSecurityGroupName: 'test-app-alb-sg-beta',
        ecsSecurityGroupName: 'test-app-ecs-sg-beta'
      };
    });

    it('should validate valid resource names', () => {
      const result = generator.validateResourceNames(validResourceNames);

      expect(result.isValid).toBe(true);
      expect(result.errors).toHaveLength(0);
    });

    it('should detect invalid ECR repository names', () => {
      const invalidNames = {
        ...validResourceNames,
        ecrRepositoryName: 'INVALID_ECR_NAME'
      };

      const result = generator.validateResourceNames(invalidNames);

      expect(result.isValid).toBe(false);
      expect(result.errors).toContain("Invalid ecrRepositoryName: 'INVALID_ECR_NAME'");
    });

    it('should detect names that are too long', () => {
      const invalidNames = {
        ...validResourceNames,
        albName: 'a'.repeat(50) // Exceeds ALB name limit of 32
      };

      const result = generator.validateResourceNames(invalidNames);

      expect(result.isValid).toBe(false);
      expect(result.errors.some(error => error.includes('Invalid albName'))).toBe(true);
    });

    it('should detect duplicate resource names', () => {
      const duplicateNames = {
        ...validResourceNames,
        serviceName: validResourceNames.ecrRepositoryName // Duplicate
      };

      const result = generator.validateResourceNames(duplicateNames);

      expect(result.isValid).toBe(false);
      expect(result.errors).toContain(`Duplicate resource names detected: ${validResourceNames.ecrRepositoryName}`);
    });

    it('should warn about reserved prefixes', () => {
      const reservedNames = {
        ...validResourceNames,
        serviceName: 'aws-test-service'
      };

      const result = generator.validateResourceNames(reservedNames);

      expect(result.warnings).toContain("serviceName 'aws-test-service' starts with reserved prefix");
    });

    it('should handle validation errors gracefully', () => {
      const invalidNames = {
        ...validResourceNames,
        ecrRepositoryName: null as any
      };

      const result = generator.validateResourceNames(invalidNames);

      expect(result.isValid).toBe(false);
      expect(result.errors.some(error => error.includes('ecrRepositoryName'))).toBe(true);
    });
  });

  describe('validateSingleResourceName', () => {
    it('should validate valid resource names', () => {
      const result = generator.validateSingleResourceName('valid-name', 'serviceName');

      expect(result.isValid).toBe(true);
      expect(result.errors).toHaveLength(0);
    });

    it('should detect empty or null names', () => {
      const result1 = generator.validateSingleResourceName('', 'serviceName');
      const result2 = generator.validateSingleResourceName(null as any, 'serviceName');

      expect(result1.isValid).toBe(false);
      expect(result1.errors).toContain('Resource name must be a non-empty string');
      expect(result2.isValid).toBe(false);
    });

    it('should detect names that exceed length limits', () => {
      const longName = 'a'.repeat(300);
      const result = generator.validateSingleResourceName(longName, 'serviceName');

      expect(result.isValid).toBe(false);
      expect(result.errors).toContain('Name exceeds maximum length of 255 characters (current: 300)');
    });

    it('should validate ECR repository names specifically', () => {
      const invalidEcrName = 'INVALID_ECR_NAME';
      const result = generator.validateSingleResourceName(invalidEcrName, 'ecrRepositoryName');

      expect(result.isValid).toBe(false);
      expect(result.errors).toContain('ECR repository name must contain only lowercase letters, numbers, hyphens, underscores, and forward slashes');
    });

    it('should validate log group names specifically', () => {
      const invalidLogName = 'invalid log name with spaces';
      const result = generator.validateSingleResourceName(invalidLogName, 'logGroupName');

      expect(result.isValid).toBe(false);
      expect(result.errors).toContain('Log group name contains invalid characters');
    });

    it('should validate general AWS resource names', () => {
      const invalidName = '-invalid-name-';
      const result = generator.validateSingleResourceName(invalidName, 'serviceName');

      expect(result.isValid).toBe(false);
      expect(result.errors).toContain('Name must contain only alphanumeric characters and hyphens, and cannot start or end with a hyphen');
    });

    it('should warn about reserved prefixes', () => {
      const reservedName = 'aws-service';
      const result = generator.validateSingleResourceName(reservedName, 'serviceName');

      expect(result.warnings).toContain('Name starts with a reserved prefix which may cause issues');
    });

    it('should detect existing name conflicts', () => {
      generator.addExistingNames(['existing-name']);
      const result = generator.validateSingleResourceName('existing-name', 'serviceName');

      expect(result.isValid).toBe(false);
      expect(result.errors).toContain('Name already exists and would cause a conflict');
    });
  });

  describe('AWS naming rules validation', () => {
    it('should validate ECR repository naming pattern', () => {
      expect(AWS_NAMING_RULES.ECR_PATTERN.test('valid-repo')).toBe(true);
      expect(AWS_NAMING_RULES.ECR_PATTERN.test('valid_repo')).toBe(true);
      expect(AWS_NAMING_RULES.ECR_PATTERN.test('valid.repo')).toBe(true);
      expect(AWS_NAMING_RULES.ECR_PATTERN.test('namespace/repo')).toBe(true);
      expect(AWS_NAMING_RULES.ECR_PATTERN.test('INVALID_REPO')).toBe(false);
      expect(AWS_NAMING_RULES.ECR_PATTERN.test('-invalid')).toBe(false);
    });

    it('should validate general AWS naming pattern', () => {
      expect(AWS_NAMING_RULES.GENERAL_PATTERN.test('valid-name')).toBe(true);
      expect(AWS_NAMING_RULES.GENERAL_PATTERN.test('ValidName123')).toBe(true);
      expect(AWS_NAMING_RULES.GENERAL_PATTERN.test('-invalid')).toBe(false);
      expect(AWS_NAMING_RULES.GENERAL_PATTERN.test('invalid-')).toBe(false);
      expect(AWS_NAMING_RULES.GENERAL_PATTERN.test('invalid_name')).toBe(false);
    });

    it('should validate log group naming pattern', () => {
      expect(AWS_NAMING_RULES.LOG_GROUP_PATTERN.test('/aws/ecs/app')).toBe(true);
      expect(AWS_NAMING_RULES.LOG_GROUP_PATTERN.test('app-log.group')).toBe(true);
      expect(AWS_NAMING_RULES.LOG_GROUP_PATTERN.test('app_log-group')).toBe(true);
    });

    it('should have correct length limits', () => {
      expect(AWS_NAMING_RULES.LENGTH_LIMITS.ecrRepositoryName).toBe(256);
      expect(AWS_NAMING_RULES.LENGTH_LIMITS.albName).toBe(32);
      expect(AWS_NAMING_RULES.LENGTH_LIMITS.serviceName).toBe(255);
    });

    it('should identify reserved prefixes', () => {
      expect(AWS_NAMING_RULES.RESERVED_PREFIXES).toContain('aws');
      expect(AWS_NAMING_RULES.RESERVED_PREFIXES).toContain('amazon');
      expect(AWS_NAMING_RULES.RESERVED_PREFIXES).toContain('ecs');
    });
  });

  describe('utility methods', () => {
    it('should add existing names', () => {
      generator.addExistingNames(['name1', 'name2']);
      expect(generator.getExistingNames()).toContain('name1');
      expect(generator.getExistingNames()).toContain('name2');
    });

    it('should clear existing names', () => {
      generator.addExistingNames(['name1', 'name2']);
      generator.clearExistingNames();
      expect(generator.getExistingNames()).toHaveLength(0);
    });

    it('should check if name exists', () => {
      generator.addExistingNames(['existing-name']);
      expect(generator.nameExists('existing-name')).toBe(true);
      expect(generator.nameExists('non-existing-name')).toBe(false);
    });
  });

  describe('ECR name normalization', () => {
    it('should normalize ECR names to lowercase', () => {
      const context: NameGenerationContext = {
        applicationConfig: { ...mockApplicationConfig, ecrRepositoryName: 'TestApp' },
        stage: 'beta'
      };

      const resourceNames = generator.generateResourceNames(context);
      expect(resourceNames.ecrRepositoryName).toBe('testapp-beta');
    });

    it('should replace invalid characters with hyphens', () => {
      const context: NameGenerationContext = {
        applicationConfig: { ...mockApplicationConfig, ecrRepositoryName: 'test@app#repo' },
        stage: 'beta'
      };

      const resourceNames = generator.generateResourceNames(context);
      expect(resourceNames.ecrRepositoryName).toBe('test-app-repo-beta');
    });

    it('should remove leading and trailing special characters', () => {
      const context: NameGenerationContext = {
        applicationConfig: { ...mockApplicationConfig, ecrRepositoryName: '_test-app_' },
        stage: 'beta'
      };

      const resourceNames = generator.generateResourceNames(context);
      expect(resourceNames.ecrRepositoryName).toBe('test-app-beta');
    });

    it('should collapse multiple consecutive special characters', () => {
      const context: NameGenerationContext = {
        applicationConfig: { ...mockApplicationConfig, ecrRepositoryName: 'test___app' },
        stage: 'beta'
      };

      const resourceNames = generator.generateResourceNames(context);
      expect(resourceNames.ecrRepositoryName).toBe('test-app-beta');
    });
  });

  describe('hash generation', () => {
    it('should generate consistent short hashes', () => {
      const config = {
        ...DEFAULT_GENERATOR_CONFIG,
        collisionResolution: CollisionResolutionStrategy.HASH_SUFFIX
      };
      const hashGenerator = new ResourceNameGenerator(config);

      // Generate hash multiple times for same input
      const context: NameGenerationContext = {
        applicationConfig: { ...mockApplicationConfig, serviceName: 'test' },
        stage: 'beta',
        existingNames: new Set(['test-beta'])
      };

      const result1 = hashGenerator.generateResourceNames(context);
      hashGenerator.clearExistingNames();
      hashGenerator.addExistingNames(['test-beta']);
      
      const result2 = hashGenerator.generateResourceNames(context);

      // Should generate same hash for same input
      expect(result1.serviceName).toBe(result2.serviceName);
      expect(result1.serviceName).toMatch(/^test-beta-[a-z0-9]{6}$/);
    });
  });

  describe('error handling', () => {
    it('should handle invalid application config gracefully', () => {
      const invalidContext: NameGenerationContext = {
        applicationConfig: {} as ApplicationConfig,
        stage: 'beta'
      };

      expect(() => generator.generateResourceNames(invalidContext)).toThrow();
    });

    it('should handle missing stage gracefully', () => {
      const invalidContext: NameGenerationContext = {
        applicationConfig: mockApplicationConfig,
        stage: ''
      };

      const resourceNames = generator.generateResourceNames(invalidContext);
      // Should still generate names, just without stage suffix
      expect(resourceNames.ecrRepositoryName).toBe('test-app-repo');
    });
  });

  describe('integration with configuration resolver', () => {
    it('should work with resolved configuration from ConfigurationResolver', () => {
      // This test ensures compatibility with the ConfigurationResolver
      const context: NameGenerationContext = {
        applicationConfig: mockApplicationConfig,
        stage: 'prod',
        environmentConfig: {
          stage: 'prod',
          namingConvention: {
            useStagePrefix: false,
            useStageSuffix: true,
            separator: '-'
          }
        }
      };

      const resourceNames = generator.generateResourceNames(context);

      expect(resourceNames.ecrRepositoryName).toBe('test-app-repo-prod');
      expect(resourceNames.serviceName).toBe('test-app-service-prod');
      expect(resourceNames.clusterName).toBe('test-app-cluster-prod');
      
      // Validate all names are AWS compliant
      const validation = generator.validateResourceNames(resourceNames);
      expect(validation.isValid).toBe(true);
    });
  });
});