/// Signature Verification Function (SVF)
/// ECDSA secp256k1 signature verification for Ethereum transactions

use crate::types::Transaction;

/// Verify transaction signature using ECDSA secp256k1
/// Parameters:
///   - tx: The transaction to verify
///   - public_key_x: x coordinate of the signer's public key (32 bytes)
///   - public_key_y: y coordinate of the signer's public key (32 bytes)
///   - signature: The ECDSA signature (64 bytes = r[32] + s[32])
///   - message_hash: The hash of the transaction data (32 bytes)
pub fn verify_signature(
    tx: Transaction,
    public_key_x: [u8; 32],
    public_key_y: [u8; 32],
    signature: [u8; 64],
    message_hash: [u8; 32],
) -> bool {
    std::ecdsa_secp256k1::verify_signature(public_key_x, public_key_y, signature, message_hash)
}
