/**
 * T42-1: Streaming Metrics Tests
 * 
 * 测试streaming metrics收集和格式化功能
 */

import { describe, it, expect, beforeEach } from 'vitest';
import {
  recordStreamCompletion,
  buildStreamingMetricsLines,
  getMetricsSummary,
  getMetricsStore,
  resetMetrics,
} from '../services/llm/streaming_metrics.js';

describe('Streaming Metrics Collection', () => {
  beforeEach(() => {
    // 每个测试前清空metrics
    resetMetrics();
  });

  it('should record basic stream completion', () => {
    recordStreamCompletion({
      provider: 'gemini',
      model: 'gemini-2.5-flash',
      chunkCount: 5,
      textLength: 120,
      truncationSuspected: false,
    });

    const store = getMetricsStore();
    const entry = store.get('gemini_gemini-2.5-flash');

    expect(entry).toBeDefined();
    expect(entry.chunks_total).toBe(5);
    expect(entry.streams_total).toBe(1);
    expect(entry.truncation_suspected_total).toBe(0);
    expect(entry.text_length_count).toBe(1);
    expect(entry.text_length_sum).toBe(120);
  });

  it('should accumulate multiple streams', () => {
    // 第一个stream
    recordStreamCompletion({
      provider: 'openai',
      model: 'gpt-4',
      chunkCount: 10,
      textLength: 200,
      truncationSuspected: false,
    });

    // 第二个stream
    recordStreamCompletion({
      provider: 'openai',
      model: 'gpt-4',
      chunkCount: 15,
      textLength: 300,
      truncationSuspected: false,
    });

    const store = getMetricsStore();
    const entry = store.get('openai_gpt-4');

    expect(entry.streams_total).toBe(2);
    expect(entry.chunks_total).toBe(25);  // 10 + 15
    expect(entry.text_length_sum).toBe(500);  // 200 + 300
    expect(entry.text_length_count).toBe(2);
  });

  it('should detect truncation suspicion', () => {
    recordStreamCompletion({
      provider: 'gemini',
      model: 'gemini-2.5-flash',
      chunkCount: 3,
      textLength: 50,
      truncationSuspected: true,  // 检测到remaining buffer
    });

    const store = getMetricsStore();
    const entry = store.get('gemini_gemini-2.5-flash');

    expect(entry.truncation_suspected_total).toBe(1);
  });

  it('should handle multiple providers', () => {
    recordStreamCompletion({
      provider: 'gemini',
      model: 'gemini-2.5-flash',
      chunkCount: 5,
      textLength: 100,
      truncationSuspected: false,
    });

    recordStreamCompletion({
      provider: 'openai',
      model: 'gpt-4',
      chunkCount: 8,
      textLength: 200,
      truncationSuspected: false,
    });

    recordStreamCompletion({
      provider: 'anthropic',
      model: 'claude-3-5-sonnet-20241022',
      chunkCount: 12,
      textLength: 300,
      truncationSuspected: false,
    });

    const store = getMetricsStore();
    expect(store.size).toBe(3);
    expect(store.has('gemini_gemini-2.5-flash')).toBe(true);
    expect(store.has('openai_gpt-4')).toBe(true);
    expect(store.has('anthropic_claude-3-5-sonnet-20241022')).toBe(true);
  });

  it('should categorize text lengths into histogram buckets', () => {
    // 测试不同长度的文本分类到不同bucket
    recordStreamCompletion({
      provider: 'test',
      model: 'test-model',
      chunkCount: 1,
      textLength: 50,  // bucket: 100
      truncationSuspected: false,
    });

    recordStreamCompletion({
      provider: 'test',
      model: 'test-model',
      chunkCount: 1,
      textLength: 250,  // bucket: 500
      truncationSuspected: false,
    });

    recordStreamCompletion({
      provider: 'test',
      model: 'test-model',
      chunkCount: 1,
      textLength: 800,  // bucket: 1000
      truncationSuspected: false,
    });

    recordStreamCompletion({
      provider: 'test',
      model: 'test-model',
      chunkCount: 1,
      textLength: 3000,  // bucket: 5000
      truncationSuspected: false,
    });

    const store = getMetricsStore();
    const entry = store.get('test_test-model');
    const histogram = entry.text_length_histogram;

    expect(histogram.get(100)).toBe(1);  // 50 -> bucket 100
    expect(histogram.get(500)).toBe(1);  // 250 -> bucket 500
    expect(histogram.get(1000)).toBe(1);  // 800 -> bucket 1000
    expect(histogram.get(5000)).toBe(1);  // 3000 -> bucket 5000
  });
});

describe('Streaming Metrics Formatting', () => {
  beforeEach(() => {
    resetMetrics();
  });

  it('should build Prometheus format metrics lines', () => {
    recordStreamCompletion({
      provider: 'gemini',
      model: 'gemini-2.5-flash',
      chunkCount: 10,
      textLength: 150,
      truncationSuspected: false,
    });

    const lines = buildStreamingMetricsLines();

    expect(lines).toContain('## llm_streaming');
    expect(lines).toContain('# TYPE llm_stream_chunks_total counter');
    expect(lines).toContain('llm_stream_chunks_total{provider="gemini",model="gemini-2.5-flash"} 10');
    expect(lines).toContain('# TYPE llm_stream_suspected_truncation_total counter');
    expect(lines).toContain('llm_stream_suspected_truncation_total{provider="gemini",model="gemini-2.5-flash"} 0');
    expect(lines).toContain('# TYPE llm_streams_total counter');
    expect(lines).toContain('llm_streams_total{provider="gemini",model="gemini-2.5-flash"} 1');
  });

  it('should include histogram buckets in correct format', () => {
    recordStreamCompletion({
      provider: 'test',
      model: 'test-model',
      chunkCount: 5,
      textLength: 120,
      truncationSuspected: false,
    });

    const lines = buildStreamingMetricsLines();
    const histogramLines = lines.filter(line => 
      line.includes('llm_stream_text_length_histogram')
    );

    // 应该包含bucket, sum, count
    expect(histogramLines.some(line => line.includes('le="100"'))).toBe(true);
    expect(histogramLines.some(line => line.includes('le="500"'))).toBe(true);
    expect(histogramLines.some(line => line.includes('le="+Inf"'))).toBe(true);
    expect(histogramLines.some(line => line.includes('_sum{'))).toBe(true);
    expect(histogramLines.some(line => line.includes('_count{'))).toBe(true);
  });

  it('should show cumulative counts in histogram buckets', () => {
    // 添加多个样本
    recordStreamCompletion({
      provider: 'test',
      model: 'test-model',
      chunkCount: 1,
      textLength: 50,  // bucket 100
      truncationSuspected: false,
    });

    recordStreamCompletion({
      provider: 'test',
      model: 'test-model',
      chunkCount: 1,
      textLength: 250,  // bucket 500
      truncationSuspected: false,
    });

    const lines = buildStreamingMetricsLines();
    
    // bucket 100应该有1个样本
    expect(lines).toContain('llm_stream_text_length_histogram_bucket{provider="test",model="test-model",le="100"} 1');
    
    // bucket 500应该有2个累计样本 (100的1个 + 500的1个)
    expect(lines).toContain('llm_stream_text_length_histogram_bucket{provider="test",model="test-model",le="500"} 2');
    
    // sum应该是300 (50 + 250)
    expect(lines).toContain('llm_stream_text_length_histogram_sum{provider="test",model="test-model"} 300');
    
    // count应该是2
    expect(lines).toContain('llm_stream_text_length_histogram_count{provider="test",model="test-model"} 2');
  });
});

describe('Metrics Summary', () => {
  beforeEach(() => {
    resetMetrics();
  });

  it('should generate readable metrics summary', () => {
    recordStreamCompletion({
      provider: 'gemini',
      model: 'gemini-2.5-flash',
      chunkCount: 10,
      textLength: 200,
      truncationSuspected: false,
    });

    recordStreamCompletion({
      provider: 'gemini',
      model: 'gemini-2.5-flash',
      chunkCount: 15,
      textLength: 300,
      truncationSuspected: true,
    });

    const summary = getMetricsSummary();
    const entry = summary['gemini_gemini-2.5-flash'];

    expect(entry).toBeDefined();
    expect(entry.provider).toBe('gemini');
    expect(entry.model).toBe('gemini-2.5-flash');
    expect(entry.streams_total).toBe(2);
    expect(entry.chunks_total).toBe(25);
    expect(entry.avg_chunks_per_stream).toBe(13);  // Math.round(25/2)
    expect(entry.truncation_suspected_total).toBe(1);
    expect(entry.truncation_rate_percent).toBe('50.00');
    expect(entry.avg_text_length).toBe(250);  // Math.round(500/2)
    expect(entry.text_samples).toBe(2);
  });

  it('should handle zero streams gracefully', () => {
    const summary = getMetricsSummary();
    expect(summary).toEqual({});
  });

  it('should calculate truncation rate correctly', () => {
    // 10个stream, 2个有truncation
    for (let i = 0; i < 8; i++) {
      recordStreamCompletion({
        provider: 'test',
        model: 'test-model',
        chunkCount: 5,
        textLength: 100,
        truncationSuspected: false,
      });
    }

    for (let i = 0; i < 2; i++) {
      recordStreamCompletion({
        provider: 'test',
        model: 'test-model',
        chunkCount: 5,
        textLength: 100,
        truncationSuspected: true,
      });
    }

    const summary = getMetricsSummary();
    const entry = summary['test_test-model'];

    expect(entry.streams_total).toBe(10);
    expect(entry.truncation_suspected_total).toBe(2);
    expect(entry.truncation_rate_percent).toBe('20.00');
  });
});
