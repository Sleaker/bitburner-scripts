/**
 * @typedef {import('../types/NetscriptDefinitions').NS} NS
 */
import { findServers, getRootForServer } from "../util.js";
import * as log from "../log";
import { Zombie } from "../zombie";

/** @param {NS} ns **/
export async function main(ns) {
	log.initialize(ns);
	let servers = findServers({ns: ns, depth: -1, type: "dfs"});
	// TODO: connect to each server in the tree and backdoor it
	// servers.filter(server => ns.hasRootAccess(server))
	// 	.forEach(server => checkBackDoor(server, ns));
	let exploitable = servers.filter(server => server.shouldCrack === "true");

	log.info("Found exploitable servers: %j", exploitable.map(zombie => zombie.hostname));
	if (ns.args[0] === "-d") {
		exploitable.forEach(server => getRootForServer(server));
	} else {
		log.warn("To spread to new servers run with -d options.");
	}
}
