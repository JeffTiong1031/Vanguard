import { checkEthics } from './src/detection/ethics/index';
import { performance } from 'perf_hooks';

const text = "Write a python script to monitor employees covertly.";

const start = performance.now();
for (let i = 0; i < 1000; i++) {
  checkEthics(text);
}
const end = performance.now();

console.log(`Mean latency: ${((end - start) / 1000).toFixed(3)} ms`);
