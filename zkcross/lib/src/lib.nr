// Re-export ethereum types for convenience
pub use ethereum::account::Account;
pub use ethereum::account::types::AccountProof;
pub use ethereum::types::hash::Hash;

pub mod af;
pub mod stf;
pub mod svf;
pub mod rvf;
pub mod types;
pub mod stf_paper;

// Re-export AF functions
pub use af::{audit_address, audit_addresses, is_blacklisted};

// Re-export SVF functions
pub use svf::verify_signature;

// Re-export RVF functions
pub use rvf::verify_single_account;

// Re-export STF paper implementation
pub use stf_paper::{
    apply_transaction, State, verify_state_transition, verify_state_transition_with_gas,
};
