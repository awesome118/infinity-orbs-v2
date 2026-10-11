#!/usr/bin/env node
import { readFileSync, readdirSync } from "node:fs";
import { extname, join, resolve } from "node:path";

const failures = [];
const reportFailure = (message) => failures.push(message);

function readJson(file) {
  try {
    return JSON.parse(readFileSync(resolve(file), "utf8"));
  } catch (error) {
    reportFailure(`Could not read valid JSON from ${file}: ${error.message}`);
    return null;
  }
}

const nodeMajor = Number(process.versions.node.split(".")[0]);
if (!Number.isInteger(nodeMajor) || nodeMajor < 24) {
  reportFailure(`Node.js 24 or newer is required; found ${process.versions.node}.`);
}

const pkg = readJson("package.json");
const lock = readJson("package-lock.json");
const devvit = readJson("devvit.json");

if (pkg) {
  if (!/^\d+\.\d+\.\d+(?:-[0-9A-Za-z.-]+)?(?:\+[0-9A-Za-z.-]+)?$/.test(pkg.version ?? "")) {
    reportFailure(`package.json version is not a valid release-style version: ${String(pkg.version)}`);
  }
  if (!/^>=\s*24(?:\.|$)/.test(pkg.engines?.node ?? "")) {
    reportFailure("package.json must declare Node.js >=24 in engines.node.");
  }
}
if (pkg && lock) {
  if (pkg.name !== lock.name || pkg.name !== lock.packages?.[""]?.name) {
    reportFailure("package.json and package-lock.json package names do not match.");
  }
  if (pkg.version !== lock.version || pkg.version !== lock.packages?.[""]?.version) {
    reportFailure("package.json and package-lock.json versions do not match; run npm install with the intended version.");
  }
}
if (pkg && devvit && devvit.name !== pkg.name) {
  reportFailure(`Devvit app name (${String(devvit.name)}) does not match package name (${pkg.name}).`);
}

const sourceRoot = resolve("src");
const sourceExtensions = new Set([".js", ".jsx", ".ts", ".tsx", ".mjs", ".cjs"]);
const forbidden = /\b(?:txn|tx)\.get\(/;
let sourceFilesScanned = 0;

function scanDirectory(dir) {
  let entries;
  try {
    entries = readdirSync(dir, { withFileTypes: true });
  } catch (error) {
    reportFailure(`Could not scan required source directory ${dir}: ${error.message}`);
    return;
  }
  for (const entry of entries) {
    const fullPath = join(dir, entry.name);
    if (entry.isDirectory()) {
      scanDirectory(fullPath);
    } else if (entry.isFile() && sourceExtensions.has(extname(entry.name))) {
      sourceFilesScanned += 1;
      let lines;
      try {
        lines = readFileSync(fullPath, "utf8").split(/\r?\n/);
      } catch (error) {
        reportFailure(`Could not read source file ${fullPath}: ${error.message}`);
        continue;
      }
      lines.forEach((line, index) => {
        if (forbidden.test(line)) {
          reportFailure(`${fullPath}:${index + 1}: forbidden transaction read pattern; use redis.get() after WATCH.`);
        }
      });
    }
  }
}

scanDirectory(sourceRoot);
if (sourceFilesScanned === 0) {
  reportFailure("No supported source files were scanned under src/.");
}

if (failures.length) {
  console.error("Deployment preflight guard failed:");
  for (const failure of failures) console.error(` - ${failure}`);
  process.exitCode = 1;
} else {
  console.log(`Deployment preflight guard passed: Node ${process.versions.node}; manifests/version aligned; scanned ${sourceFilesScanned} source files; no forbidden transaction-read pattern.`);
}
