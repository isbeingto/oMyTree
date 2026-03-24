/**
 * LLMProvider Base Interface
 * 
 * 所有 LLM Provider 都应实现这个统一接口。
 * 
 * @typedef {Object} ChatOptions
 * @property {number} [max_tokens] - 最大生成 token 数
 * @property {number} [temperature] - 温度参数 (0-1)
 * @property {number} [timeout_ms] - 请求超时（毫秒）
 * @property {string} [model] - 模型名称
 * @property {string} [mode] - 调用模式 (text, json, relevance, summarize, topic_guard)
 * 
 * @typedef {Object} ChatResult
 * @property {string} ai_text - 模型返回的文本
 * @property {Object|null} usage_json - 使用量统计
 * @property {Object} [parsed_json] - JSON 模式下解析后的结果
 * 
 * @typedef {Object} LLMProviderConfig
 * @property {string} id - Provider 唯一标识 (e.g., "omytree-default", "openai", "mock")
 * @property {string} name - Provider 显示名称
 * @property {string} [description] - Provider 描述
 */

/**
 * LLMProvider 抽象基类
 * 
 * 所有 Provider 都应该继承此类或实现相同的接口结构。
 */
export class LLMProvider {
  /**
   * @param {LLMProviderConfig} config 
   */
  constructor(config) {
    if (!config || !config.id) {
      throw new Error('LLMProvider requires config with id');
    }
    this.id = config.id;
    this.name = config.name || config.id;
    this.description = config.description || '';
  }

  /**
   * 调用 Chat 接口
   * 
   * @param {Object} params
   * @param {string} params.prompt - 用户提示词
   * @param {Object} [params.metadata] - 附加元数据
   * @param {ChatOptions} [params.options] - 调用选项
   * @returns {Promise<ChatResult>}
   */
  async callChat(params) {
    throw new Error('callChat must be implemented by subclass');
  }

  /**
   * 验证 Provider 是否可用（配置完整）
   * @returns {boolean}
   */
  isAvailable() {
    return false;
  }

  /**
   * 获取 Provider 信息
   * @returns {LLMProviderConfig}
   */
  getInfo() {
    return {
      id: this.id,
      name: this.name,
      description: this.description,
      available: this.isAvailable(),
    };
  }
}

export default LLMProvider;
