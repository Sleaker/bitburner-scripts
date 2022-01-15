/**
 * @type {import('./types/NetscriptDefinitions').NS}
 */

/**
 * @class
 */
export class Logger {

	constructor(ns, debug = false) {
		this.ns = ns;
		this.debugEnabled = debug;
	}

	/** 
	 * @param {string} format
	 * @param {any[]} values
	 **/
	error(format, values) {
		this.ns.tprintf("ERROR  | " + format, values);
	}

	/** 
	 * @param {string} format
	 * @param {any[]} values
	 **/
	fail(format, values) {
		this.ns.tprintf("FAIL   | " + format, values);
	}

	/** 
	 * @param {string} format
	 * @param {any[]} values
	 **/
	info(format, values) {
		this.ns.tprintf("INFO   | " + format, values);
	}

	/** 
	 * @param {string} format
	 * @param {any[]} values
	 **/
	warn(format, values) {
		this.ns.tprintf("WARNING| " + format, values);
	}

	/** 
	 * @param {string} format
	 * @param {any[]} values
	 **/
	success(format, values) {
		this.ns.tprintf("SUCCESS| " + format, values);
	}

	/**
	 * 
	 * @param {string} format 
	 * @param {any[]} values 
	 */
	debug(format, values) {
		if (this.debugEnabled) {
			this.ns.tprintf("DEBUG| " + format, values);
		}
	}
}
