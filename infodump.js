/**
 * @typedef {import('./types/NetscriptDefinitions').NS} NS
 */

import * as logger from './log.js';
import { findServers } from './util.js';
import { Zombie } from './zombie.js';


const INFO_FORMAT = "%(hostname)-18s | %(contracts)4s | %(level)5s | %(canRoot)5s | %(root)5s | %(ports)5s | %(money)7s | %(growth)6s | %(effect)6s | %(weak)5s | %(chance)6s | %(rating)6s | %(security)4s";
const SERVER_HEADER = {
	hostname: "Server Name", contracts: "Cont", level: "Level", canRoot: "Nuke", root: "Root", ports: "Ports", weak: "Weak",
	money: "Money", growth: "Growth", effect: "Effect", chance: "Chance", rating: "Rating", security: "Sec"
};
/** @param {NS} ns **/
export async function main(ns) {
	logger.initialize(ns);
	let depth = ns.args[0];
	if (!depth || isNaN(depth)) {
		depth = -1;
	}
	logger.warn("File exists| %s", ns.fileExists("/A-Green-Tomorrow.lit"));
	logger.info("Starting scan with depth %i", depth);
	const servers = findServers(ns, depth)
		.map(server => new Zombie(ns.getServer(server), ns))
		.sort((a, b) => b.currentRating - a.currentRating);
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