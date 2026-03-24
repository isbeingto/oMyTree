/**
 * T42-1: Streaming Metrics Collection
 * 
 * 为LLM streaming调用提供可观测性指标:
 * - 记录chunk数量、文本长度
 * - 检测截断嫌疑（remaining buffer未yield）
 * - 提供Prometheus格式的metrics
 */

// 内存存储的metrics数据
// 结构: { provider_model: { chunks_total, truncation_suspected_total, text_length_samples: [] } }
const metricsStore = new Map();

// Histogram buckets for text length (字符数)
// 0-100, 100-500, 500-1000, 1000-5000, 5000+
const TEXT_LENGTH_BUCKETS = [100, 500, 1000, 5000, Infinity];

/**
 * 获取或创建指定provider+model的metrics entry
 * @param {string} provider - Provider name (e.g., 'gemini', 'openai')
 * @param {string} model - Model name (e.g., 'gemini-2.5-flash', 'gpt-4')
 * @returns {object} Metrics entry
 */
function getMetricsEntry(provider, model) {
  const key = `${provider}_${model}`;
  
  if (!metricsStore.has(key)) {
    metricsStore.set(key, {
      provider,
      model,
      chunks_total: 0,
      truncation_suspected_total: 0,
      streams_total: 0,
      text_length_histogram: new Map(TEXT_LENGTH_BUCKETS.map(bucket => [bucket, 0])),
      text_length_sum: 0,
      text_length_count: 0,
    });
  }
  
  return metricsStore.get(key);
}

/**
 * 记录一次streaming调用完成
 * @param {object} params
 * @param {string} params.provider - Provider name
 * @param {string} params.model - Model name
 * @param {number} params.chunkCount - 收到的chunk数量
 * @param {number} params.textLength - 完整文本的字符长度
 * @param {boolean} params.truncationSuspected - 是否检测到截断嫌疑
 */
export function recordStreamCompletion({
  provider,
  model,
  chunkCount,
  textLength,
  truncationSuspected = false,
}) {
  const entry = getMetricsEntry(provider, model);
  
  // 累计总chunk数
  entry.chunks_total += chunkCount;
  
  // 累计stream调用数
  entry.streams_total += 1;
  
  // 如果检测到截断嫌疑，增加计数
  if (truncationSuspected) {
    entry.truncation_suspected_total += 1;
  }
  
  // 记录文本长度到histogram
  if (typeof textLength === 'number' && textLength >= 0) {
    entry.text_length_sum += textLength;
    entry.text_length_count += 1;
    
    // 找到对应的bucket
    for (const bucket of TEXT_LENGTH_BUCKETS) {
      if (textLength <= bucket) {
        const currentCount = entry.text_length_histogram.get(bucket) || 0;
        entry.text_length_histogram.set(bucket, currentCount + 1);
        break;
      }
    }
  }
}

/**
 * 获取所有metrics数据（用于测试）
 * @returns {Map} 完整的metrics store
 */
export function getMetricsStore() {
  return metricsStore;
}

/**
 * 清空所有metrics（用于测试）
 */
export function resetMetrics() {
  metricsStore.clear();
}

/**
 * 构建Prometheus格式的streaming metrics输出
 * @returns {string[]} Prometheus格式的metrics行数组
 */
export function buildStreamingMetricsLines() {
  const lines = [
    '## llm_streaming',
    '# HELP llm_stream_chunks_total Total number of SSE chunks received across all streaming calls',
    '# TYPE llm_stream_chunks_total counter',
  ];
  
  // chunks_total metrics
  for (const [_key, entry] of metricsStore) {
    lines.push(
      `llm_stream_chunks_total{provider="${entry.provider}",model="${entry.model}"} ${entry.chunks_total}`
    );
  }
  
  // truncation_suspected_total metrics
  lines.push(
    '',
    '# HELP llm_stream_suspected_truncation_total Number of streams with suspected truncation (remaining buffer found)',
    '# TYPE llm_stream_suspected_truncation_total counter',
  );
  
  for (const [_key, entry] of metricsStore) {
    lines.push(
      `llm_stream_suspected_truncation_total{provider="${entry.provider}",model="${entry.model}"} ${entry.truncation_suspected_total}`
    );
  }
  
  // streams_total metrics
  lines.push(
    '',
    '# HELP llm_streams_total Total number of streaming calls completed',
    '# TYPE llm_streams_total counter',
  );
  
  for (const [_key, entry] of metricsStore) {
    lines.push(
      `llm_streams_total{provider="${entry.provider}",model="${entry.model}"} ${entry.streams_total}`
    );
  }
  
  // text_length histogram
  lines.push(
    '',
    '# HELP llm_stream_text_length_histogram Distribution of streaming response text lengths',
    '# TYPE llm_stream_text_length_histogram histogram',
  );
  
  for (const [_key, entry] of metricsStore) {
    const labels = `provider="${entry.provider}",model="${entry.model}"`;
    
    // Histogram buckets
    let cumulativeCount = 0;
    for (const bucket of TEXT_LENGTH_BUCKETS) {
      cumulativeCount += entry.text_length_histogram.get(bucket) || 0;
      const leLabel = bucket === Infinity ? '+Inf' : bucket.toString();
      lines.push(
        `llm_stream_text_length_histogram_bucket{${labels},le="${leLabel}"} ${cumulativeCount}`
      );
    }
    
    // Sum and count
    lines.push(
      `llm_stream_text_length_histogram_sum{${labels}} ${entry.text_length_sum}`,
      `llm_stream_text_length_histogram_count{${labels}} ${entry.text_length_count}`
    );
  }
  
  return lines;
}

/**
 * 获取可读的metrics摘要（用于调试和日志）
 * @returns {object} 格式化的metrics摘要
 */
export function getMetricsSummary() {
  const summary = {};
  
  for (const [key, entry] of metricsStore) {
    const avgTextLength = entry.text_length_count > 0 
      ? Math.round(entry.text_length_sum / entry.text_length_count)
      : 0;
    
    const avgChunksPerStream = entry.streams_total > 0
      ? Math.round(entry.chunks_total / entry.streams_total)
      : 0;
    
    const truncationRate = entry.streams_total > 0
      ? ((entry.truncation_suspected_total / entry.streams_total) * 100).toFixed(2)
      : '0.00';
    
    summary[key] = {
      provider: entry.provider,
      model: entry.model,
      streams_total: entry.streams_total,
      chunks_total: entry.chunks_total,
      avg_chunks_per_stream: avgChunksPerStream,
      truncation_suspected_total: entry.truncation_suspected_total,
      truncation_rate_percent: truncationRate,
      avg_text_length: avgTextLength,
      text_samples: entry.text_length_count,
    };
  }
  
  return summary;
}
