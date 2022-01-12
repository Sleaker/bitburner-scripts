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
	for (const zombie of runners) {
		destroy(zombie);
	}
	let [target] = servers;
	let setup = true;
	let counter = 0;
	let maxThreads = countTotalAvailableThreads(runners);
	logger.info("%(stage)s | Starting up against %(target)s using %(threads)d total threads.", { stage: setup ? "SETUP" : "HACK", target: target.hostname, threads: maxThreads });
	while (true) {
		if (setup && target.isAtMinSecurity() && target.isAtMaxMoney()) {
			logger.success("%(target)s finished setup.", { target: target.hostname });
			ns.print("Finished hack setup: " + target.hostname);
			setup = false;
		} else {
			// ns.print("Money: " + (100 * target.availableMoney / target.maxMoney).toFixed(1) + "% | Security: " + target.currentSecurity);
			logger.debug("%(target)s - Security %(sec)s - Money %(money)s/%(max)s", {
				target: target.hostname, 
				sec: target.currentSecurity,
				money: target.availableMoney, 
				max: target.maxMoney
			});
		}
		// Every 30 seconds rescan for new servers or exploitable servers
		if (++counter === 30) {
			home.updateStats();
			counter = 0;
			runners = await findNewServers(ns)
				.then(list => list.filter(zombie => zombie.memory > 0));

			runners.push(home);
			maxThreads = countTotalAvailableThreads(runners);
			if (servers[0].hostname !== target.hostname) {
				target = servers[0];
				setup = true;
				logger.info("Reselecting target to: %s", target.hostname);
				ns.print("Reselecting hack target: " + target.hostname);
			}
		}
		await doHacks(runners, target, maxThreads, setup);

		await ns.sleep(1000);
	}
}

/**
 * 
 * @param {Zombie[]} servers 
 * @param {Zombie} target 
 * @param {number} maxThreads
 * @param {boolean} setup
 */
async function doHacks(servers, target, maxThreads, setup) {
	target.updateStats();
	const [runningGrow, runningHack, runningWeaken] = getRunningScriptCounts(servers, target);

	// ns.print("Running | Grow: " + runningGrow + " | Hack: " + runningHack + " | Weaken: " + runningWeaken);
	logger.debug("Running | Grow: %(grow)s | Hack: %(hack)s | Weaken: %(weak)s", { grow: runningGrow, hack: runningHack, weak: runningWeaken });
	const growRate =  setup ? target.shouldGrow ? .9 : 0 : .84;
	
	let growThreads = Math.floor(maxThreads * growRate) - runningGrow;
	const hackRate = setup ? 0 : .04;
	let hackThreads = Math.floor(maxThreads * hackRate) - runningHack;
	for (const zombie of servers) {
		let availableRunners = zombie.maxHackThreads - zombie.growRunners - zombie.hackRunners - zombie.weakenRunners;

		if (availableRunners <= 0) {
			continue;
		}

		let toGrow = Math.min(availableRunners, growThreads);
		logger.debug("Calcs: new Grow: %s", toGrow);
		if (toGrow > 0 && !zombie.isScriptRunning("grow.js")) {
			logger.debug("Starting new grow exec on %s", zombie.hostname);
			zombie.ns.exec("grow.js", zombie.hostname, toGrow, target.hostname);
			
			await zombie.ns.sleep(5);
			zombie.ns.print(zombie.hostname + " " + zombie.getRunningScriptLogs(target, "grow.js")[0] + " -> Money: " + Formatter.formatMoney(target.availableMoney) + " / " + Formatter.formatMoney(target.maxMoney));
			availableRunners -= toGrow;
			growThreads -= toGrow;
		}

		let toHack = Math.min(availableRunners, hackThreads);
		if (toHack > 0 && !zombie.isScriptRunning("hack.js")) {
			await zombie.ns.sleep(100)
			logger.debug("Starting new hack exec on %s", zombie.hostname);
			zombie.ns.exec("hack.js", zombie.hostname, toHack, target.hostname);
			
			await zombie.ns.sleep(5);
			zombie.ns.print(zombie.hostname + " " + zombie.getRunningScriptLogs(target, "hack.js")[0] + " <- Money " + Formatter.formatMoney(target.availableMoney));
			availableRunners -= toHack;
			hackThreads -= toHack;
		}

		if (availableRunners > 0 && !zombie.isScriptRunning("weaken.js")) {
			logger.debug("Starting new weaken exec on %s", zombie.hostname);
			zombie.ns.exec("weaken.js", zombie.hostname, availableRunners, target.hostname);

			await zombie.ns.sleep(5);
			zombie.ns.print(zombie.hostname + " " + zombie.getRunningScriptLogs(target, "weaken.js")[0] + " -> " + target.currentSecurity);
		}
	}
}

/**
 * @param {NS} ns
 * @returns {Promise<Zombie[]>} array of zombies
 */
async function findNewServers(ns) {
	let servers = findServers({ns: ns, depth: -1, type: "dfs"});
	servers.filter(zombie => zombie.shouldCrack === "true")
		.forEach(zombie => getRootForServer(zombie));
	
	servers = servers.filter(zombie => zombie.root && zombie.memory > 0)
		.sort((a, b) => b.rating - a.rating);
	for (const zombie of servers) {
		await zombie.uploadFiles(["weaken.js", "hack.js", "grow.js"]);
		zombie.updateStats();
	}
	return Promise.resolve(servers);
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
 * @param {Zombie} target
 * @return {number[]} runningGrow, runningHack, runningWeaken
 */
function getRunningScriptCounts(servers, target) {
	let counts = [0, 0, 0];
	for (let zombie of servers) {
		zombie.updateStats();
		if (zombie.isScriptRunning("grow.js")) {
			zombie.growRunners = zombie.ns.getRunningScript("grow.js", zombie.hostname, target.hostname).threads;
		} else {
			zombie.growRunners = 0;
		}
		if (zombie.isScriptRunning("hack.js")) {
			zombie.hackRunners = zombie.ns.getRunningScript("hack.js", zombie.hostname, target.hostname).threads;
		} else {
			zombie.hackRunners = 0;
		}
		if (zombie.isScriptRunning("weaken.js")) {
			zombie.weakenRunners = zombie.ns.getRunningScript("weaken.js", zombie.hostname, target.hostname).threads;
		} else {
			zombie.weakenRunners = 0;
		}
		counts[0] += zombie.growRunners;
		counts[1] += zombie.hackRunners;
		counts[2] += zombie.weakenRunners;
	}

	return counts;
}
