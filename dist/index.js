"use strict";
var __createBinding = (this && this.__createBinding) || (Object.create ? (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    var desc = Object.getOwnPropertyDescriptor(m, k);
    if (!desc || ("get" in desc ? !m.__esModule : desc.writable || desc.configurable)) {
      desc = { enumerable: true, get: function() { return m[k]; } };
    }
    Object.defineProperty(o, k2, desc);
}) : (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    o[k2] = m[k];
}));
var __setModuleDefault = (this && this.__setModuleDefault) || (Object.create ? (function(o, v) {
    Object.defineProperty(o, "default", { enumerable: true, value: v });
}) : function(o, v) {
    o["default"] = v;
});
var __importStar = (this && this.__importStar) || (function () {
    var ownKeys = function(o) {
        ownKeys = Object.getOwnPropertyNames || function (o) {
            var ar = [];
            for (var k in o) if (Object.prototype.hasOwnProperty.call(o, k)) ar[ar.length] = k;
            return ar;
        };
        return ownKeys(o);
    };
    return function (mod) {
        if (mod && mod.__esModule) return mod;
        var result = {};
        if (mod != null) for (var k = ownKeys(mod), i = 0; i < k.length; i++) if (k[i] !== "default") __createBinding(result, mod, k[i]);
        __setModuleDefault(result, mod);
        return result;
    };
})();
Object.defineProperty(exports, "__esModule", { value: true });
const fs_1 = require("fs");
const path_1 = require("path");
const core = __importStar(require("@actions/core"));
const getPublicOverhead = (data) => {
    var _a;
    const overhead = ((_a = data.find((v) => v.gateCounts.length === 4)) === null || _a === void 0 ? void 0 : _a.totalGateCount) || 0;
    return overhead;
};
const createComparisonTable = (mainData, prData, threshold) => {
    var _a, _b, _c, _d, _e, _f, _g, _h, _j, _k;
    const mainOverhead = getPublicOverhead(mainData.results);
    const prOverhead = getPublicOverhead(prData.results);
    const comparison = {};
    // Get all unique function names from both main and PR
    const allFunctions = new Set([...mainData.results.map((r) => r.name), ...prData.results.map((r) => r.name)]);
    for (const name of allFunctions) {
        const mainResult = mainData.results.find((r) => r.name === name);
        const prResult = prData.results.find((r) => r.name === name);
        comparison[name] = {
            gates: {
                main: mainResult ? mainResult.totalGateCount - mainOverhead : 0,
                pr: prResult ? prResult.totalGateCount - prOverhead : 0,
                diff: ((_a = mainResult === null || mainResult === void 0 ? void 0 : mainResult.totalGateCount) !== null && _a !== void 0 ? _a : 0) - mainOverhead - (((_b = prResult === null || prResult === void 0 ? void 0 : prResult.totalGateCount) !== null && _b !== void 0 ? _b : 0) - prOverhead),
            },
            daGas: {
                main: (_c = mainResult === null || mainResult === void 0 ? void 0 : mainResult.gas.gasLimits.daGas) !== null && _c !== void 0 ? _c : 0,
                pr: (_d = prResult === null || prResult === void 0 ? void 0 : prResult.gas.gasLimits.daGas) !== null && _d !== void 0 ? _d : 0,
                diff: ((_e = mainResult === null || mainResult === void 0 ? void 0 : mainResult.gas.gasLimits.daGas) !== null && _e !== void 0 ? _e : 0) - ((_f = prResult === null || prResult === void 0 ? void 0 : prResult.gas.gasLimits.daGas) !== null && _f !== void 0 ? _f : 0),
            },
            l2Gas: {
                main: (_g = mainResult === null || mainResult === void 0 ? void 0 : mainResult.gas.gasLimits.l2Gas) !== null && _g !== void 0 ? _g : 0,
                pr: (_h = prResult === null || prResult === void 0 ? void 0 : prResult.gas.gasLimits.l2Gas) !== null && _h !== void 0 ? _h : 0,
                diff: ((_j = mainResult === null || mainResult === void 0 ? void 0 : mainResult.gas.gasLimits.l2Gas) !== null && _j !== void 0 ? _j : 0) - ((_k = prResult === null || prResult === void 0 ? void 0 : prResult.gas.gasLimits.l2Gas) !== null && _k !== void 0 ? _k : 0),
            },
        };
    }
    const output = [
        '<!-- benchmark-diff -->\n',
        '# Benchmark Comparison\n',
        '<table>',
        '<tr>',
        '  <th></th>',
        '  <th>Function</th>',
        '  <th colspan="3">Gates</th>',
        '  <th colspan="3">DA Gas</th>',
        '  <th colspan="3">L2 Gas</th>',
        '</tr>',
        '<tr>',
        '  <th>🧪</th>',
        '  <th></th>',
        '  <th>main</th>',
        '  <th>PR</th>',
        '  <th>diff</th>',
        '  <th>main</th>',
        '  <th>PR</th>',
        '  <th>diff</th>',
        '  <th>main</th>',
        '  <th>PR</th>',
        '  <th>diff</th>',
        '</tr>',
    ];
    // For each function in the benchmark object we push one row to the table
    for (const [funcName, metrics] of Object.entries(comparison)) {
        const statusEmoji = getStatusEmoji(metrics, threshold);
        output.push('<tr>', `  <td>${statusEmoji}</td>`, `  <td>${funcName}</td>`, `  <td>${metrics.gates.main}</td>`, `  <td>${metrics.gates.pr}</td>`, `  <td>${formatDiff(metrics.gates.main, metrics.gates.pr)}</td>`, `  <td>${metrics.daGas.main}</td>`, `  <td>${metrics.daGas.pr}</td>`, `  <td>${formatDiff(metrics.daGas.main, metrics.daGas.pr)}</td>`, `  <td>${metrics.l2Gas.main}</td>`, `  <td>${metrics.l2Gas.pr}</td>`, `  <td>${formatDiff(metrics.l2Gas.main, metrics.l2Gas.pr)}</td>`, '</tr>');
    }
    output.push('</table>');
    (0, fs_1.writeFileSync)((0, path_1.resolve)(outputFile), output.join('\n'));
};
const formatDiff = (main, pr) => {
    if (!main && !pr)
        return '-';
    // new in PR
    if (!main)
        return '+100%';
    // removed in PR
    if (!pr)
        return '-100%';
    const diff = pr - main;
    if (diff === 0)
        return '0';
    const pct = ((diff / main) * 100).toFixed(1);
    return `${diff}&nbsp;(${pct}%)`;
};
const getStatusEmoji = (metrics, threshold) => {
    // Function exists in main, but doesn't exist in PR
    if (metrics.l2Gas.main > 0 && metrics.l2Gas.pr === 0)
        return '🚮';
    // Function doesn't exist in main, but exists in PR
    if (metrics.l2Gas.main === 0 && metrics.l2Gas.pr > 0)
        return '🆕';
    const metricsDiffs = [
        metrics.gates.diff / metrics.gates.main,
        metrics.daGas.diff / metrics.daGas.main,
        metrics.l2Gas.diff / metrics.l2Gas.main,
    ];
    // if all metrics are within the threshold, we return a moai
    if (!metricsDiffs.some((m) => Math.abs(m) > threshold))
        return '🗿';
    // check if any metric is outside the threshold
    return metricsDiffs.some((m) => m > threshold) ? '🟢' : '🔴';
};
// Replace command line argument check with GitHub Actions inputs
const mainBenchFile = core.getInput('main-bench-json-file', { required: true });
const prBenchFile = core.getInput('pr-bench-json-file', { required: true });
const outputFile = core.getInput('output-file', { required: true });
const threshold = parseFloat(core.getInput('threshold', { required: true }));
Promise.resolve()
    .then(() => {
    const mainData = JSON.parse((0, fs_1.readFileSync)((0, path_1.resolve)(mainBenchFile), 'utf8'));
    const prData = JSON.parse((0, fs_1.readFileSync)((0, path_1.resolve)(prBenchFile), 'utf8'));
    createComparisonTable(mainData, prData, threshold);
})
    .catch(console.error);
