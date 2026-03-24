/**
 * T93-5 report_generator.js 验证测试
 * 使用真实数据库数据验证骨架-补全算法
 */
import { generateReport, validateReportSources, computeMainPath, getKeyframesOnPath } from '../../lib/outcome/index.js';
import { pool } from '../../db/pool.js';

const treeId = '73d0e28f-f108-4ebe-8d89-54bfe91004de';
const anchorNodeId = '6de135b4-f99a-4253-8c79-24efb9f267ad';
const userId = 'a98da91a-579d-4d03-83e3-1a0c0926d470';

async function runTest() {
  console.log('=== T93-5 Report Generator Verification ===\n');

  try {
    // Step 1: Compute main path
    console.log('Step 1: Computing main path...');
    const { nodeIds, nodeMap } = await computeMainPath(treeId, anchorNodeId);
    console.log(`  Main path nodes: ${nodeIds.length} nodes`);
    console.log(`  First (root): ${nodeIds[0]}`);
    console.log(`  Last (anchor): ${nodeIds[nodeIds.length - 1]}`);

    // Step 2: Get keyframes on path
    console.log('\nStep 2: Getting keyframes on path...');
    const keyframes = await getKeyframesOnPath(userId, treeId, nodeIds);
    console.log(`  Keyframes on path: ${keyframes.length}`);
    keyframes.forEach(kf => console.log(`    - Level ${kf.nodeLevel}: ${kf.annotation?.slice(0, 30) || '(no annotation)'}`));

    // Step 3: Generate report
    console.log('\nStep 3: Generating report (skeleton-fill)...');
    const outcome = {
      anchor_node_id: anchorNodeId,
      tree_id: treeId,
      conclusion: '这是一次文档解析功能测试，验证了 API 的基本响应能力。',
    };

    const report = await generateReport({
      outcome,
      mainPathNodeIds: nodeIds,
      keyframes,
      nodeMap,
    });

    console.log('\n=== REPORT STRUCTURE ===');
    console.log(`Sections count: ${report.sections.length}`);
    console.log(`Section types: ${report.sections.map(s => s.type).join(', ')}`);
    console.log(`Skeleton keyframe IDs: ${report.skeleton_keyframe_ids.length}`);
    console.log(`Main path node IDs: ${report.main_path_node_ids.length}`);
    console.log(`Expanded node IDs: ${report.expanded_node_ids?.length}`);
    console.log(`Expanded node IDs: ${JSON.stringify(report.expanded_node_ids?.slice(0, 8))}`);
    console.log(`Generation meta:\n${JSON.stringify(report.generation_meta, null, 2)}`);

    // Step 4: Validate sources
    console.log('\n=== VALIDATION ===');
    const validation = validateReportSources(report);
    console.log(`Valid: ${validation.valid}`);
    if (!validation.valid) {
      console.log(`Errors: ${JSON.stringify(validation.errors)}`);
    }

    // Show all sections
    console.log('\n=== ALL SECTIONS ===');
    report.sections.forEach((s, i) => {
      console.log(`\nSection ${i} (${s.type}):`);
      console.log(`  Sources: ${s.sources?.join(', ') || '(none)'}`);
      console.log(`  Text preview: ${s.text?.slice(0, 120)}${s.text?.length > 120 ? '...' : ''}`);
      if (s.is_collapsed !== undefined) {
        console.log(`  Collapsed: ${s.is_collapsed}`);
      }
    });

    // Summary
    console.log('\n=== TEST SUMMARY ===');
    const passed = [];
    const failed = [];

    // Check 1: Has sections
    if (report.sections.length > 0) passed.push('Has sections');
    else failed.push('No sections');

    // Check 2: Has conclusion section
    if (report.sections.some(s => s.type === 'conclusion')) passed.push('Has conclusion section');
    else failed.push('Missing conclusion section');

    // Check 3: All sections have sources
    if (validation.valid) passed.push('All sections have sources (traceable)');
    else failed.push('Some sections missing sources');

    // Check 4: Has generation_meta
    if (report.generation_meta?.prompt_version) passed.push(`Has prompt_version: ${report.generation_meta.prompt_version}`);
    else failed.push('Missing generation_meta.prompt_version');

    // Check 5: Has skeleton_keyframe_ids
    if (report.skeleton_keyframe_ids?.length > 0) passed.push(`Has ${report.skeleton_keyframe_ids.length} skeleton keyframes`);
    else failed.push('No skeleton keyframes');

    // Check 6: Has expanded_node_ids
    if (report.expanded_node_ids?.length > 0) passed.push(`Has ${report.expanded_node_ids.length} expanded nodes`);
    else failed.push('No expanded nodes');

    console.log('\nPassed:');
    passed.forEach(p => console.log(`  ✅ ${p}`));
    if (failed.length > 0) {
      console.log('\nFailed:');
      failed.forEach(f => console.log(`  ❌ ${f}`));
    }

    console.log(`\n=== RESULT: ${failed.length === 0 ? 'ALL TESTS PASSED ✅' : 'SOME TESTS FAILED ❌'} ===`);

    await pool.end();
    process.exit(failed.length === 0 ? 0 : 1);
  } catch (err) {
    console.error('Error:', err.message);
    console.error(err.stack);
    await pool.end();
    process.exit(1);
  }
}

runTest();
