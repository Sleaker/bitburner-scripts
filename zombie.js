/**
 * @typedef {import('./types/NetscriptDefinitions').NS} NS
 * @typedef {import('./types/NetscriptDefinitions').Server} Server
 * @typedef {import('./types/NetscriptDefinitions').Player} Player
 */

import { numAvailableExploits } from './exploits.js';
import { formatMoney } from './formatting.js';

/**
 * @class
 * @constructor
 * @public
 */
export class Zombie {
	/**
	 * @param {Server} server
	 * @param {NS} ns
	 * @param {string} parentHostname
	 * @param {number} depth
	 */
	constructor(server, ns, parentHostname = undefined, depth = 0) {
		/**
		 * @type {string}
		 * @public
		 */
		this.hostname = server.hostname;
		/**
		 * @type {number}
		 * @public
		 */
		this.growth = Math.min(server.serverGrowth, 100);
		/**
		 * @type {number}
		 * @public
		 */
		this.memory = server.maxRam;
		/**
		 * @type {number}
		 * @public
		 */
		this.level = server.requiredHackingSkill;
		/**
		 * @type {number}
		 * @public
		 */
		this.ports = server.numOpenPortsRequired;
		/**
		 * @type {number}
		 * @public
		 */
		this.maxMoney = server.moneyMax;
		/**
		 * @type {number}
		 * @public
		 */
		this.security = server.minDifficulty;
		/**
		 * @type {string}
		 * @public
		 */
		this.money = formatMoney(this.maxMoney);
		/**
		 * @type {string}
		 * @public
		 */
		this.faction = server.organizationName;
		/**
		 * @type {string}
		 * @public
		 */
		this.parent = parentHostname;
		/**
		 * @type {number}
		 * @public
		 */
		this.depth = depth;
		/**
		 * @type {boolean}
		 * @public
		 */
		this.setup = false;
		this.updateStats(ns);
	}

	/**
	 * Updates cached computed statistics with latest live information
	 * @param {NS} ns
	 */
	updateStats(ns) {
		const player = ns.getPlayer();
		this.server = ns.getServer(this.hostname);
		this.hackEffect = calculateMaxMoneyHacked(this.server, player);
		this.effect = (this.hackEffect * 100).toFixed(2);
		

		/**
		 * maximum number of threads that should be used to target this server for naive loops
		 * @property
		 * @public
		 */
		this.maxTargetingThreads = (this.hackThreads * 25); // maximum number of threads that can target the server for naive hack loops
		this.hackChance = calculateMaxHackingChance(this.server, player);
		this.chance = (this.hackChance * 100).toFixed(0);
		this.usedMemory = this.server.ramUsed;
		this.availableMemory = this.memory - this.usedMemory;
		this.root = this.server.hasAdminRights;
		this.contracts = ns.ls(this.hostname, ".cct").length;
		this.weakenTime = calculateMinWeakenTime(this.server, player);
		this.availableMoney = this.server.moneyAvailable;
		this.weak = this.weakenTime.toFixed(0);
		this.currentSecurity = this.server.hackDifficulty;
		this.shouldCrack = this.root ? "done" : (this.level <= ns.getHackingLevel() && this.ports <= numAvailableExploits(ns)) ? "true" : "false";
		this.backdoor = this.server.backdoorInstalled;
		this.xps = (calculateXp(this.server, player) / this.weakenTime).toFixed(2);
		return this;
	}

	get hackThreads() {
		if (this.maxMoney === 0) {
			return 0;
		}
		let threads = Math.max(Math.floor(35.82 / (this.hackEffect * 100)), 1); // 35.82% per hack will give 30% final funds after 4 hacks
		return threads === Number.POSITIVE_INFINITY ? 0 : threads;
	}

	/**
	 * (maxMoney ^ 1.25) * hackChance * hackEffect * (growth ^ 1.1)
	 */
	get currentRating() {
		return this.root ? (Math.pow(this.maxMoney, 1.25) * this.hackEffect * Math.pow(Math.min(this.growth, 100), 1.1) / this.weakenTime) / 1e3 : 0;
	}

	get rating() {
		return formatMoney(this.currentRating / 1e3);
	}

	get shouldGrow() {
		return this.availableMoney < this.maxMoney;
	}

	get maxRunningThreads() {
		let maxThreads = Math.floor(this.memory / 1.75);
		return this.hostname === "home" ? Math.floor(maxThreads * .8) : maxThreads;
	}

	isAtMinSecurity() {
		return this.currentSecurity === this.security;
	}

	isAtMaxMoney() {
		return this.maxMoney === this.availableMoney;
	}

	/**
	 * @param {string} scriptName
	 */
	isScriptRunning(ns, scriptName) {
		return ns.scriptRunning(scriptName, this.hostname);
	}

	/**
	 * @param {Zombie} target
	 * @param {string} scriptName
	 */
	getRunningScriptLogs(ns, target, scriptName) {
		let script = ns.getRunningScript(scriptName, this.hostname, target.hostname);
		return script ? script.logs : [];
	}

	/**
	 * @param {string[]} files 
	 */
	async uploadFiles(ns, files) {
		await ns.scp(files, this.hostname);
	}

}

/**
 * @param {Server} server
 * @param {Player} player
 */
function calculateXp(server, player) {
	if (server.baseDifficulty == null) {
		server.baseDifficulty = server.hackDifficulty;
	}
	return 3 + (server.baseDifficulty * player.hacking_exp_mult * .03);
}

/**
 * @param {Server} server
 * @param {Player} player
 */
function calculateMinWeakenTime(server, player) {
	const difficultyMult = server.requiredHackingSkill * server.minDifficulty;

	const baseSkill = 50;
	let skillFactor = 2.5 * difficultyMult + 500;

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
function calculateMaxHackingChance(server, player) {
	const difficultyMult = (100 - server.minDifficulty) / 100;
	const skillMult = 1.75 * player.hacking;
	const skillChance = (skillMult - server.requiredHackingSkill) / skillMult;
	const chance = skillChance * difficultyMult * player.hacking_chance_mult * calculateIntelligenceBonus(player.intelligence, 1);
	return Math.min(Math.max(chance, 0), 1);
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
function calculateMaxMoneyHacked(server, player) {
	const difficultyMult = (100 - server.minDifficulty) / 100;
	const skillMult = (player.hacking - (server.requiredHackingSkill - 1)) / player.hacking;
	const percentMoneyHacked = (difficultyMult * skillMult * player.hacking_money_mult) / 240;
	return Math.min(Math.max(percentMoneyHacked, 0), 1);
}

/**
 * Compares two Zombie objects
 * @param {Zombie} a
 * @param {Zombie} b
 * @param {string} field
 */
export function compareZombie(a, b, field, asc = false) {
	// Swap order if we're sorting in ascending order
	if (asc) {
		[a, b] = [b, a];
	}
	// for formatted fields, use the base field to sort off
	switch (field) {
		case "rating":
			field = "currentRating";
			break;
		case "effect":
			field = "hackEffect";
			break;
		case "weak":
			field = "weakenTime";
			break;
		case "chance":
			field = "hackChance";
			break;
		case "threads":
			field = "maxTargetingThreads";
			break;
		default:
	}
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
