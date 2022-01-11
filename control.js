/**
 * @typedef {import('./types/NetscriptDefinitions').NS} NS
 */

import { findAllServers } from "./util.js";
import { Zombie, newZombie } from './zombie.js';
import * as Util from './util.js';
import * as logger from "./log.js";

/** 
 * Main control script, scans all potential servers at startup, selects 
 * the best one to hack based on calculated statics and then starts up hacks
 * on every available server.
 * @see {Zombie}
 * @see {findAllServers}
 * @see {logger}
 * 	
 * TODO: check for new discovered servers runner servers during each loop
 * TODO: auto-reselect target server based on access to new servers
 * TODO: don't filter "home" from list of servers that can have threads running
 *
 * @param {NS} ns
 **/
export async function main(ns) {
	logger.initialize(ns);
	ns.disableLog("sleep");
	ns.disableLog("exec");

	const servers = findAllServers(ns)
		.map(server => newZombie(ns, server))
		.filter(zombie => zombie.root)
		.sort((a, b) => b.rating - a.rating);
	
	// target is first server in the array after a sort
	const [target] = servers;

	// Kill all scripts running on remote servers
	const runners = servers.filter(zombie => zombie.memory > 0);
	for (const zombie of runners) {
		await destroy(zombie)
			.then(() => zombie.uploadFiles(["weaken.js", "hack.js", "grow.js"]));
	}
	await hackTarget(ns, runners, target)
		.then(() => hackTarget(ns, runners, target, false));
}

/**
 * @param {Zombie} server
 */
async function destroy(server) {
	return Promise.resolve(await server.ns.killall(server.hostname));
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
async function hackTarget(ns, servers, target, setup = true) {
	let maxThreads = countTotalAvailableThreads(servers);
	logger.info("%(stage)s | Starting up against %(target)s using %(threads)d total threads.", { stage: setup ? "SETUP" : "HACK", target: target.hostname, threads: maxThreads });
	while (true) {
		target.updateStats();
		const [runningGrow, runningHack, runningWeaken] = getRunningScriptCounts(servers, target);

		// ns.print("Running | Grow: " + runningGrow + " | Hack: " + runningHack + " | Weaken: " + runningWeaken);
		logger.debug("Running | Grow: %(grow)s | Hack: %(hack)s | Weaken: %(weak)s", { grow: runningGrow, hack: runningHack, weak: runningWeaken });
		const growRate =  setup ? target.shouldGrow ? .9 : 0 : .84;
		
		let growThreads = Math.floor(maxThreads * growRate) - runningGrow;
		const hackRate = setup ? 0 : .04;
		let hackThreads = Math.floor(maxThreads * hackRate) - runningHack;
		// ns.print("Wanted grow threads: " + growThreads);
		for (const zombie of servers) {
			let availableRunners = zombie.maxHackThreads - zombie.growRunners - zombie.hackRunners - zombie.weakenRunners;

			if (availableRunners <= 0) {
				continue;
			}

			let toGrow = Math.min(availableRunners, growThreads);
			logger.debug("Calcs: new Grow: %s", toGrow);
			// TODO: handle additional grow scripts better
			if (toGrow > 0 && !zombie.isScriptRunning("grow.js")) {
				logger.debug("Starting new grow exec on %s", zombie.hostname);
				ns.exec("grow.js", zombie.hostname, toGrow, target.hostname);
				
				await ns.sleep(5);
				ns.print(zombie.hostname + " " + zombie.getRunningScriptLogs(target, "grow.js")[0] + " -> Money: " + Util.formatMoney(target.availableMoney) + " / " + Util.formatMoney(target.maxMoney));
				availableRunners -= toGrow;
				growThreads -= toGrow;
			}
			let toHack = Math.min(availableRunners, hackThreads);
			
			// TODO: handle additional hack scripts better
			if (toHack > 0 && !zombie.isScriptRunning("hack.js")) {
				await ns.sleep(100)
				logger.debug("Starting new hack exec on %s", zombie.hostname);
				ns.exec("hack.js", zombie.hostname, toHack, target.hostname);
				
				await ns.sleep(5);
				ns.print(zombie.hostname + " " + zombie.getRunningScriptLogs(target, "hack.js")[0] + " <- Money " + Util.formatMoney(target.availableMoney));
				availableRunners -= toHack;
				hackThreads -= toHack;
			}
	
			// TODO: handle additional weaken scripts better
			if (availableRunners > 0 && !zombie.isScriptRunning("weaken.js")) {
				logger.debug("Starting new weaken exec on %s", zombie.hostname);
				ns.exec("weaken.js", zombie.hostname, availableRunners, target.hostname);

				await ns.sleep(5);
				ns.print(zombie.hostname + " " + zombie.getRunningScriptLogs(target, "weaken.js")[0] + " -> " + target.currentSecurity);
			}
		}

		await ns.sleep(1000);
		if (setup && target.isAtMinSecurity() && target.isAtMaxMoney()) {
			for (const zombie of servers) {
				await destroy(zombie);
			}
			logger.success("%(target)s finished setup.", { target: target.hostname });
			break;
		} else {
			// ns.print("Money: " + (100 * target.availableMoney / target.maxMoney).toFixed(1) + "% | Security: " + target.currentSecurity);
			logger.debug("%(target)s - Security %(sec)s - Money %(money)s/%(max)s", {
				target: target.hostname, 
				sec: target.currentSecurity,
				money: target.availableMoney, 
				max: target.maxMoney
			});
		}
	}
}