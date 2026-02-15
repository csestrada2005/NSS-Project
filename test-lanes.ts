import { AIOrchestrator } from './src/services/AIOrchestrator';
import { files } from './src/files';
import type { FileSystemTree } from '@webcontainer/api';

const findContent = (tree: FileSystemTree, path: string): string => {
    const parts = path.split('/');
    let curr: any = tree;
    for(let i=0; i<parts.length; i++) {
        const p = parts[i];
        if(!curr) return '';

        // Handle direct child or inside directory object
        if(curr[p]) curr = curr[p];
        else if(curr.directory && curr.directory[p]) curr = curr.directory[p];
        else return '';
    }
    if(curr.file && curr.file.contents) return curr.file.contents.toString();
    return '';
}

async function testLanes() {
  console.log('Starting Lane Tests...');

  console.log('\n--- Testing Fast Lane (Mock) ---');
  // "change color" -> FAST_LANE -> FastLaneAI Mock
  const fastStart = Date.now();
  const fastResult = await AIOrchestrator.parseUserCommand('change color to red', files);
  const fastTime = Date.now() - fastStart;

  if (fastResult) {
      const content = findContent(fastResult, 'src/App.tsx');
      if (content.includes('// Fast Lane Edit')) {
          console.log(`[PASS] Fast Lane Result: Success (${fastTime}ms)`);
          console.log('Snippet:', content.substring(0, 50).replace(/\n/g, ' '));
      } else {
          console.log('[FAIL] Fast Lane Result: Content not modified as expected');
          console.log('Content:', content);
      }
  } else {
      console.log('[FAIL] Fast Lane Result: Returned null');
  }

  console.log('\n--- Testing Heavy Lane (Mock) ---');
  // "install lodash" -> HEAVY_LANE -> JulesClient Mock
  const heavyStart = Date.now();
  const heavyResult = await AIOrchestrator.parseUserCommand('install lodash', files);
  const heavyTime = Date.now() - heavyStart;

  if (heavyResult) {
      const content = findContent(heavyResult, 'src/App.tsx');
      if (content.includes('// Jules Edit')) {
          console.log(`[PASS] Heavy Lane Result: Success (${heavyTime}ms)`);
          console.log('Snippet:', content.substring(0, 50).replace(/\n/g, ' '));
      } else {
          console.log('[FAIL] Heavy Lane Result: Content not modified as expected');
          console.log('Content:', content);
      }
  } else {
      console.log('[FAIL] Heavy Lane Result: Returned null');
  }
}

testLanes().catch(console.error);
