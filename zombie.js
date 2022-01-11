/**
 * @typedef {import('./types/NetscriptDefinitions').NS} NS
 * @typedef {import('./types/NetscriptDefinitions').Server} Server
 */

import { formatMoney } from './formatting.js';

/**
 * @param {NS} ns
 * @param {string} hostname
 * @param {string} parentHostname
 * @constructs {Zombie}
 */
export function newZombie(ns, hostname, parentHostname = undefined) {
	return new Zombie(ns.getServer(hostname), ns, parentHostname);
};

/**
 * Class wrapping the @see {Server} object
 */
export class Zombie {
	/**
	 * @param {Server} server
	 * @param {NS} ns
	 */
	constructor(server, ns, parentHostname = undefined, depth = 0) {
		this.ns = ns;
		this.hostname = server.hostname;
		this.growth = server.serverGrowth;
		this.memory = server.maxRam;
		this.level = server.requiredHackingSkill;
		this.ports = server.numOpenPortsRequired;
		this.maxMoney = server.moneyMax;
		this.security = server.minDifficulty;
		this.money = formatMoney(this.maxMoney);
		this.faction = server.organizationName;
		this.parent = parentHostname;
		this.depth = depth;
		this.updateStats();
	}

	/**
	 * Updates cached computed statistics with latest live information
	 */
	updateStats() {
		this.server = this.ns.getServer(this.hostname);
		this.hackEffect = this.ns.formulas.hacking.hackPercent(this.server, this.ns.getPlayer());
		this.effect = this.hackEffect.toFixed(4);
		this.hackChance = this.ns.formulas.hacking.hackChance(this.server, this.ns.getPlayer());
		this.chance = this.hackChance.toFixed(4);
		this.usedMemory = this.server.ramUsed;
		this.availableMemory = this.memory - this.usedMemory;
		this.root = this.server.hasAdminRights;
		this.contracts = this.ns.ls(this.hostname, ".cct").length;
		this.weakenTime = this.calculateMinWeakenTime(this.ns.getPlayer());
		this.availableMoney = this.server.moneyAvailable;
		this.weak = this.weakenTime.toFixed(0);
		this.currentSecurity = this.server.hackDifficulty;
		this.shouldCrack = this.root ? "done" : (this.level < this.ns.getPlayer().hacking) ? "true" : "false";
		return this;
	}

	get currentRating() {
		return (this.maxMoney * this.hackEffect * this.hackChance * Math.min(this.growth, 100) / this.weakenTime) / 1e3;
	}

	get rating() {
		return this.currentRating.toFixed(0);
	}

	get shouldGrow() {
		return this.availableMoney < this.maxMoney;
	}

	get maxHackThreads() {
		return Math.floor(this.memory / 1.75);
	}

	isAtMinSecurity() {
		return this.currentSecurity == this.security;
	}

	isAtMaxMoney() {
		return this.maxMoney == this.availableMoney;
	}

	/**
	 * @param {Player} player
	 */
	calculateMinWeakenTime(player) {
		const difficultyMult = this.level * this.security;

		const baseDiff = 500;
		const baseSkill = 50;
		const diffFactor = 2.5;
		let skillFactor = diffFactor * difficultyMult + baseDiff;

		skillFactor /= player.hacking + baseSkill;

		const weakenTimeMultiplier = 20;
		return (weakenTimeMultiplier * skillFactor) /
			(player.hacking_speed_mult * (1 + (Math.pow(player.intelligence, 0.8)) / 600));
	}

	/**
	 * @param {string} scriptName
	 */
	isScriptRunning(scriptName) {
		return this.ns.scriptRunning(scriptName, this.hostname);
	}

	/**
	 * @param {serverInfo} target
	 * @param {string} scriptName
	 */
	getRunningScriptLogs(target, scriptName) {
		if (this.isScriptRunning(scriptName)) {
			return this.ns.getRunningScript(scriptName, this.hostname, target.hostname).logs;
		} else {
			return [];
		}
	}

	/**
	 * @param {string[]} files 
	 */
	async uploadFiles(files) {
		await this.ns.scp(files, this.hostname);
	}
}

/**
 * Compares two Zombie objects
 * @param {Zombie} a
 * @param {Zombie} b
 * @param {string} field
 */
export function compareZombie(a, b, field) {
	switch (field) {
		case "hostname":
		case "parent":
		case "faction":
		case "canRoot":
			return a.hostname.localeCompare(b.hostname);
		case "nuke":
		case "root":
			return a[field] === b[field] ? 0 : a[field] ? -1 : 1;
		default:
			return b[field] - a[field];
	}
}