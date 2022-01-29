/**
 * @typedef {import('./types/NetscriptDefinitions').NS} NS
 * @typedef {import('./types/NetscriptDefinitions').Server} Server
 */

import { findServers } from "./util.js";
import { Zombie } from './zombie.js';
import * as Formatter from './formatting.js';
import { Logger } from "./log.js";
import { exploits, numAvailableExploits, isExploitAvailable, runExploit } from "./exploits.js";

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
    ns.disableLog("killall");

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

	let targets = await findNewServers(ns);
	let runners = await findRunners(ns);
	// if we don't kill off all runners on target servers at startup then we can end up with stuck runners
	for (const runner of runners) {
		if (runner.hostname !== "home") {
			ns.killall(runner.hostname);
		}
	}
	let counter = 0;

	let threads = getThreadCounts(ns, runners, targets);
    ns.print("Starting up with total threads: -> " + threads.counts.maxThreads);

	while (true) {
		while(ns.peek(9) !== "NULL PORT DATA") {
			ns.print(ns.readPort(9));
		}
		for (const target of targets) {
			target.updateStats(ns);
			if (target.setup && target.isAtMinSecurity() && target.isAtMaxMoney()) {
				ns.print("-> Finished hack setup <- " + target.hostname);
				target.setup = false;
			}

			if (!target.setup && target.root && target.availableMoney < target.maxMoney * .15) {
				ns.print("-> temporarily stopping hacks <- " + target.hostname);
				target.setup = true;
			}

			if (target.shouldCrack === "true") {
				getRoot(ns, target);
			}

		}

		// Every 30 seconds rescan for new servers or exploitable servers
		if (++counter === 30) {
			counter = 0;

			runners = await findRunners(ns);
			if (runners.length === 0) {
				logger.error("Something went wrong, runners: %(servers)j - target: %(target)s", {target: targets[0].zombie, servers: runners});
				ns.print("Something went wrong, runners array is empty or no target was found.");
				ns.exit();
			}
			for (const target of targets) {
				if (target.root) {
					await target.uploadFiles(ns, ["weakenloop.js", "weaken.js", "hack.js", "grow.js"]);
					
					startupTargetScripts(ns, target);
				}
			}
			// re-sort the list so we are always using the best target
			targets = targets.sort((a, b) => b.currentRating - a.currentRating);
		}

		await doHacks(runners, targets, ns, logger);

		await ns.sleep(1000);
	}
}

/**
 * @param {ns}
 * @param {Zombie} zombie 
 */
function getRoot(ns, zombie) {
	exploits.filter(exploit => isExploitAvailable(ns, exploit))
		.map(exploit => exploit.substring(0, exploit.indexOf(".")))
		.forEach(exploit => runExploit(ns, exploit, zombie.hostname));
	ns.nuke(zombie.hostname);
	zombie.updateStats(ns);
	ns.print("Rooted server: " + zombie.hostname);
	ns.tprintf("SUCCESS | Rooted server: %s", zombie.hostname);
}

/**
 * 
 * @param {Server[]} runners 
 * @param {Zombie[]} targets
 * @param {NS} ns
 * @param {Logger} logger
 */
async function doHacks(runners, targets, ns, logger) {
	let threads = getThreadCounts(ns, runners, targets);

	for (const server of runners) {
		let availableRunners = threads[server.hostname].maxThreads - threads[server.hostname].growRunners - threads[server.hostname].hackRunners - threads[server.hostname].weakenRunners;
		if (availableRunners <= 0) {
			continue;
		}
		for (const target of targets) {
			target.updateStats(ns);
			if (!target.root || target.wantedGrowThreads === 0 && target.wantedHackThreads === 0 && target.wantedWeakenThreads === 0) {
				continue;
			}
			
			const toWeaken = Math.min(availableRunners, target.wantedWeakenThreads);
			// ns.print("Weaken: " + target.weakenRunners + " Hack: " + target.hackRunners + "Grow: " + target.growRunners);
			const weakenScript = ns.getRunningScript("weaken.js", server.hostname, target.hostname);
			if (toWeaken > 0 && !weakenScript) {
				logger.debug("Starting new weaken exec on %(host)s -> %(target)s", { host: server.hostname,  target: target.hostname});
				// ns.print("Starting new weaken exec on " + zombie.hostname + " with threads: " + toWeaken + " targeting: " + target.hostname);
				const pid = ns.exec("weaken.js", server.hostname, toWeaken, target.hostname);

				await ns.sleep(5);
				if (pid < 1) {
					ns.print("Failed to startup weaken on: " + server.hostname + " running threads: " 
						+ threads[server.hostname].weakenRunners + " wanted additional: " + toWeaken + " available runners: " + availableRunners);
					// logger.warn("%j", { weakRunners: threads[server.hostname].weakenRunners,
					// 	toWeaken: toWeaken, 
					// 	available: availableRunners,
					// 	server: serverData } );
				} else {
					ns.print(server.hostname + " weaken.js -> " + target.hostname + " -> Money: " + Formatter.formatMoney(target.availableMoney) + " / " + Formatter.formatMoney(target.maxMoney) + " -> " + target.currentSecurity);
					availableRunners -= toWeaken;
					target.wantedWeakenThreads -= toWeaken;
				}
	
			}

			const toGrow = Math.min(availableRunners, target.wantedGrowThreads);
			const growScript = ns.getRunningScript("grow.js", server.hostname, target.hostname);
			if (toGrow > 0 && !growScript) {
				logger.debug("Starting new grow exec on %(host)s -> %(target)s", { host: server.hostname,  target: target.hostname});
				const pid = ns.exec("grow.js", server.hostname, toGrow, target.hostname);
				
				await ns.sleep(5);
				if (pid > 0) {
					ns.print(server.hostname + " grow.js -> " + target.hostname + " -> Money: " + Formatter.formatMoney(target.availableMoney) + " / " + Formatter.formatMoney(target.maxMoney) + " -> Sec: " + target.currentSecurity);
					availableRunners -= toGrow;
					target.wantedGrowThreads -= toGrow;
				}
			}

			const toHack = Math.min(availableRunners, target.wantedHackThreads);
			const hackScript = ns.getRunningScript("hack.js", server.hostname, target.hostname);
			if (toHack > 0 && !hackScript) {
				logger.debug("Starting new hack exec on %(host)s -> %(target)s", { host: server.hostname,  target: target.hostname});
				const pid = ns.exec("hack.js", server.hostname, toHack, target.hostname);
				
				await ns.sleep(5);
				if (pid > 0) {
					ns.print(server.hostname + " hack.js -> " + target.hostname + " <- Money " + Formatter.formatMoney(target.availableMoney) + " / " + Formatter.formatMoney(target.maxMoney) + " -> " + target.currentSecurity);
					availableRunners -= toHack;
					target.wantedHackThreads -= toHack;
				}
			}
		}
		if (availableRunners > 0 && server.hostname === "home") {
			let shareScript = ns.getRunningScript("share.js", server.hostname);
			if (!shareScript && ns.getServer("home").maxRam - ns.getServer("home").ramUsed > 32000) {
				ns.print("Spinning up new share with leftover runners on home.");
				ns.run("share.js", Math.ceil(availableRunners / 3));
			}
		}
	}
}

/**
 * @param {NS} ns
 * @returns {Promise<Zombie[]>} array of zombies
 */
async function findNewServers(ns) {
	let allServers = findServers({ns: ns, depth: -1, type: "dfs"})
		.map(server => new Zombie(server.server, ns, server.parent, server.depth));

	for (const target of allServers) {
		target.setup = target.isAtMinSecurity() && target.isAtMaxMoney();

		if (target.shouldCrack === "true") {
			getRoot(ns, target);
		}
		await target.uploadFiles(ns, ["weakenloop.js", "weaken.js", "hack.js", "grow.js", "earlyhack.js"]);
		target.updateStats(ns);

		// 
		if (target.maxRunningThreads === 0) continue;

		startupTargetScripts(ns, target);
	}
	return Promise.resolve(allServers.filter(target => target.maxMoney > 0).sort((a, b) => b.currentRating - a.currentRating));
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
 * @param {Zombie[]} targets
 * @return {{counts: { growRunners: number[], weakenRunners: number[], hackRunners: number[], maxThreads: number, usedThreads: number}}} 
 */
function getThreadCounts(ns, runners, targets) {
	// initialize all of our data
	let data = {
		counts: {
			maxThreads: 0,
			usedThreads: 0
		}
	};
	for (let target of targets) {
		target.growRunners = 0;
		target.hackRunners = 0;
		target.weakenRunners = 0;
		target.growRate = target.setup ? target.shouldGrow ? .9 : 0 : .84;
		target.hackRate = target.setup ? 0 : .04;
	}
	// count the number of already running
	for (const server of runners) {
		let maxServerThreads = Math.floor(server.maxRam / 1.75);
		if (server.hostname === "home") {
			maxServerThreads = Math.floor(maxServerThreads * 0.8);
		}
		data[server.hostname] = { growRunners: 0, hackRunners: 0, weakenRunners: 0, maxThreads: maxServerThreads};
		data.counts.maxThreads += maxServerThreads;

		for (const target of targets) {
			let script = ns.getRunningScript("grow.js", server.hostname, target.hostname);
			if (script) {
				data[server.hostname].growRunners += script.threads;
				target.growRunners += script.threads;

			}
			script = ns.getRunningScript("hack.js", server.hostname, target.hostname);
			if (script) {
				data[server.hostname].hackRunners += script.threads;
				target.hackRunners += script.threads;

			}
			script = ns.getRunningScript("weaken.js", server.hostname, target.hostname);
			if (script) {
				data[server.hostname].weakenRunners += script.threads;
				target.weakenRunners += script.threads;
			}
		}
	}
	// setup how many actual threads we can use for each target based on total capacity
	for (const target of targets) {
		const totalTargetingThreads = Math.min(target.maxTargetingThreads, data.counts.maxThreads - data.counts.usedThreads);
		target.wantedGrowThreads = Math.max(Math.floor((totalTargetingThreads * target.growRate) - target.growRunners), 0);
		target.wantedHackThreads = Math.max(Math.ceil((totalTargetingThreads * target.hackRate) - target.hackRunners), 0);
		target.wantedWeakenThreads = Math.max(totalTargetingThreads - target.wantedGrowThreads - target.wantedHackThreads - target.weakenRunners - target.hackRunners - target.growRunners, 0);

		data.counts.usedThreads += totalTargetingThreads;
	}

	return data;
}

/**
 * @param {NS} ns 
 * @param {Zombie} target 
 */
function startupTargetScripts(ns, target) {
	// if this is early game, run oldschool single target hacks against harakiri-sushi
	const earlyThreads = Math.floor(target.memory / 2.2);
	if (ns.getPlayer().money < 5_000_000_000 && earlyThreads > 0 && ns.getServer("harakiri-sushi").hasAdminRights) {
		if (!ns.isRunning("earlyhack.js", target.hostname)) {
			ns.killall(target.hostname);
			ns.exec("earlyhack.js", target.hostname, earlyThreads);
		}
	}  
	// foodnstuff has the best XP rate, so just target it for weakenloops
	else if (!ns.isRunning("weakenloop.js", target.hostname, "foodnstuff") && target.maxRunningThreads > 0) {
		ns.killall(target.hostname);
		ns.exec("weakenloop.js", target.hostname, target.maxRunningThreads, "foodnstuff");
	}
}