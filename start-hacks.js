/**
 * @typedef {import('./types/NetscriptDefinitions').NS} NS
 */
import { findServers } from "infodump.js";

/** @param {NS} ns **/
export async function main(ns) {
	let servers = findServers(ns, -1).filter(server => shouldStartHack(server, ns));

	while (servers.length > 0) {
		await startHack(ns, servers.shift());
	}
}

/**
 * @param {string} server
 * @param {NS} ns
 * @return if this server should be exploited
 */
function shouldStartHack(server, ns) {
	return ns.hasRootAccess(server);
}

/**
 * @param {NS} ns
 * @param {string} server
 * @returns pid
 **/
async function startHack(ns, server) {
	await ns.scp("simple-hack.js", server);

	let numThreads = Math.floor((ns.getServerMaxRam(server)) / 2.2);
	if (numThreads <= 0) {
		return Promise.resolve();
	}
	ns.tprint(server + " will have " + numThreads + " worker threads");
	// kill anything running on the remote system then start up the new script
	ns.killall(server);
	ns.exec('simple-hack.js', server, numThreads);
	return Promise.resolve();
}