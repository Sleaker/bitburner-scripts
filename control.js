/**
 * @typedef {import('./types/NetscriptDefinitions').NS} NS
 * @typedef {import('./types/NetscriptDefinitions').Server} Server
 */

import { findServers } from "./util.js";
import { Zombie } from './zombie.js';
import * as Formatter from './formatting.js';
import { Logger } from "./log.js";

/** 
 * Main control script, scans all potential servers at startup, selects 
 * the best one to hack based on calculated statics and then starts up hacks
 * on every available server.
 * @see {Zombie}
 * @see {findAllServers}
 * @see {Logger}
 * 	
 *
 * @param {NS} ns
 **/
export async function main(ns) {
	ns.disableLog("sleep");
	ns.disableLog("exec");
	ns.disableLog("scp");
	ns.disableLog("scan");
	ns.disableLog("getHackingLevel");

	// run the main script
	await control(ns);
}

/**
 * Current algorithm:
 * -> count total server capacity of available threads amongst all rooted servers
 * -> Split total number of threads into ratio of grow, hack, and weaken (.84, .04, .12)
 * -> for each server
 * 		-> Count number of Grow, Hack, or Weaken already running 
 * 		-> update number of available threads for the server
 * -> For each server
 * 		-> if grow capacity is not filled start growing up to grow capacity or max threads available on server
 * 			-> decrement total grow capacity
 * 			-> decrement number of available threads on this server
 * 		-> if hack capacity is not filled start hacking up to hack capacity or max threads available on server
 * 			-> decrement total hack capacity
 * 			-> decrement number of available threads on this server
 * 		-> if grow or hack is already running on the server or capacity for both is filled, start weakening
 * 
 * Current throughput: ~2150 threads targetting 'phantasy' results in ~$2.3 mil/sec and ~160 xp/sec 
 * 
 * TODO: Instead of splitting capacity across all servers based on simple ratios we should create a 'cycle'
 *       And determine the optimal number of cycles that can be configured against a given target. Each cycle will need to be offset
 *       So it doesn't conflict with another servers cycle using the same target.
 * 
 * -> Start weaken 1 (60 sec base runtime)
 * -> pause 1 for delay between hack/grow completion
 * -> start weaken 2 (60 sec base runtime)
 * -> pause 2 for slightly less than 15 seconds * time multiplier (allow to grow to complete before)
 * -> start grow (45 sec base runtime)
 * -> pause 3 for ~30 seconds * time multiplier
 * -> start hack (15 sec base runtime)
 * -> pause 4 until:
 * 	 -> hack completes
 *   -> weaken 1 completes
 *   -> grow completes
 *   -> weaken 2 completes
 * -> restart cycle
 * 
 * @param {NS} ns
 */
async function control(ns) {
	// initialize our logging system
	const logger = new Logger(ns, false);

	let potentialTargets = await findNewServers(ns);
	let runners = await findRunners(ns);
	// if we don't kill off all runners on target servers at startup then we can end up with stuck runners
	for (const runner of runners) {
		if (runner.hostname !== "home") {
			ns.killall(runner.hostname);
		}
	}
	let counter = 0;
	let targets = [{ zombie: potentialTargets[0], hostname: potentialTargets[0].hostname, setup: true, threadRatio: 1 }];
	let threads = getThreadCounts(ns, runners, targets);
	logger.info("%(stage)s | Starting up against %(target)s using %(threads)d total threads.", 
		{ stage: targets[0].setup ? "SETUP" : "HACK", target: targets[0].hostname, threads: threads.counts.maxThreads });
	while (true) {
		for (const target of targets) {
			target.zombie.updateStats(ns);
			if (target.setup && target.zombie.isAtMinSecurity() && target.zombie.isAtMaxMoney()) {
				logger.success("Finished hack setup: %s", target.hostname);
				ns.print("Finished hack setup: " + target.hostname);
				target.setup = false;
			}
		}
		
		// TODO: rework this
		if (targets.length === 1 && !targets[0].setup && targets[0].zombie.availableMoney < targets[0].zombie.maxMoney * .20) {
			targets[0].setup = true;
			ns.print("Target funds draining too quickly. Rerunning setup: " + targets[0].hostname);
		}
		// Every 30 seconds rescan for new servers or exploitable servers
		if (++counter === 30) {
			counter = 0;
			potentialTargets = await findNewServers(ns);
			runners = await findRunners(ns);
			if (runners.length === 0 || !targets[0].hostname) {
				logger.error("Something went wrong, runners: %(servers)j - target: %(target)s", {target: targets[0].zombie, servers: runners});
				ns.print("Something went wrong, runners array is empty or no target was found.");
				ns.exit();
			}
			
			for (const [index, target] of targets.entries()) {
				if (potentialTargets[index].hostname !== target.hostname) {
					if (index === 0) {
						cleanupOldThreads(ns, targets, runners)
						// if main target resets, just start from scratch
						targets = [{ zombie: potentialTargets[0], hostname: potentialTargets[0].hostname, setup: true, threadRatio: 1 }];
						logger.info("Reselecting main target to: %s", target.hostname);
						ns.print("Reselecting main hack target: " + target.hostname);
						break;
					} else {
						target.zombie = potentialTargets[index];
						target.hostname = potentialTargets[index].hostname;
						target.setup = true;
						logger.info("Reselecting secondary target to: %s", target.hostname);
						ns.print("Reselecting secondary hack target: " + target.hostname);
					}
				}
			}
		}

		await doHacks(runners, targets, ns, logger);

		await ns.sleep(1000);
	}
}

/**
 * 
 * @param {NS} ns 
 * @param {{zombie: Zombie, hostname: string, setup: boolean, threadRatio: number}[]} oldTargets
 * @param {Server[]} runners 
 */
function cleanupOldThreads(ns, oldTargets, runners) {
	for (const target of oldTargets) {
		for (const runner of runners) {
			for (const scriptName of ["weaken.js", "grow.js",  "hack.js"]) {
				let script = ns.getRunningScript(scriptName, runner.hostname, target.hostname);
				if (script) {
					ns.kill(scriptName, runner.hostname, target.hostname);
				}
			}
		}
	}
}

/**
 * 
 * @param {Server[]} runners 
 * @param {{
 *   hostname: string,
 *   setup: boolean,
 *   threads: number,
 *   threadRatio: number,
 *   zombie: Zombie
 *   }[]} targets
 * @param {NS} ns
 * @param {Logger} logger
 */
async function doHacks(runners, targets, ns, logger) {
	let threads = getThreadCounts(ns, runners, targets);

	for (const [index, target] of targets.entries()) {
		const growRate = target.setup ? target.zombie.shouldGrow ? .9 : 0 : .84;
		const hackRate = target.setup ? 0 : .04;
		threads[target.hostname].wantedGrowThreads = Math.max(Math.floor((threads[target.hostname].wantedThreads * growRate) - threads.counts.growRunners[index]), 0);
		threads[target.hostname].wantedHackThreads = Math.max(Math.floor((threads[target.hostname].wantedThreads * hackRate) - threads.counts.hackRunners[index]), 0);
		threads[target.hostname].wantedWeakenThreads = Math.max(threads[target.hostname].wantedThreads - threads[target.hostname].wantedGrowThreads - threads[target.hostname].wantedHackThreads - threads.counts.weakenRunners[index] - threads.counts.hackRunners[index] - threads.counts.growRunners[index], 0);
		logger.debug("Start: %j", threads);
	}

	// ns.print("Running | Grow: " + runningGrow + " | Hack: " + runningHack + " | Weaken: " + runningWeaken);

	
	for (const server of runners) {
		let availableRunners = threads[server.hostname].maxThreads - threads[server.hostname].growRunners - threads[server.hostname].hackRunners - threads[server.hostname].weakenRunners;
		if (availableRunners <= 0) {
			continue;
		}
		for (const target of targets) {
			target.zombie.updateStats(ns);
			
			const toWeaken = Math.min(availableRunners, threads[target.hostname].wantedWeakenThreads);
			const weakenScript = ns.getRunningScript("weaken.js", server.hostname, target.hostname);
			// logger.info("Script: %j", weakenScript);
			if (toWeaken > 0 && !weakenScript) {
				logger.debug("Starting new weaken exec on %(host)s -> %(target)s", { host: server.hostname,  target: target.hostname});
				// ns.print("Starting new weaken exec on " + zombie.hostname + " with threads: " + toWeaken + " targeting: " + target.hostname);
				const pid = ns.exec("weaken.js", server.hostname, toWeaken, target.hostname);

				await ns.sleep(5);
				if (pid < 1) {
					ns.print("Failed to startup weaken on: " + server.hostname + " running threads: " 
						+ threads[server.hostname].weakenRunners + " wanted additional: " + toWeaken + " available runners: " + availableRunners);
					let serverData = ns.getServer(server.hostname);
					// logger.warn("%j", { weakRunners: threads[server.hostname].weakenRunners,
					// 	toWeaken: toWeaken, 
					// 	available: availableRunners,
					// 	server: serverData } );
				} else {
					ns.print(server.hostname + " " + getRunningScriptLogs(ns, server, target.hostname, "weaken.js")[0] + " -> " + target.zombie.currentSecurity);
					availableRunners -= toWeaken;
					threads[target.hostname].wantedWeakenThreads -= toWeaken;
				}
	
			}

			const toGrow = Math.min(availableRunners, threads[target.hostname].wantedGrowThreads);
			const growScript = ns.getRunningScript("grow.js", server.hostname, target.hostname);
			logger.debug("Calcs: new Grow: %s", toGrow);
			if (toGrow > 0 && !growScript) {
				logger.debug("Starting new grow exec on %(host)s -> %(target)s", { host: server.hostname,  target: target.hostname});
				const pid = ns.exec("grow.js", server.hostname, toGrow, target.hostname);
				
				await ns.sleep(5);
				if (pid > 0) {
					ns.print(server.hostname + " " + getRunningScriptLogs(ns, server, target.hostname, "grow.js")[0] + " -> Money: " + Formatter.formatMoney(target.zombie.availableMoney) + " / " + Formatter.formatMoney(target.zombie.maxMoney));
					availableRunners -= toGrow;
					threads[target.hostname].wantedGrowThreads -= toGrow;
				}
			}

			const toHack = Math.min(availableRunners, threads[target.hostname].wantedHackThreads);
			const hackScript = ns.getRunningScript("hack.js", server.hostname, target.hostname);
			if (toHack > 0 && !hackScript) {
				await ns.sleep(100)
				logger.debug("Starting new hack exec on %(host)s -> %(target)s", { host: server.hostname,  target: target.hostname});
				const pid = ns.exec("hack.js", server.hostname, toHack, target.hostname);
				
				await ns.sleep(5);
				if (pid > 0) {
					ns.print(server.hostname + " " + getRunningScriptLogs(ns, server, target.hostname, "hack.js")[0] + " <- Money " + Formatter.formatMoney(target.zombie.availableMoney) + " -> " + target.zombie.currentSecurity);
					availableRunners -= toHack;
					threads[target.hostname].wantedHackThreads -= toHack;
				}
			}
		}
	}
	// logger.info("End:   %j", {threads: [wantedGrowThreads, wantedHackThreads, wantedWeakenThreads]});
}

/**
 * @param {Server} server
 * @param {string} targetHostname
 * @param {string} scriptName
 */
function getRunningScriptLogs(ns, server, targetHostname, scriptName) {
	let script = ns.getRunningScript(scriptName, server.hostname, targetHostname);
	return script ? script.logs : [];
}

/**
 * @param {NS} ns
 * @returns {Promise<Zombie[]>} array of zombies
 */
async function findNewServers(ns) {
	let allServers = findServers({ns: ns, depth: -1, type: "dfs"})
		.map(server => new Zombie(server.server, ns, server.parent, server.depth));

	for (const zombie of allServers) {
		if (zombie.shouldCrack === "true") {
			zombie.getRoot(ns);
		}
		await zombie.uploadFiles(ns, ["weaken.js", "hack.js", "grow.js"]);
		zombie.updateStats(ns);
	}
	let rooted = allServers.filter(zombie => zombie.root).sort((a, b) => b.currentRating - a.currentRating);
	return Promise.resolve(rooted);
}

/**
 * @param {NS} ns
 */
async function findRunners(ns) {
	let runners = ns.scan("home")
		.filter(child => child.startsWith("zombie"))
		.map(child => ns.getServer(child));

	for (const runner of runners) {
		await ns.scp(["weaken.js", "hack.js", "grow.js"], runner.hostname);
	}

	runners.push(ns.getServer("home"));
	return runners;
}

/**
 * @param {NS} ns
 * @param {Server[]} runners
 * @param {{
 *   setup: boolean,
 *   threads: number,
 *   threadRatio: number
 *   }[]} targets
 * @return {{counts: { growRunners: number[], weakenRunners: number[], hackRunners: number[], maxThreads: number, usedThreads: number}}} [runningGrow, runningHack, runningWeaken][]
 */
function getThreadCounts(ns, runners, targets) {
	let data = {
		counts: {
			growRunners: [],
			hackRunners: [],
			weakenRunners: [],
			maxThreads: 0,
			usedThreads: 0
		}
	};
	for (let target of targets) {
		data[target.hostname] = {
			growRunners: 0,
			hackRunners: 0,
			weakenRunners: 0
		};
		data.counts.growRunners.push(0);
		data.counts.hackRunners.push(0);
		data.counts.weakenRunners.push(0);
	}
	for (const server of runners) {
		let maxServerThreads = Math.floor(server.maxRam / 1.75);
		if (server.hostname === "home") {
			maxServerThreads = Math.floor(maxServerThreads * .8);
		}
		data[server.hostname] = { growRunners: 0, hackRunners: 0, weakenRunners: 0, maxThreads: maxServerThreads};
		data.counts.maxThreads += maxServerThreads;

		for (const [index, target] of targets.entries()) {
			let script = ns.getRunningScript("grow.js", server.hostname, target.hostname);
			if (script) {
				data[server.hostname].growRunners += script.threads;
				data[target.hostname].growRunners += script.threads;
				data.counts.growRunners[index] += script.threads;
			}
			script = ns.getRunningScript("hack.js", server.hostname, target.hostname);
			if (script) {
				data[server.hostname].hackRunners += script.threads;
				data[target.hostname].hackRunners += script.threads;
				data.counts.hackRunners[index] += script.threads;
			}
			script = ns.getRunningScript("weaken.js", server.hostname, target.hostname);
			if (script) {
				data[server.hostname].weakenRunners += script.threads;
				data[target.hostname].weakenRunners += script.threads;
				data.counts.weakenRunners[index] += script.threads;
			}
		}
	}
	for (const target of targets) {
		// adjust thread usage based on new maximum threadcount
		data[target.hostname].wantedThreads = data.counts.maxThreads * target.threadRatio;
		data.counts.usedThreads += data[target.hostname].wantedThreads;
	}

	return data;
}
