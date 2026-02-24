import { AbstractInteger } from '@zkpersona/noir-helpers';

/**
 * U128 type for Noir 1.0 circuits.
 * Represents an unsigned 128-bit integer.
 */
export class U128 extends AbstractInteger {
  static MAX_VALUE = 340282366920938463463374607431768211455n; // 2^128 - 1
  static MIN_VALUE = 0n;
}

/**
 * Converts a bigint to a u128 value for Noir 1.0 circuits.
 *
 * @param value - The bigint value to convert
 * @returns A U128 instance
 */
export const toU128 = (value: bigint): U128 => {
  return new U128(value);
};
