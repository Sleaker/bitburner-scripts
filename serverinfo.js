/**
 * @typedef {import('./types/NetscriptDefinitions').NS} NS
 */

import { Logger } from './log.js';
import { findServers } from './util.js';
import { compareZombie, Zombie } from './zombie.js';
import { numAvailableExploits } from './exploits.js';

let _serverLogger;
/** @param {NS} ns **/
export async function main(ns) {
	_serverLogger = new Logger(ns, false);
	let HEADER_LENGTHS = {
		hostname: 18, depth: 3, contracts: 2, level: 4, shouldCrack: 5, root: 5, backdoor: 5, ports: 2, 
		money: 7, growth: 3, effect: 5, weak: 5, chance: 4, rating: 4, security: 4, parent: 18, faction: 0
	};

	let SERVER_HEADER = {
		hostname: "Server Name", depth: "Dep", contracts: "Cx", level: "LvL", shouldCrack: "Nuke", root: "Root", backdoor: "Back", ports: "P", weak: "Weak",
		money: "Money", growth: "Gro", effect: "Eff", chance: "Chnc", rating: "Rate", security: "Sec", parent: "Parent", faction: "Faction"
	};

	let [depth, sort] = ns.args;
	if (!depth || isNaN(depth)) {
		depth = -1;
	}
	if (!sort) {
		sort = "rating";
	}
	let asc = false;
	if (sort.endsWith("-")) {
		asc = true;
		sort = sort.substring(0, sort.indexOf("-"));
	}
	_serverLogger.info("Available Exploits: %s", numAvailableExploits(ns));
	_serverLogger.info("Starting scan with depth %i", depth);

	SERVER_HEADER[sort] = (asc ? "-" : "+") + SERVER_HEADER[sort] + (asc ? "-" : "+");
	HEADER_LENGTHS[sort] += 2;
	const INFO_FORMAT = "%(hostname)-" + HEADER_LENGTHS.hostname 
	+ "s | %(depth)" + HEADER_LENGTHS.depth
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
	+ "s" // | %(faction)s";

	const servers = findServers({ns: ns, depth: depth, type: "bfs"})
		.filter(current => !current.server.hostname.startsWith("zombie"))
		.map(current => new Zombie(current.server, ns, current.parent, current.depth))
		.sort((a, b) => compareZombie(a, b, sort, asc));
		_serverLogger.success("Found %i Servers: ", servers.length);

		_serverLogger.info(INFO_FORMAT, SERVER_HEADER);
	for (const zombie of servers) {
		await downloadTextFiles(ns, zombie.hostname)
			.then(() => _serverLogger.info(INFO_FORMAT, zombie));
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
	_serverLogger.warn("Found files to download: " + files);
	await ns.scp(files, server, "home");
}