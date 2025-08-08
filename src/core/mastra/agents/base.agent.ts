import { createAgent } from '@mastra/core';
import { logger } from '../../../utils/logger';

export interface BaseAgentConfig {
  name: string;
  description: string;
  version: string;
}

export interface BaseAgentContext {
  logger: typeof logger;
  config: Record<string, any>;
}

export abstract class BaseAgent {
  protected logger = logger;
  protected config: BaseAgentConfig;
  
  constructor(config: BaseAgentConfig) {
    this.config = config;
  }
  
  abstract execute(input: any): Promise<any>;
  
  protected async beforeExecute(input: any): Promise<void> {
    this.logger.debug(`${this.config.name} agent starting execution`, { input });
  }
  
  protected async afterExecute(result: any): Promise<void> {
    this.logger.debug(`${this.config.name} agent completed execution`, { 
      resultKeys: Object.keys(result || {}) 
    });
  }
  
  protected async onError(error: Error, input: any): Promise<void> {
    this.logger.error(`${this.config.name} agent failed`, {
      error: error.message,
      stack: error.stack,
      input,
    });
  }
  
  async run(input: any): Promise<any> {
    try {
      await this.beforeExecute(input);
      const result = await this.execute(input);
      await this.afterExecute(result);
      return result;
    } catch (error: any) {
      await this.onError(error, input);
      throw error;
    }
  }
}

// Helper function to create Mastra-compatible agent
export function createMastraAgent(agentClass: typeof BaseAgent, config: BaseAgentConfig) {
  return createAgent({
    name: config.name,
    description: config.description,
    execute: async (input: any) => {
      const agent = new (agentClass as any)(config);
      return await agent.run(input);
    },
  });
}