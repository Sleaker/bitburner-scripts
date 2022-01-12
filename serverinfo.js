/**
 * @typedef {import('./types/NetscriptDefinitions').NS} NS
 */

import * as logger from './log.js';
import { findServers } from './util.js';
import { compareZombie } from './zombie.js';
import { numAvailableExploits } from './exploits.js';

/** @param {NS} ns **/
export async function main(ns) {
	let HEADER_LENGTHS = {
		hostname: 18, contracts: 4, level: 5, shouldCrack: 5, root: 5, backdoor: 5, ports: 5, money: 7, growth: 6, effect: 6, weak: 5, chance: 6, rating: 6, security: 4, parent: 18, faction: 0
	};

	let SERVER_HEADER = {
		hostname: "Server Name", contracts: "Cont", level: "Level", shouldCrack: "Nuke", root: "Root", backdoor: "Back", ports: "Ports", weak: "Weak",
		money: "Money", growth: "Growth", effect: "Effect", chance: "Chance", rating: "Rating", security: "Sec", parent: "Parent", faction: "Faction"
	};

	logger.initialize(ns);
	let [depth, sort] = ns.args;
	if (!depth || isNaN(depth)) {
		depth = -1;
	}
	if (!sort) {
		sort = "rating";
	}
	logger.warn("File exists| %s", ns.fileExists("A-Green-Tomorrow.lit"));
	logger.info("Exploits: %s", numAvailableExploits(ns));
	logger.info("Starting scan with depth %i", depth);

	SERVER_HEADER[sort] = "+" + SERVER_HEADER[sort] + "+";
	HEADER_LENGTHS[sort] += 2;
	const INFO_FORMAT = "%(hostname)-" + HEADER_LENGTHS.hostname 
	+ "s | %(contracts)" + HEADER_LENGTHS.contracts 
	+ "s | %(level)" + HEADER_LENGTHS.level 
	+ "s | %(shouldCrack)" + HEADER_LENGTHS.shouldCrack
	+ "s | %(root)" + HEADER_LENGTHS.root
	+ "s | %(backdoor)" + HEADER_LENGTHS.backdoor
	+ "s | %(ports)" + HEADER_LENGTHS.ports
	+ "s | %(money)" + HEADER_LENGTHS.money
	+ "s | %(growth)" + HEADER_LENGTHS.growth
	+ "s | %(effect)" + HEADER_LENGTHS.effect
	+ "s | %(weak)" + HEADER_LENGTHS.weak
	+ "s | %(chance)" + HEADER_LENGTHS.chance
	+ "s | %(rating)" + HEADER_LENGTHS.rating
	+ "s | %(security)" + HEADER_LENGTHS.security
	+ "s | %(parent)" + HEADER_LENGTHS.parent
	+ "s | %(faction)s";

	const servers = findServers({ns: ns, depth: depth, type: "dfs"})
		.map(zombie => zombie.updateStats())
		.sort((a, b) => compareZombie(a, b, sort));
	logger.success("Found %i Servers: ", servers.length);

	logger.info(INFO_FORMAT, SERVER_HEADER);
	for (const zombie of servers) {
		await downloadTextFiles(ns, zombie.hostname)
			.then(() => logger.info(INFO_FORMAT, zombie));
	}
}

/**
 * @param {NS} ns
 * @param {string} server
 */
export async function downloadTextFiles(ns, server) {
	const files = ns.ls(server)
		.filter(fileName => !fileName.endsWith(".js") && fileName !== "A-Green-Tomorrow.lit" && !ns.fileExists(fileName, "home"))
		.filter(fileName => fileName.endsWith(".txt") || fileName.endsWith(".lit"));
	if (files.length == 0) {
		return Promise.resolve();
	}
	logger.warn("Found files to download: " + files);
	await ns.scp(files, server, "home");
}