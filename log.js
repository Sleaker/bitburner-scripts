/**
 * @type {NS}
 */
var loggingContext;
var logDebugMode;

/**
 * @param {NS} ns
 */
export function initialize(ns, debug = false) {
	loggingContext = ns;
	logDebugMode = debug;
}

/** 
 * @param {string} format
 * @param {any[]} values
 **/
export function error(format, values) {
	loggingContext.tprintf("ERROR  | " + format, values);
}

/** 
 * @param {string} format
 * @param {any[]} values
 **/
export function fail(format, values) {
	loggingContext.tprintf("FAIL   | " + format, values);
}

/** 
 * @param {string} format
 * @param {any[]} values
 **/
export function info(format, values) {
	loggingContext.tprintf("INFO   | " + format, values);
}

/** 
 * @param {string} format
 * @param {any} values
 **/
export function warn(format, values) {
	loggingContext.tprintf("WARNING| " + format, values);
}

/** 
 * @param {string} format
 * @param {any[]} values
 **/
export function success(format, values) {
	loggingContext.tprintf("SUCCESS| " + format, values);
}

export function debug(format, values) {
	if (logDebugMode) {
		loggingContext.tprintf("DEBUG| " + format, values);
	}
}