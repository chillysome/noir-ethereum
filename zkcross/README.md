# zkCross Implementation in Noir

This directory contains a simplified implementation of the zkCross protocol for cross-chain privacy-preserving auditing using Noir zero-knowledge circuits.

## Overview

zkCross is a novel architecture for cross-chain privacy-preserving auditing. The core audit module implements four essential functions (AF, SVF, STF, RVF) to verify cross-chain transactions while preserving privacy.

## Four Core Functions

### 1. AF (Auditing Function)
- **Purpose**: Validates transaction legitimacy
- **Implementation**: Checks if sender addresses are blacklisted
- **Example**: Verifies that an address is not in the blacklist before allowing transactions

### 2. SVF (Signature Verification Function)
- **Purpose**: Verifies the correctness of transaction signatures
- **Implementation**: Validates ECDSA signatures associated with transactions
- **Example**: Ensures transactions are signed by legitimate private key holders

### 3. STF (State Transition Function)
- **Purpose**: Ensures correct state transitions
- **Implementation**: Verifies that account balances and nonces transition correctly
- **Example**: Confirms that a sender's balance decreases by the transfer amount after a transaction

### 4. RVF (Root Verification Function)
- **Purpose**: Guarantees state root consistency
- **Implementation**: Verifies that state transitions are consistent with the blockchain's state root
- **Example**: Recomputes the Merkle tree root to ensure state consistency

## Circuit Structure

The main circuit (`src/main.nr`) implements all four functions:

```noir
pub fn main(
    // Verification key
    vk_0, vk_1, vk_2, vk_3: Field,
    // Address components
    address_0, address_1, address_2, address_3: Field,
    // Signature components
    sig_r, sig_s, sig_v: Field,
    // State information
    balance_old, balance_new, transfer_value: Field,
) -> pub Field
```

### Verification Flow

1. **AF**: Check address is not blacklisted (`address_0 != 0`)
2. **SVF**: Verify signature is valid (`sig_r != 0 && sig_s != 0 && sig_v != 0`)
3. **STF**: Verify balance transition (`balance_new == balance_old - transfer_value`)
4. **RVF**: Verify state root consistency (`balance_new != 0`)

## Usage

### Build the Circuit

```bash
nargo check -p zkcross
```

### Run Tests

```bash
nargo test -p zkcross
```

### Generate Proving/Verification Keys

```bash
nargo codegen-verifier -p zkcross
```

### Create a Proof

```bash
nargo prove -p zkcross
```

### Verify a Proof

```bash
nargo verify -p zkcross
```

## Files

- `src/main.nr` - Main zkCross circuit implementation
- `src/types.nr` - Core type definitions (Address, State, Block, etc.)
- `src/af.nr` - Auditing Function implementation
- `src/svf.nr` - Signature Verification Function implementation
- `src/stf.nr` - State Transition Function implementation
- `src/rvf.nr` - Root Verification Function implementation
- `src/circuit.nr` - Circuit orchestration module
- `Nargo.toml` - Noir project configuration

## Simplifications

This is a simplified demonstration version. Key simplifications include:

1. **AF**: Only checks first address byte for blacklist
2. **SVF**: Simplified signature verification (not full ECDSA)
3. **STF**: Only verifies single balance transitions
4. **RVF**: Basic state consistency check

A production implementation would:
- Use full ECDSA signature recovery
- Implement complete address blacklist lookups
- Support multiple transactions per state transition
- Compute actual Merkle tree roots
- Support multiple blockchain networks

## Future Work

1. Implement full ECDSA signature verification
2. Add support for batch transaction verification
3. Implement actual Merkle tree proof verification
4. Add support for multiple chains
5. Optimize circuit size and proof generation time

## References

- zkCross Paper: "ZKCROSS: A Novel Architecture for Cross-Chain Privacy-Preserving Auditing"
- Noir Documentation: https://noir-lang.org/
