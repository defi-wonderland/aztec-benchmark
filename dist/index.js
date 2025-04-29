"use strict";
// benchmark-cli/src/index.ts
Object.defineProperty(exports, "__esModule", { value: true });
exports.BenchmarkBase = exports.Profiler = exports.Benchmark = void 0;
// Export the base class and types for users
var types_js_1 = require("./types.js"); // Alias BenchmarkBase to Benchmark for user convenience
Object.defineProperty(exports, "Benchmark", { enumerable: true, get: function () { return types_js_1.BenchmarkBase; } });
// Also export the Profiler for potential advanced use (or internal use by CLI)
var profiler_js_1 = require("./profiler.js");
Object.defineProperty(exports, "Profiler", { enumerable: true, get: function () { return profiler_js_1.Profiler; } });
// We will define and export the Benchmark class here later.
console.log('Benchmark CLI package entry point.');
// Placeholder export (replace with actual Benchmark class later)
class BenchmarkBase {
}
exports.BenchmarkBase = BenchmarkBase;
