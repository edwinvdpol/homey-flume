'use strict';

/**
 * Determine if the given value is "blank".
 *
 * @param  value
 * @return boolean
 */
const blank = function blank(value) {
  if (value === null) return true;
  if (value instanceof Error) return false;
  if (Array.isArray(value)) return value.length === 0;
  if (typeof value === 'undefined') return true;
  if (typeof value === 'string') return value.trim() === '';
  if (typeof value === 'boolean' || typeof value === 'number') return false;
  if (typeof value === 'object') return Object.keys(value).length === 0;
  if (typeof value === 'function') return false;

  return false;
};

/**
 * Determine if the given value is "filled".
 *
 * @param  value
 * @return boolean
 */
const filled = function filled(value) {
  return !blank(value);
};

/**
 * Pauze for given delay.
 *
 * @param  {number} delay
 * @return {Promise<void>}
 */
const wait = async function wait(delay = 1000) {
  await new Promise((resolve) => setTimeout(resolve, delay));
};

module.exports.blank = blank;
module.exports.filled = filled;
module.exports.wait = wait;
