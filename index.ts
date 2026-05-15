#!/usr/bin/env bun
import { $ } from "bun";
import { Glob } from "bun";
import path from "node:path";
import fs from "node:fs";

// Parse command line arguments manually
const args = process.argv.slice(2);
let cliPackage = "";
let cliTarget = "";
let cliPeers: Record<string, string> = {};
let targetFolder = ".";

for (let i = 0; i < args.length; i++) {
  const arg = args[i];
  if (arg === "--package" || arg === "-p") {
    cliPackage = args[++i];
  } else if (arg === "--target" || arg === "-t") {
    cliTarget = args[++i];
    if (cliTarget === "latest") {
      console.error("Error: Must provide a pinned version for target. 'latest' is not allowed.");
      process.exit(1);
    }
  } else if (arg === "--peer") {
    while (i + 1 < args.length && !args[i + 1].startsWith("-")) {
      const peerArg = args[++i];
      const [peerName, peerTarget] = peerArg.split("=");
      if (!peerTarget || peerTarget === "latest") {
        console.error(`Error: Must provide a pinned version for peer '${peerName}' (e.g. ${peerName}=19.0.6). 'latest' is not allowed.`);
        process.exit(1);
      }
      cliPeers[peerName] = peerTarget;
    }
  } else if (!arg.startsWith("-")) {
    targetFolder = arg;
  }
}

// Ensure the target folder exists and is absolute or relative to cwd
const resolvedTargetFolder = path.resolve(process.cwd(), targetFolder);

// Load configuration file if it exists
let configRules: Record<string, { prefix?: string; target: string; peers?: string[] | Record<string, string> }[]> = {};
let excludes: string[] = ["**/node_modules/**"];
const configPath = path.join(resolvedTargetFolder, "autobump.config.json");

if (fs.existsSync(configPath)) {
  try {
    const config = JSON.parse(fs.readFileSync(configPath, "utf-8"));
    if (config.rules && typeof config.rules === "object" && !Array.isArray(config.rules)) {
      configRules = config.rules;
    }
    if (Array.isArray(config.exclude)) {
      excludes.push(...config.exclude);
    }
    console.log(`Loaded configuration from ${configPath}`);
  } catch (error) {
    console.error(`Failed to parse ${configPath}:`, error);
  }
}

// Build final rules
let rules = { ...configRules };

if (cliPackage && cliTarget) {
  if (!rules[cliPackage]) rules[cliPackage] = [];
  rules[cliPackage].push({
    prefix: "", // CLI overrides all by default
    target: cliTarget,
    peers: Object.keys(cliPeers).length > 0 ? cliPeers : undefined,
  });
}

// Fallback to defaults if neither CLI nor config provided rules
if (Object.keys(rules).length === 0) {
  console.log("No rules provided via CLI or autobump.config.json. Using defaults.");
  rules = {
    "next": [
      { prefix: "15.", target: "15.5.18", peers: { "react": "19.0.6", "react-dom": "19.0.6" } },
      { prefix: "16.", target: "16.2.6" }
    ],
    "react": [
      { prefix: "19.0.", target: "19.0.6" },
      { prefix: "19.1.", target: "19.1.7" },
      { prefix: "19.2.", target: "19.2.6" }
    ],
    "react-dom": [
      { prefix: "19.0.", target: "19.0.6" },
      { prefix: "19.1.", target: "19.1.7" },
      { prefix: "19.2.", target: "19.2.6" }
    ],
    "@opennextjs/cloudflare": [
      { prefix: "", target: "1.19.10" } 
    ]
  };
}

const glob = new Glob("**/package.json");
let anyChangesFound = false;

for await (const file of glob.scan({ cwd: resolvedTargetFolder, onlyFiles: true })) {
  // Check excludes
  let isExcluded = false;
  for (const pattern of excludes) {
    const regex = new RegExp("^" + pattern.replace(/\*\*/g, '.*').replace(/\*/g, '[^/]*') + "$");
    if (regex.test(file) || file.includes("node_modules")) {
      isExcluded = true;
      break;
    }
  }
  if (isExcluded) continue;

  const fullPath = path.join(resolvedTargetFolder, file);
  const dirPath = path.dirname(fullPath);
  
  try {
    const pkgFile = Bun.file(fullPath);
    const pkgText = await pkgFile.text();
    if (!pkgText.trim()) continue;
    
    const pkg = JSON.parse(pkgText);
    let changed = false;
    const updatedPackages: Record<string, { from: string, to: string }> = {};

    const depsToUpdate = ["dependencies", "devDependencies"];

    for (const depType of depsToUpdate) {
      if (!pkg[depType]) continue;

      for (const [pkgName, packageRules] of Object.entries(rules)) {
        const currentVersionRaw = pkg[depType][pkgName];
        if (!currentVersionRaw) continue;

        const currentBaseVersion = currentVersionRaw.replace(/^[^\d]+/, '');
        const rule = packageRules.find(r => r.prefix === undefined || r.prefix === "" || currentBaseVersion.startsWith(r.prefix));

        if (rule && currentVersionRaw !== rule.target) {
          pkg[depType][pkgName] = rule.target;
          updatedPackages[pkgName] = { from: currentVersionRaw, to: rule.target };
          changed = true;
          
          if (rule.peers) {
            let peersToUpdate: Record<string, string> = {};
            if (Array.isArray(rule.peers)) {
              console.warn(`[Warning] Array format for peers in rule ${pkgName} is ignored because pinned versions are required. Use an object instead: { "react": "19.0.6" }`);
            } else if (typeof rule.peers === "object") {
              peersToUpdate = rule.peers;
            }

            for (const [peerName, peerTarget] of Object.entries(peersToUpdate)) {
               for (const peerDepType of depsToUpdate) {
                 if (pkg[peerDepType]?.[peerName]) {
                    const peerCurrentVersion = pkg[peerDepType][peerName];
                    if (peerCurrentVersion !== peerTarget) {
                       pkg[peerDepType][peerName] = peerTarget;
                       updatedPackages[peerName] = { from: peerCurrentVersion, to: peerTarget };
                       changed = true;
                    }
                 }
               }
            }
          }
        }
      }
    }

    let hasRelevantUncommittedChanges = false;
    let uncommittedUpdates: Record<string, string> = {};
    try {
      const gitStatus = await $`git status --porcelain package.json bun.lock bun.lockb`.cwd(dirPath).quiet();
      if (gitStatus.stdout.toString().trim() !== "") {
        const allTrackedPackages = new Set<string>();
        for (const [pkgName, packageRules] of Object.entries(rules)) {
          allTrackedPackages.add(pkgName);
          if (packageRules) {
            for (const r of packageRules) {
              if (r.peers) {
                if (Array.isArray(r.peers)) {
                  r.peers.forEach((p: string) => allTrackedPackages.add(p));
                } else if (typeof r.peers === "object") {
                  Object.keys(r.peers).forEach((p: string) => allTrackedPackages.add(p));
                }
              }
            }
          }
        }

        let headPkg: any = {};
        try {
          const headPkgStr = await $`git show HEAD:./package.json`.cwd(dirPath).quiet();
          headPkg = JSON.parse(headPkgStr.stdout.toString());
        } catch (e) {
          // File might not exist in HEAD yet
        }

        for (const pkgName of allTrackedPackages) {
          const currentVer = pkg.dependencies?.[pkgName] || pkg.devDependencies?.[pkgName];
          const headVer = headPkg.dependencies?.[pkgName] || headPkg.devDependencies?.[pkgName];
          
          if (currentVer && currentVer !== headVer) {
            if (!updatedPackages[pkgName]) {
               uncommittedUpdates[pkgName] = currentVer;
               hasRelevantUncommittedChanges = true;
            }
          }
        }
      }
    } catch (e) {
      // Ignore errors if it's not a git repository
    }

    if (changed || hasRelevantUncommittedChanges) {
      anyChangesFound = true;
      if (changed) {
        await Bun.write(fullPath, JSON.stringify(pkg, null, 2) + "\n");
        console.log(`[${dirPath}] Running 'bun install'...`);
        await $`bun install`.cwd(dirPath);
        console.log(`[${dirPath}] ✅ Done installing.`);
      }

      const commitMsgParts = [];
      const mergedUpdates: Record<string, string> = {};
      
      for (const [pkgName, versions] of Object.entries(updatedPackages)) {
        mergedUpdates[pkgName] = versions.to;
      }
      for (const [pkgName, ver] of Object.entries(uncommittedUpdates)) {
        mergedUpdates[pkgName] = ver;
      }

      for (const [pkgName, targetVersion] of Object.entries(mergedUpdates)) {
        commitMsgParts.push(`${pkgName} ${targetVersion}`);
      }

      if (commitMsgParts.length === 0 && hasRelevantUncommittedChanges) {
         commitMsgParts.push("tracked deps");
      }

      const cleanParts = commitMsgParts.map(part => part.replace(/\^|~/g, ''));
      const commitMsg = `safe-autobump: update to ${cleanParts.join(" / ")}`;

      console.log(`\n--------------------------------------------------`);
      console.log(`Folder: ${dirPath}`);
      
      if (Object.keys(updatedPackages).length > 0 || Object.keys(uncommittedUpdates).length > 0) {
        console.log(`Updates:`);
        for (const [pkgName, versions] of Object.entries(updatedPackages)) {
          console.log(`  - ${pkgName}: ${versions.from} -> ${versions.to}`);
        }
        for (const [pkgName, ver] of Object.entries(uncommittedUpdates)) {
          console.log(`  - ${pkgName}: uncommitted changes found (current: ${ver})`);
        }
      } else if (hasRelevantUncommittedChanges) {
        console.log(`Updates: (Found existing uncommitted changes in tracked packages)`);
      }

      console.log(`Proposed Commit: ${commitMsg}`);
      console.log(`--------------------------------------------------`);
      
      const shouldCommit = confirm(`Do you want to commit and push these changes now?`);
      
      if (shouldCommit) {
        console.log(`[${dirPath}] Committing and pushing...`);
        if (fs.existsSync(path.join(dirPath, "package.json"))) await $`git add package.json`.cwd(dirPath).nothrow();
        if (fs.existsSync(path.join(dirPath, "bun.lock"))) await $`git add bun.lock`.cwd(dirPath).nothrow();
        if (fs.existsSync(path.join(dirPath, "bun.lockb"))) await $`git add bun.lockb`.cwd(dirPath).nothrow();
        await $`git commit -m ${commitMsg}`.cwd(dirPath);
        await $`git push`.cwd(dirPath);
        console.log(`[${dirPath}] ✅ Successfully committed and pushed.`);
      } else {
        console.log(`[${dirPath}] ⏭️ Skipped commit. You can come back to it later.`);
      }
    }
  } catch (error) {
    console.error(`Failed processing ${fullPath}:`, error);
  }
}

if (!anyChangesFound) {
  console.log("No changes found or you may be up to date!");
}
