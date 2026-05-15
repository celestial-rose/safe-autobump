# safe-autobump 🛡️

A CLI tool to safely scan and update a bunch of nested applications, bumping unsafe dependencies to fixed, secure versions automatically. 

While opinionated and out-of-the-box optimized for the ecosystem of **Next.js**, **React**, and **@opennextjs/cloudflare**, `safe-autobump` is designed to be fully generic and adaptable to any package registry mismatch.

---

## 💡 The Context: Why This Tool Matters Today

### 1. The Next.js & Shai-Hulud Crisis
In May 2026, the JavaScript ecosystem faced a massive wave of coordinated security failures. A series of twelve critical vulnerabilities (including major Upstream RSC Memory Exhaustion, Cache Poisoning, and Middleware Bypass flaws) hit Next.js and React Server Components. At the same time, the widespread **Shai-Hulud** infrastructure vulnerabilities compromised continuous integration loops and cloud-native application layouts globally. 

These events proved one thing: **traditional perimeter firewalls (WAFs) can no longer shield applications.** Mitigations *must* happen directly inside the source code, at the dependency layer, across all environments.

### 2. The Asymmetric AI Threat: Continuous Exploitation
What we long feared about AI in cybersecurity is no longer a future prediction—**it is our active reality.** Frontier AI models have triggered an explosion in vulnerability discovery, leading to a **76% year-on-year increase in verified security flaws.** 

The threat landscape has evolved drastically:
* **Zero Window to Patch:** The historic buffer time between a vulnerability disclosure and its exploit has been completely obliterated. AI agents scan target networks, chain complex zero-day bugs together, and generate flawless exploit payloads autonomously around the clock.
* **Industrial Scale Attacks:** Cybercriminals are leveraging AI to automate exploit development and pinpoint code vulnerabilities at an industrial scale. 
* **The Fragmented Monorepo Trap:** While AI helps our teams generate code faster, it scales dependency fragmentation. Micro-frontends, nested apps, and monorepos end up with dozens of localized `package.json` files harboring vulnerabilities that human auditors easily overlook.

**This is our new day-to-day workflow.** Because AI-driven attacks operate in milliseconds, human developers can no longer afford to manually upgrade 50 nested applications one by one every single morning. The only way to survive this daily asymmetric race is to compress the find-to-fix loop down to zero. `safe-autobump` turns daily security remediation into a single, automated, and safe terminal command.

---

## 🚀 How It Works

`safe-autobump` crawls your target directory, ignores the heavy noise (like `node_modules` or `.git`), pinpoints every single `package.json`, checks if the package version matches your unsafe parameters, and replaces it cleanly with the target secure version.

### Key Features
* 🔍 **Deep Nested Scanning:** Automatically traverses complex directory structures.
* 🛡️ **Safe SemVer Cleansing:** Strips and safely preserves configuration prefixes (`^`, `~`, `*`).
* 📦 **Multi-Package Mapping:** Updates linked ecosystem packages simultaneously (e.g., matching Next.js with its React peer dependencies).
* ⚙️ **Generic Under the Hood:** Ready for Next.js today, but fully configurable for `lodash`, `express`, or any package tomorrow.
* 🥟 **Bun First:** Highly opinionated to use `bun` as the package manager and runner for blazing fast execution and lockfile updates.
* 🤖 **Smart Git Automation:** Automatically generates clean commit messages based precisely on the packages updated, stages only the relevant lockfiles and `package.json`, and pushes the secure bump.

---

## 🛠️ Installation & Usage

### Installation
Clone the repository and run it with bun:
```bash
git clone https://github.com/your-username/safe-autobump.git
cd safe-autobump
bun index.ts <path>
```

### Command Example (The Next.js 15.5.18 / 16.2.6 Emergency Bump)
To scan your current directory for any Next.js app running something other than the secure patched releases and force-update them:

```bash
bun index.ts --package next --target 15.5.18 --peer react=19.0.6 react-dom=19.0.6
```

### Advanced Config (`autobump.config.json`)
You can leave a configuration file at your target folder to automate daily execution via GitHub Actions or Cron jobs. Note that you should place and copy this `autobump.config.json` file in each target subfolder or workspace you want it to run on:

```json
{
  "rules": {
    "next": [
      {
        "prefix": "15.",
        "target": "15.5.18",
        "peers": {
          "react": "19.0.6",
          "react-dom": "19.0.6"
        }
      }
    ],
    "@opennextjs/cloudflare": [
      {
        "prefix": "",
        "target": "1.19.10"
      }
    ]
  },
  "exclude": ["**/legacy-archive/**", "**/tests/**"]
}
```

---

## 🔒 Security Best Practices

We highly recommend configuring a minimum release age for your package manager. This simple configuration acts as a massive life-saver by preventing your CI/CD and developer environments from auto-installing "latest" packages that have just been published (which are statistically the most likely to be malicious or broken).

If you are using Bun, add this to your `bunfig.toml` at the root of your project:
```toml
[install]
minimumReleaseAge = "3d"
```
Read more in the [Bun Docs](https://bun.sh/docs/runtime/bunfig#install-minimumreleaseage). 

If you are using npm, similar features can be implemented using `--min-release-age` via third-party wrappers or CI checks.

---

## 🤝 Contributing

This is a community-driven, open-source safety tool. As security threats accelerate due to AI automated exploits, our mitigation tools must adapt faster. 

If you want to add support for lockfile mutation checking (`package-lock.json`, `pnpm-lock.yaml`), automatic PR generation, or specific framework adapters, please open an issue or submit a Pull Request!

License: MIT
