/**
 * @typedef {import('./types/NetscriptDefinitions').NS} NS
 */

import { findServers, getRootForServer } from "./util.js";
import { Zombie } from './zombie.js';
import * as Formatter from './formatting.js';
import * as logger from "./log.js";

/** 
 * Main control script, scans all potential servers at startup, selects 
 * the best one to hack based on calculated statics and then starts up hacks
 * on every available server.
 * @see {Zombie}
 * @see {findAllServers}
 * @see {logger}
 * 	
 *
 * @param {NS} ns
 **/
export async function main(ns) {
	// initialize our logging system
	logger.initialize(ns);
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
 * @param {Zombie[]} servers
 * @param {Zombie} target
 * @param {boolean} setup
 */
async function control(ns) {
	const home = new Zombie(ns.getServer("home"), ns);
	let servers = await findNewServers(ns);
	let runners = servers.filter(zombie => zombie.memory > 0);
	// if we don't kill off all runners on target servers at startup then we can end up with stuck runners
	for (const zombie of runners) {
		if (zombie.hostname !== "home") {
			destroy(zombie);
		}
	}
	let counter = 0;
	let maxThreads = countTotalAvailableThreads(runners);
	let targets = [{ zombie: servers[0], setup: true, threads: maxThreads, threadRatio: 1 }];
	logger.info("%(stage)s | Starting up against %(target)s using %(threads)d total threads.", 
		{ stage: targets[0].setup ? "SETUP" : "HACK", target: targets[0].zombie.hostname, threads: maxThreads });
	while (true) {
		for (const target of targets) {
			if (target.setup && target.zombie.isAtMinSecurity() && target.zombie.isAtMaxMoney()) {
				logger.success("Finished hack setup: %s", targets[0].zombie.hostname);
				ns.print("Finished hack setup: " + targets[0].zombie.hostname);
				target.setup = false;
			}
		}
		
		// TODO: adjust ratio reselection to allow for more than 2 servers.
		if (targets.length === 1 && !targets[0].setup && targets[0].zombie.availableMoney < targets[0].zombie.maxMoney * .20) {
			targets[0].setup = true;
			ns.print("Target funds draining too quickly. Rerunning setup: " + targets[0].zombie.hostname);
			// if (servers[1] && targets[0].threadRatio > .5) {
			// 	targets[0].threadRatio -= .1;
			// 	targets[0].threads = maxThreads * targets[0].threadRatio;
			// 	if (!targets[1]) {
			// 		targets[1] = { zombie: servers[1], setup: true, threadRatio: 0 };
			// 		ns.print("Target funds draining too quickly. Rerunning setup, and adding new target: " + targets[1].zombie.hostname);
			// 	}
			// 	targets[1].threadRatio += .1;
			// 	targets[1].threads = maxThreads - targets[0].threads;
			// 	ns.print("Updated hack ratio: " + targets[0].threadRatio + "|" + targets[1].threadRatio);
			// }
		}
		// Every 30 seconds rescan for new servers or exploitable servers
		if (++counter === 30) {
			home.updateStats();
			counter = 0;
			servers = await findNewServers(ns);
			runners = servers.filter(zombie => zombie.memory > 0);
			if (runners.length === 0 || !targets[0].zombie) {
				logger.error("Something went wrong, runners: %(servers)j - target: %(target)s", {target: targets[0].zombie, servers: runners});
				ns.print("Something went wrong, runners array is empty or no target was found.");
				ns.exit();
			}

			runners.push(home);
			maxThreads = countTotalAvailableThreads(runners);
			let usedThreads = 0;
			// TODO: this might be buggy? needs testing
			for (const [index, target] of targets.entries()) {
				if (servers[index].hostname !== target.zombie.hostname) {
					if (index === 0) {
						// if main target resets, just start from scratch
						targets = [{ zombie: servers[0], setup: true, threads: maxThreads, threadRatio: 1 }];
						logger.info("Reselecting main target to: %s", target.zombie.hostname);
						ns.print("Reselecting main hack target: " + target.zombie.hostname);
						break;
					} else {
						target.zombie = servers[index];
						target.setup = true;
						logger.info("Reselecting secondary target to: %s", target.zombie.hostname);
						ns.print("Reselecting secondary hack target: " + target.zombie.hostname);
					}
				}
				// adjust thread usage based on new maximum threadcount
				if (usedThreads === 0) {
					target.threads = maxThreads * target.threadRatio;
					usedThreads += target.threads;
				} else {
					target.threads = maxThreads - usedThreads;
					usedThreads += target.threads;
				}
			}
		}

		
		await doHacks(runners, targets);
		

		await ns.sleep(1000);
	}
}

/**
 * 
 * @param {Zombie[]} servers 
 * @param {{
 *   zombie: Zombie,
 *   setup: boolean,
 *   threads: number,
 *   threadRatio: number
 *   }[]} targets
 */
async function doHacks(servers, targets) {
	// TODO: script counts don't seem to be tracked property and arren't being updated on the objects properly.
	// TODO: this seems to be a result of how bitBurner caches objects/classes as Zombie objects seem to not be getting updated properly with
	// new data in some circumstances, Updating the zombie.class also doesn't cause a refresh properly.
	let [growRunners, hackRunners, weakenRunners] = getRunningScriptCounts(servers, targets);
	for (const [index, target] of targets.entries()) {
		const growRate = target.setup ? target.zombie.shouldGrow ? .9 : 0 : .84;
		const hackRate = target.setup ? 0 : .04;
		target.wantedGrowThreads = Math.max(Math.floor((target.threads * growRate) - growRunners[index]), 0);
		target.wantedHackThreads = Math.max(Math.floor((target.threads * hackRate) - hackRunners[index]), 0);
		target.wantedWeakenThreads = Math.max(target.threads - target.wantedGrowThreads - target.wantedHackThreads - weakenRunners[index] - hackRunners[index] - growRunners[index], 0);
		logger.debug("Start: %j", {threads: [target.wantedGrowThreads, target.wantedHackThreads, target.wantedWeakenThreads], running: [growRunners, hackRunners, weakenRunners]});
	}

	// ns.print("Running | Grow: " + runningGrow + " | Hack: " + runningHack + " | Weaken: " + runningWeaken);
	
	for (const zombie of servers) {
		let availableRunners = zombie.maxHackThreads - zombie.growRunners - zombie.hackRunners - zombie.weakenRunners;
		if (availableRunners <= 0) {
			continue;
		}
		for (const [index, target] of targets.entries()) {
			
			const toWeaken = Math.min(availableRunners, target.wantedWeakenThreads);
			const weakenScript = zombie.ns.getRunningScript("weaken.js", zombie.hostname, target.zombie.hostname);
			// logger.info("Script: %j", weakenScript);
			if (toWeaken > 0 && !weakenScript) {
				logger.debug("Starting new weaken exec on %(host)s -> %(target)s", { host: zombie.hostname,  target: target.zombie.hostname});
				zombie.ns.print("Starting new weaken exec on " + zombie.hostname + " with threads: " + toWeaken + " targeting: " + target.zombie.hostname);
				const pid = zombie.ns.exec("weaken.js", zombie.hostname, toWeaken, target.zombie.hostname);

				await zombie.ns.sleep(5);
				if (pid < 1) {
					zombie.ns.print("Failed to startup weaken on: " + zombie.hostname + " running threads: " 
						+ zombie.weakenRunners + " wanted additional: " + toWeaken + " available runners: " + availableRunners);
					let serverData = zombie.ns.getServer(zombie.hostname);
					logger.warn("%j", { weakRunners: zombie.weakenRunners,
						toWeaken: toWeaken, 
						available: availableRunners,
						hostname: zombie.hostname, server: zombie.server, updated: serverData } );
				} else {
					zombie.ns.print(zombie.hostname + " " + zombie.getRunningScriptLogs(target.zombie, "weaken.js")[0] + " -> " + target.zombie.currentSecurity);
					availableRunners -= toWeaken;
					target.wantedWeakenThreads -= toWeaken;
				}
	
			}

			const toGrow = Math.min(availableRunners, target.wantedGrowThreads);
			const growScript = zombie.ns.getRunningScript("grow.js", zombie.hostname, target.zombie.hostname);
			logger.debug("Calcs: new Grow: %s", toGrow);
			if (toGrow > 0 && !growScript) {
				logger.debug("Starting new grow exec on %(host)s -> %(target)s", { host: zombie.hostname,  target: target.zombie.hostname});
				const pid = zombie.ns.exec("grow.js", zombie.hostname, toGrow, target.zombie.hostname);
				
				await zombie.ns.sleep(5);
				if (pid > 0) {
					zombie.ns.print(zombie.hostname + " " + zombie.getRunningScriptLogs(target.zombie, "grow.js")[0] + " -> Money: " + Formatter.formatMoney(target.zombie.availableMoney) + " / " + Formatter.formatMoney(target.zombie.maxMoney));
					availableRunners -= toGrow;
					target.wantedGrowThreads -= toGrow;
				}
			}

			const toHack = Math.min(availableRunners, target.wantedHackThreads);
			const hackScript = zombie.ns.getRunningScript("hack.js", zombie.hostname, target.zombie.hostname);
			if (toHack > 0 && !hackScript) {
				await zombie.ns.sleep(100)
				logger.debug("Starting new hack exec on %(host)s -> %(target)s", { host: zombie.hostname,  target: target.zombie.hostname});
				const pid = zombie.ns.exec("hack.js", zombie.hostname, toHack, target.zombie.hostname);
				
				await zombie.ns.sleep(5);
				if (pid > 0) {
					zombie.ns.print(zombie.hostname + " " + zombie.getRunningScriptLogs(target.zombie, "hack.js")[0] + " <- Money " + Formatter.formatMoney(target.zombie.availableMoney) + " -> " + target.zombie.currentSecurity);
					availableRunners -= toHack;
					target.wantedHackThreads -= toHack;
				}
			}
		}
	}
	// logger.info("End:   %j", {threads: [wantedGrowThreads, wantedHackThreads, wantedWeakenThreads]});
}

/**
 * @param {NS} ns
 * @returns {Promise<Zombie[]>} array of zombies
 */
async function findNewServers(ns) {
	let allServers = findServers({ns: ns, depth: -1, type: "dfs"});

	for (const zombie of allServers) {
		if (zombie.shouldCrack === "true") {
			getRootForServer(zombie);
		}
		await zombie.uploadFiles(["weaken.js", "hack.js", "grow.js"]);
		zombie.updateStats();
	}
	let rooted = allServers.filter(zombie => zombie.root).sort((a, b) => b.currentRating - a.currentRating);
	return Promise.resolve(rooted);
}

/**
 * @param {Zombie} server
 */
 function destroy(server) {
	return server.ns.killall(server.hostname);
}

/**
 * @param {Zombie[]} servers
 */
function countTotalAvailableThreads(servers) {
	return servers
		.map(zombie => zombie.maxHackThreads)
		.reduce((total, num) => total + num);
}


/**
 * @param {Zombie[]} servers
 * @param {{
 *   zombie: Zombie,
 *   setup: boolean,
 *   threads: number,
 *   threadRatio: number
 *   }[]} targets
 * @return {number[][]} runningGrow, runningHack, runningWeaken
 */
function getRunningScriptCounts(servers, targets) {

	let counts = [[], [], []];
	for (let target of targets) {
		target.zombie.updateStats();
		target.growRunners = 0;
		target.hackRunners = 0;
		target.weakenRunners = 0;
		counts[0].push(0);
		counts[1].push(0);
		counts[2].push(0);
	}
	for (let zombie of servers) {
		zombie.updateStats();
		zombie.growRunners = 0;
		zombie.hackRunners = 0;
		zombie.weakenRunners = 0;
		
		for (const [index, target] of targets.entries()) {
			let script = zombie.ns.getRunningScript("grow.js", zombie.hostname, target.zombie.hostname);
			if (script) {
				zombie.growRunners += script.threads;
				target.growRunners += script.threads;
				counts[0][index] += script.threads;
			}
			script = zombie.ns.getRunningScript("hack.js", zombie.hostname, target.zombie.hostname);
			if (script) {
				zombie.hackRunners += script.threads;
				target.hackRunners += script.threads;
				counts[1][index] += script.threads;
			}
			script = zombie.ns.getRunningScript("weaken.js", zombie.hostname, target.zombie.hostname);
			if (script) {
				zombie.weakenRunners += script.threads;
				target.weakenRunners += script.threads;
				counts[2][index] += script.threads;
			}
		}
	}

	return counts;
}
