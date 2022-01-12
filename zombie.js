/**
 * @typedef {import('./types/NetscriptDefinitions').NS} NS
 * @typedef {import('./types/NetscriptDefinitions').Server} Server
 * @typedef {import('./types/NetscriptDefinitions').Player} Player
 */

import { formatMoney } from './formatting.js';
import { numAvailableExploits } from './exploits.js';

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
		this.ns.disableLog("getHackingLevel");
		const player = this.ns.getPlayer();
		this.server = this.ns.getServer(this.hostname);
		this.hackEffect = calculatePercentMoneyHacked(this.server, player);
		this.effect = this.hackEffect.toFixed(4);
		this.hackChance = calculateHackingChance(this.server, player);
		this.chance = this.hackChance.toFixed(4);
		this.usedMemory = this.server.ramUsed;
		this.availableMemory = this.memory - this.usedMemory;
		this.root = this.server.hasAdminRights;
		this.contracts = this.ns.ls(this.hostname, ".cct").length;
		this.weakenTime = calculateWeakenTime(this.server, player);
		this.availableMoney = this.server.moneyAvailable;
		this.weak = this.weakenTime.toFixed(0);
		this.currentSecurity = this.server.hackDifficulty;
		this.shouldCrack = this.root ? "done" : (this.level <= this.ns.getHackingLevel() && this.ports <= numAvailableExploits(this.ns)) ? "true" : "false";
		this.backdoor = this.server.backdoorInstalled;
		return this;
	}

	get currentRating() {
		return (this.maxMoney * this.hackChance * this.hackEffect * Math.min(this.growth, 100) / this.weakenTime) / 1e3;
	}

	get rating() {
		return this.currentRating.toFixed(0);
	}

	get shouldGrow() {
		return this.availableMoney < this.maxMoney;
	}

	get maxHackThreads() {
		let maxThreads = Math.floor(this.memory / 1.75);
		return this.hostname === "home" ? Math.floor(maxThreads * .8) : maxThreads;
	}

	isAtMinSecurity() {
		return this.currentSecurity == this.security;
	}

	isAtMaxMoney() {
		return this.maxMoney == this.availableMoney;
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
 * @param {Server} server
 * @param {Player} player
 */
function calculateWeakenTime(server, player) {
	const difficultyMult = server.requiredHackingSkill * server.hackDifficulty;

	const baseDiff = 500;
	const baseSkill = 50;
	const diffFactor = 2.5;
	let skillFactor = diffFactor * difficultyMult + baseDiff;

	skillFactor /= player.hacking + baseSkill;

	const weakenTimeMultiplier = 20;
	return (weakenTimeMultiplier * skillFactor) /
		(player.hacking_speed_mult * calculateIntelligenceBonus(player.intelligence, 1));
}

/**
 * 
 * @param {Server} server 
 * @param {Player} player 
 * @returns 
 */
function calculateHackingChance(server, player) {
	const hackFactor = 1.75;
	const difficultyMult = (100 - server.hackDifficulty) / 100;
	const skillMult = hackFactor * player.hacking;
	const skillChance = (skillMult - server.requiredHackingSkill) / skillMult;
	const chance =
		skillChance * difficultyMult * player.hacking_chance_mult * calculateIntelligenceBonus(player.intelligence, 1);
	if (chance > 1) {
		return 1;
	}
	if (chance < 0) {
		return 0;
	}

	return chance;
}

function calculateIntelligenceBonus(intelligence, weight = 1) {
	return 1 + (weight * Math.pow(intelligence, 0.8)) / 600;
}

/**
 * 
 * @param {Server} server 
 * @param {Player} player 
 * @returns 
 */
function calculatePercentMoneyHacked(server, player) {
	// Adjust if needed for balancing. This is the divisor for the final calculation
	const balanceFactor = 240;

	const difficultyMult = (100 - server.hackDifficulty) / 100;
	const skillMult = (player.hacking - (server.requiredHackingSkill - 1)) / player.hacking;
	const percentMoneyHacked = (difficultyMult * skillMult * player.hacking_money_mult) / balanceFactor;
	if (percentMoneyHacked < 0) {
		return 0;
	}
	if (percentMoneyHacked > 1) {
		return 1;
	}

	return percentMoneyHacked;
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