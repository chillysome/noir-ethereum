use ethereum::types::address::Address;
use zkcross::af::audit_address;

fn main(address: Address) -> pub bool {
    audit_address(address)
}
