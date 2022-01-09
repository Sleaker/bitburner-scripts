'use strict';
import { findAllServers } from "util.js";
import { newZombie } from 'zombie.js';
import * as logger from "log.js";

/**
 * @typedef {object} serverInfo
 * @property {NS} ns
 * @property {string} hostname
 * @property {string} grow
 * @property {number} memory
 * @property {number} level
 * @property {number} ports
 * @property {number} maxMoney
 * @property {number} hackEffect
 * @property {string} effect
 * @property {number} hackChance
 * @property {string} chance
 * @property {number} security
 * @property {string} money
 * @property {Server} server
 * @property {number} usedMemory
 * @property {number} availableMemory
 * @property {boolean} root
 * @property {boolean} nuke
 * @property {number} contracts
 * @property {number} availableMoney
 * @property {number} currentRating
 * @property {number} rating
 * @property {number} currentRating
 * @property {boolean} shouldGrow
 * @property {number} maxHackThreads
 * @property {number} currentSecurity
 * @function updateStats
 */

/** @param {NS} ns **/
export async function main(ns) {
	logger.initialize(ns);
	ns.disableLog("sleep");
	ns.disableLog("exec");
	// const servers = findServers(ns, -1)
	// 	.map(server => getServerDetails(ns, server))
	// 	.filter(server => server.root);
	const servers = findAllServers(ns)
		.map(server => newZombie(ns, server))
		.filter(zombie => zombie.root)
		.sort((a, b) => b.rating - a.rating);
	const [target] = servers;

	// Kill all scripts running on remote servers
	for (const zombie of servers) {
		await destroy(zombie)
			.then(() => zombie.uploadFiles(["weaken.js", "hack.js", "grow.js"]));
	}
	await hackTarget(ns, servers, target)
		.then(() => hackTarget(ns, servers, target, false));
}

/**
 * @param {serverInfo} server
 */
async function destroy(server) {
	return Promise.resolve(await server.ns.killall(server.hostname));
}

/**
 * @param {serverInfo[]} servers
 */
function countTotalAvailableThreads(servers) {
	return servers.map(zombie => zombie.maxHackThreads).reduce((total, num) => total + num);
}

/**
 * @param {serverInfo[]} servers
 * @param {serverInfo} target
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
 * @param {NS} ns
 * @param {serverInfo[]} servers
 * @param {serverInfo} target
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
		const growRate = target.shouldGrow ? (setup ? .8 : .57) : 0;
		let growThreads = Math.floor(maxThreads * growRate) - runningGrow;
		const hackRate = setup ? 0 : .36;
		let hackThreads = Math.floor(maxThreads * hackRate) - runningHack;
		// ns.print("Wanted grow threads: " + growThreads);
		for (const zombie of servers) {
			let availableRunners = zombie.maxHackThreads - zombie.growRunners - zombie.hackRunners - zombie.weakenRunners;

			if (availableRunners <= 0) {
				continue;
			}

			let toGrow = Math.min(availableRunners, growThreads);
			logger.debug("Calcs: new Grow: %s", toGrow);
			if (toGrow > 0) {
				logger.debug("Starting new grow exec on %s", zombie.hostname);
				ns.exec("grow.js", zombie.hostname, toGrow, target.hostname);
				
				await ns.sleep(1);
				// logger.info("%j", {logs: zombie.getRunningScriptLogs(target, "grow.js"), running: zombie.isScriptRunning("grow.js")});
				ns.print(zombie.hostname + " " + zombie.getRunningScriptLogs(target, "grow.js")[0]);
				availableRunners -= toGrow;
				growThreads -= toGrow;
			}
			let toHack = Math.min(availableRunners, hackThreads);
			
			if (toHack > 0) {
				logger.debug("Starting new hack exec on %s", zombie.hostname);
				ns.exec("hack.js", zombie.hostname, toHack, target.hostname);
				
				await ns.sleep(1);
				ns.print(zombie.hostname + " " + zombie.getRunningScriptLogs(target, "grow.js")[0]);
				availableRunners -= toHack;
				growThreads -= toHack;
			}
	
			if (availableRunners > 0) {
				logger.debug("Starting new weaken exec on %s", zombie.hostname);
				ns.exec("weaken.js", zombie.hostname, availableRunners, target.hostname);

				await ns.sleep(1);
				// logger.info("%j", zombie.getRunningScriptLogs(target, "weaken.js"));
				ns.print(zombie.hostname + " " + zombie.getRunningScriptLogs(target, "weaken.js")[0]);
			}
		}

		await ns.sleep(1000);
		// TODO: check for new discovered servers
		// TODO: auto-reselect target based on better statistics
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