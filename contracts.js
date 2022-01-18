/**
 * WARNING THIS FILE HAS SPOILERS FOR HOW TO SOLVE CONTRACTS
 * IF YOU WANT TO SOLVE THESE YOURSELF CLOSE THIS NOW!
 */

/**
 * @typedef {import('./types/NetscriptDefinitions').NS} NS
 * @typedef {import('./types/NetscriptDefinitions').Server} Server
 */

import { findServers } from './util';

/** @param {NS} ns **/
export async function main(ns) {
    ns.disableLog("ALL");
    while (true) {
        let contracts = findServers({ns: ns, depth: -1})
            .filter(server => hasContracts(ns, server.server))
            .flatMap(server => getContracts(ns, server.server));

        for (const contract of contracts) {
            switch (contract.type) {
                case "Total Ways to Sum":
                    contract.solution = partition(contract.data);
                    break;
                case "Unique Paths in a Grid I":
                case "Unique Paths in a Grid II":
                    contract.solution = uniquePaths(contract.data);
                    break;
                case "Spiralize Matrix":
                    contract.solution = spiralFlatten(contract.data);
                    break;
                case "Find Largest Prime Factor":
                    contract.solution = findLargestPrimeFactor(contract.data);
                    break;
                case "Subarray with Maximum Sum":
                    contract.solution = findMaxSubArraySum(contract.data);
                    break
                case "Merge Overlapping Intervals":
                    contract.solution = reduceIntervals(contract.data);
                    break;
                case "Minimum Path Sum in a Triangle":
                    contract.solution = minimumSumTriangle(contract.data);
                    break;
                case "Generate IP Addresses":
                    contract.solution = findValidIps(contract.data);
                    break;
                case "Algorithmic Stock Trader I":
                    contract.solution = stockSolver(1, contract.data);
                    break;
                case "Algorithmic Stock Trader II":
                    contract.solution = stockSolver(Math.floor(contract.data.length / 2), contract.data);
                    break;
                case "Algorithmic Stock Trader III":
                    contract.solution = stockSolver(2, contract.data);
                    break;
                case "Algorithmic Stock Trader IV":
                    contract.solution = stockSolver(contract.data[0], contract.data[1]);
                    break;
                case "Sanitize Parentheses in Expression":
                    contract.solution = sanitizeParentheses(contract.data);
                    break;
                case "Find All Valid Math Expressions":
                    contract.solution = findValidMathExpressions(contract.data[0], contract.data[1]);
                    break;
                default:
            }
            if (typeof(contract.solution) !== 'undefined') {
                contract.result = ns.codingcontract.attempt(contract.solution, contract.filename, contract.hostname, { returnReward: true});
                ns.print("Solved " + contract.filename + "  Result: " + contract.result);
            }
            else {
                ns.print("No solution available for contract: " + contract.type + " | " + contract.hostname + "/" + contract.filename);
            }
        }
        await ns.sleep(30000);
    }
}

/**
 * @param {NS} ns 
 * @param {Server} server 
 */
function hasContracts(ns, server) {
    // ns.tprintf("%j", server);
    return ns.ls(server.hostname, ".cct").length > 0;
}

/**
 * @param {NS} ns 
 * @param {Server} server 
 */
function getContracts(ns, server) {
    return ns.ls(server.hostname, ".cct")
        .map(filename => { 
            return {
                hostname: server.hostname,
                filename: filename,
                type: ns.codingcontract.getContractType(filename, server.hostname),
                data: ns.codingcontract.getData(filename, server.hostname),
                desc: ns.codingcontract.getDescription(filename, server.hostname)
            };
    });
}

function stockSolver(txns, prices) {
    let len = prices.length
    if (len < 2) {
        return 0
    }
    if (txns > len / 2) {
        var res = 0
        for (var i = 1; i < len; ++i) {
            res += Math.max(prices[i] - prices[i - 1], 0)
        }
        return res
    }
    var hold = []
    var rele = []
    hold.length = txns + 1
    rele.length = txns + 1
    for (var i = 0; i <= txns; ++i) {
        hold[i] = Number.MIN_SAFE_INTEGER
        rele[i] = 0
    }
    var cur
    for (var i = 0; i < len; ++i) {
        cur = prices[i]
        for (var j = txns; j > 0; --j) {
            rele[j] = Math.max(rele[j], hold[j] + cur)
            hold[j] = Math.max(hold[j], rele[j - 1] - cur)
        }
    }
    return rele[txns]
}

/**
 * Given a list of intervals. merges all overlapping intervals and return the merged list.
 * @param {number[][]} intervals 
 */
function reduceIntervals(intervals) {
    let final = [];
    let sorted = intervals.sort((a, b) => a[0] - b[0]);
    // push the first item to the top of the stack
    final.unshift(sorted.shift());
    while (sorted.length > 0) {
        let int = sorted.shift();

        // If the current interval starts within the top of the stack, try to merge
        if (int[0] >= final[0][0] && int[0] <= final[0][1]) {
            // merge
            if (int[1] > final[0][1]) {
                final[0][1] = int[1];
            }
            // if it's not greater than the current then this interval is already contained.
        } else {
            // otherwise push this to the stack
            final.unshift(int);
        }
    }
    return final.reverse();
}

/**
 * Finds a contiguous subarray with maximum sum of elements and returns the sum.
 * @param {number[]} nums 
 */
function findMaxSubArraySum(nums) {
    let end = 0;
    let currMax = nums[0];
    let max = nums[0];
    // iterate over all elements to find the maximum value to stop at
    for (let i = 1; i < nums.length; ++i) {
        // if the current element is greater than all previous elements combined then just start here.
        currMax = Math.max(nums[i], nums[i] + currMax);
        if (currMax > max) {
            max = currMax;
            end = i;
        }
    }
    let start = end;
    // walk back from the end index to fix the start
    while (start >= 0) {
        max -= nums[start];
        if (max == 0) {
            break;
        }
        start--;
    }
    return nums.slice(start, end + 1).reduce((tot, num) => tot + num, 0);
}

/**
 * Finds the largest prime factor of the given number
 * @param {number} num 
 * @returns 
 */
function findLargestPrimeFactor(num) {
    let maxPrime = -1;
    // remove all factors of 2
    while(num % 2 === 0) {
        num /= 2;
        maxPrime = 2;
    }
    // factorize for all odd numbers
    for (let i = 3; i <= Math.sqrt(num); i += 2) {
        while (num % i === 0) {
            maxPrime = i;
            num /= i;
        }
    }
    return num > 2 ? num : maxPrime;
}

/**
 * Flattens a 2d array by evaluating the entries in 'spiral' order
 * @param {NS} ns 
 * @param {number[][]} grid 
 */
export function spiralFlatten(grid) {
    let answer = [];

    let dir = "right";
    let totalElements = grid[0].length * grid.length;
    while (answer.length < totalElements) {
        switch (dir) {
            case "left":
                const last = grid.length - 1;
                while (grid[last].length > 0) {
                    answer.push(grid[last].pop());
                }
                grid.pop();
                break;
            case "up":
                for (let i = grid.length - 1; i >= 0; i--) {
                    answer.push(grid[i].shift());
                }
                break;
            case "down":
                for (let i = 0; i < grid.length; i++) {
                    answer.push(grid[i].pop());
                }
                break;
            case "right":
            default:
                while (grid[0].length > 0) {
                    answer.push(grid[0].shift());
                }
                grid.shift();
        }

        switch (dir) {
            case "down":
                dir = "left";
                break;
            case "left":
                dir = "up";
                break;
            case "up":
                dir = "right";
                break;
            case "right":      
            default:
                dir = "down";
                break;
        }
    }
    return answer;
}

/**
 * Counts the number of ways to partition the given number by whole integers
 * @param {NS} ns 
 * @param {number} num 
 */
export function partition(num) {
    let ways = [1];
    for (let i = 1; i <= num; i++) {
        ways.push(0);
    }

    for (let i = 1; i < num; i++) {
        for (let j = i; j <= num ; j++) {
            ways[j] += ways[j - i];
        }
    }
    return ways[num];
}

/**
 * Finds the minimum sum to traverse to a bottom element by walking the tree from bottom to top
 * 
 * @param {number[][]} triangle - 2d array of numbers in 'triangle' form ex: [[1], [2,3], [4,5,6], [7,8,9,0]]
 */
export function minimumSumTriangle(triangle) {
    let cache = [];
    let h = triangle.length - 1;
    // cache the bottom row
    for (let i = 0; i < triangle[h].length; i++) {
        cache.push(triangle[h][i]);
    }
    // loop over each row starting from the 2nd from the bottom one
    for (let i = h - 1; i >= 0; i--) {
        // for each number in this row
        for (let j = 0; j < triangle[i].length; j++) {
            // update the cache at j to be the current value in the tree plus the minimum of the neighbor cache values
            cache[j] = triangle[i][j] + Math.min(cache[j], cache[j + 1]);
        }
    }
    return cache[0];
}

/**
 * Finds the number of unique paths of an unobstructed grid of the given size, or given an obstructed grid.
 * @param {number[]|number[][]} data
 * @param {NS} ns
 */
export function uniquePaths(data, ns) {
    let grid = [];
    if (data.length == 2 && typeof(data[0]) === 'number') {
        // if this is a 1d array then the inputs are the size of an unobstructed grid
        grid = generateEmptyGrid(data[0], data[1]);
    } else {
        grid = data;
    }

    return uniquePathsFromGrid(grid);
}

function generateEmptyGrid(sizeX, sizeY) {
    let grid = [];
    for (let i = 0; i < sizeY; i ++) {
        grid.push([]);
        for (let j = 0; j < sizeX; ++j) {
            grid[i].push(0);
        } 
    }
    return grid;
}

/**
 * Accepts a grid initialized with 0s and 1s. a '1' in a cell denotes an obstacle
 * @param {number[]} grid 
 */
function uniquePathsFromGrid(grid) {
    for (let i = 0; i < grid.length; i++) {
        for (let j = 0; j < grid[0].length; j++) {
            // if there's an obstacle in this cell mark it as non-traversible
            if (grid[i][j] === 1) {
                grid[i][j] = 0;
                continue;
            }
            // for the first cell default to 1 
            if (j === 0 && i === 0) {
                grid[i][j] = 1;
            }
            // for all other edge cells default to previous edge cell value
            else if (j === 0) {
                grid[i][j] = grid[i - 1][j];
            } else if (i === 0) {
                grid[i][j] = grid[i][j - 1];
            } 
            // for all other cells add neighbor cell values
            else {    
                grid[i][j] = grid[i - 1][j] + grid[i][j - 1];
            }
        }
    }
    return grid[grid.length -1][grid[0].length - 1];
}

/**
 * 
 * @param {string} str 
 * @returns 
 */
export function sanitizeParentheses(str) {
    let left = 0;
    let right = 0;
    let answer = [];
    for (let i = 0; i < str.length; ++i) {
        if (str[i] === '(') {
            ++left;
        } else if (str[i] === ')') {
            left > 0 ? --left : ++right;
        }
    }
    dfs(0, 0, left, right, str, '', answer);

    return answer;
}

/**
 * 
 * @param {number} pair 
 * @param {number} index 
 * @param {number} left 
 * @param {number} right 
 * @param {string} s 
 * @param {string} solution 
 * @param {string[]} answers 
 */
function dfs(pair, index, left, right, s, solution, answers) {
    if (s.length === index) {
        if (left === 0 && right === 0 && pair === 0) {
            for (let i = 0; i < answers.length; i++) {
                if (answers[i] === solution) {
                    return;
                }
            }
            answers.push(solution);
        }
        return;
    }
    if (s[index] === '(') {
        if (left > 0) {
            dfs(pair, index + 1, left - 1, right, s, solution, answers);
        }
        dfs(pair + 1, index + 1, left, right, s, solution + s[index], answers);
    } else if (s[index] === ')') {
        if (right > 0) dfs(pair, index + 1, left, right - 1, s, solution, answers);
        if (pair > 0) dfs(pair - 1, index + 1, left, right, s, solution + s[index], answers);
    } else {
        dfs(pair, index + 1, left, right, s, solution + s[index], answers);
    }
}

export function findValidIps(str) {
    let answer = [];
    for (let a = 1; a <= 3; ++a) {
        for (let b = 1; b <= 3; ++b) {
            for (let c = 1; c <= 3; ++c) {
                for (let d = 1; d <= 3; ++d) {
                    if (a + b + c + d === str.length) {
                        const A = parseInt(str.substring(0, a), 10);
                        const B = parseInt(str.substring(a, a + b), 10);
                        const C = parseInt(str.substring(a + b, a + b + c), 10);
                        const D = parseInt(str.substring(a + b + c, a + b + c + d), 10);
                        if (A < 256 && B < 256 && C < 256 && D < 256) {
                            const ip = A.toString() + "." + B.toString() + "." + C.toString() + "." + D.toString();
                            if (ip.length !== str.length + 3) continue;
                            answer.push(ip);
                        }
                    }
                }
            }
        }
    }
    return answer;
}

/**
 * For a given list of numbers attempts to permutate the list using +, - and * operations for each number
 * to get to the target value. Once all operation chains are found, returns the list.
 * @param {number[]} nums - the array of numbers to perform calculations with
 * @param {number} target - the result we are attempting to get
 * @returns 
 */
export function findValidMathExpressions(nums, target) {
    if (nums == null || nums.length === 0) {
        return [];
    }
    let answer = [];
    mathHelper(answer, '', nums, target, 0, 0, 0);
    return answer;
}

function mathHelper(answer, path, num, target, pos, evaluated, multed) {
    if (pos === num.length) {
        if (target === evaluated) {
            answer.push(path);
        }
        return;
    }
    for (let i = pos; i < num.length; ++i) {
        if (i != pos && num[pos] == '0') {
            break;
        }
        let cur = parseInt(num.substring(pos, i + 1));
        if (pos === 0) {
            mathHelper(answer, path + cur, num, target, i + 1, cur, cur);
        } else {
            mathHelper(answer, path + '+' + cur, num, target, i + 1, evaluated + cur, cur);
            mathHelper(answer, path + '-' + cur, num, target, i + 1, evaluated - cur, -cur);
            mathHelper(answer, path + '*' + cur, num, target, i + 1, evaluated - multed + multed * cur, multed * cur);
        }
    }
}
