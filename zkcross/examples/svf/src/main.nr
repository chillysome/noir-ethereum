use zkcross::svf::verify_signature;
use zkcross::types::Transaction;

fn main(
    public_key_x: [u8; 32],
    public_key_y: [u8; 32],
    signature: [u8; 64],
    message_hash: [u8; 32],
    tx: Transaction,
) -> pub bool {
    verify_signature(tx, public_key_x, public_key_y, signature, message_hash)
}
