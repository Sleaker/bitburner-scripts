import { findServers } from "util.js";

const NUM_AVAIL_PORT_EXPLOITS = 5;
/** @param {NS} ns **/
export async function main(ns) {
	let servers = findServers(ns, -1);
	// TODO: connect to each server in the tree and backdoor it
	// servers.filter(server => ns.hasRootAccess(server))
	// 	.forEach(server => checkBackDoor(server, ns));
	let exploitable = servers.filter(server => shouldExploitServer(server, ns));

	ns.tprint("Found exploitable servers: " + exploitable);
	if (ns.args[0] === "-d") {
		exploitable.forEach(server => exploitServer(server, ns));
	} else {
		ns.tprint("To spread to new servers run with -d options.");
	}
}

/**
 * @param {string} server
 * @param {NS} ns
 * @return if this server should be exploited
 */
function shouldExploitServer(server, ns) {
	// don't attempt hack if we already have root or num ports required exceeds our abilities
	if (ns.hasRootAccess(server) || ns.getServerNumPortsRequired(server) > NUM_AVAIL_PORT_EXPLOITS) {
		return false;
	}
	// don't attempt hack if the hacking level is too high
	if (ns.getServerRequiredHackingLevel(server) > ns.getHackingLevel()) {
		return false;
	}
	return true;
}

/**
 * @param {string} server
 * @param {NS} ns
 **/
function exploitServer(server, ns) {
	switch (ns.getServerNumPortsRequired(server)) {
		case 5:
			ns.tprint("Injecting SQL " + server);
			ns.sqlinject(server);
		case 4:
			ns.tprint("HTTP Worming " + server);
			ns.httpworm(server);
		case 3:
			ns.tprint("Opening SMTP relay " + server);
			ns.relaysmtp(server);
		case 2:
			ns.tprint("FTP Cracking " + server);
			ns.ftpcrack(server);
		case 1:
			ns.tprint("Brute forcing SSH " + server);
			ns.brutessh(server);
		case 0:
			ns.tprint("Nuking " + server);
			ns.nuke(server);
		default:
	}
}