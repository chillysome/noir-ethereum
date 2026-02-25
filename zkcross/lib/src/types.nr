/// Core types for zkCross protocol

use ethereum::types::address::Address;
use ethereum::account::Account;

/// Blacklist for auditing (simplified - 16 addresses)
pub struct Blacklist {
    pub addresses: [Address; 16],
    pub count: u8,
}

/// Transaction for verification
pub struct Transaction {
    pub from: Address,
    pub to: Address,
    pub value: Field,
    pub nonce: u64,
}

/// Simplified state containing 16 accounts
pub struct State {
    accounts: [Account; 16],
}
