#![no_std]

use soroban_sdk::{
    contract, contractimpl, contracttype, symbol_short, token, Address, Env, String, Vec,
};

const VOTE_THRESHOLD: u32 = 2;

#[derive(Clone)]
#[contracttype]
pub enum DataKey {
    Admin,
    NativeToken,
    Members,
    ProposalCount,
    Proposal(u32),
    Contribution(Address),
    Vote(u32, Address),
}

#[derive(Clone)]
#[contracttype]
pub struct Proposal {
    pub id: u32,
    pub proposer: Address,
    pub recipient: Address,
    pub amount_stroops: i128,
    pub title: String,
    pub details: String,
    pub votes: u32,
    pub approved: bool,
    pub executed: bool,
}

#[contract]
pub struct PasadaFund;

fn read_admin(env: &Env) -> Address {
    env.storage()
        .instance()
        .get(&DataKey::Admin)
        .expect("contract not initialized")
}

fn read_native_token(env: &Env) -> Address {
    env.storage()
        .instance()
        .get(&DataKey::NativeToken)
        .expect("native token not configured")
}

fn read_members(env: &Env) -> Vec<Address> {
    env.storage()
        .instance()
        .get(&DataKey::Members)
        .unwrap_or_else(|| Vec::new(env))
}

fn is_member(env: &Env, address: &Address) -> bool {
    let members = read_members(env);
    let mut i = 0;
    while i < members.len() {
        if let Some(member) = members.get(i) {
            if &member == address {
                return true;
            }
        }
        i += 1;
    }
    false
}

fn add_member_if_needed(env: &Env, address: &Address) {
    if is_member(env, address) {
        return;
    }

    let mut members = read_members(env);
    members.push_back(address.clone());
    env.storage().instance().set(&DataKey::Members, &members);
}

fn assert_member(env: &Env, address: &Address) {
    if !is_member(env, address) {
        panic!("member required")
    }
}

fn write_proposal(env: &Env, proposal: &Proposal) {
    env.storage()
        .persistent()
        .set(&DataKey::Proposal(proposal.id), proposal);
}

fn read_proposal(env: &Env, proposal_id: u32) -> Proposal {
    env.storage()
        .persistent()
        .get(&DataKey::Proposal(proposal_id))
        .expect("proposal not found")
}

#[contractimpl]
impl PasadaFund {
    pub fn init(env: Env, admin: Address, native_token: Address) {
        if env.storage().instance().has(&DataKey::Admin) {
            panic!("already initialized")
        }
        admin.require_auth();

        env.storage().instance().set(&DataKey::Admin, &admin);
        env.storage().instance().set(&DataKey::NativeToken, &native_token);
        env.storage().instance().set(&DataKey::ProposalCount, &0u32);
        env.storage()
            .instance()
            .set(&DataKey::Members, &Vec::<Address>::new(&env));
    }

    pub fn contribute(env: Env, from: Address, amount_stroops: i128) {
        if amount_stroops <= 0 {
            panic!("amount must be positive")
        }

        from.require_auth();

        let token = token::Client::new(&env, &read_native_token(&env));
        token.transfer(&from, &env.current_contract_address(), &amount_stroops);

        let key = DataKey::Contribution(from.clone());
        let prior: i128 = env.storage().persistent().get(&key).unwrap_or(0);
        env.storage().persistent().set(&key, &(prior + amount_stroops));

        add_member_if_needed(&env, &from);
        env.events()
            .publish((symbol_short!("contrib"), from), amount_stroops);
    }

    pub fn submit_request(
        env: Env,
        proposer: Address,
        recipient: Address,
        amount_stroops: i128,
        title: String,
        details: String,
    ) -> u32 {
        if amount_stroops <= 0 {
            panic!("amount must be positive")
        }

        proposer.require_auth();

        let mut proposal_count: u32 = env
            .storage()
            .instance()
            .get(&DataKey::ProposalCount)
            .unwrap_or(0);
        proposal_count += 1;

        let proposal = Proposal {
            id: proposal_count,
            proposer,
            recipient,
            amount_stroops,
            title,
            details,
            votes: 0,
            approved: false,
            executed: false,
        };

        write_proposal(&env, &proposal);
        env.storage()
            .instance()
            .set(&DataKey::ProposalCount, &proposal_count);
        env.events().publish(
            (symbol_short!("request"), proposal_count),
            (proposal.recipient.clone(), proposal.amount_stroops),
        );

        proposal_count
    }

    pub fn vote(env: Env, voter: Address, proposal_id: u32) {
        voter.require_auth();
        assert_member(&env, &voter);

        let vote_key = DataKey::Vote(proposal_id, voter.clone());
        if env.storage().persistent().has(&vote_key) {
            panic!("already voted")
        }

        let mut proposal = read_proposal(&env, proposal_id);
        if proposal.executed {
            panic!("proposal already executed")
        }

        proposal.votes += 1;
        if proposal.votes >= VOTE_THRESHOLD {
            proposal.approved = true;
        }

        env.storage().persistent().set(&vote_key, &true);
        write_proposal(&env, &proposal);
        env.events().publish(
            (symbol_short!("vote"), proposal_id),
            (voter, proposal.votes, proposal.approved),
        );
    }

    pub fn execute(env: Env, caller: Address, proposal_id: u32) {
        caller.require_auth();

        if caller != read_admin(&env) && !is_member(&env, &caller) {
            panic!("not authorized")
        }

        let mut proposal = read_proposal(&env, proposal_id);
        if !proposal.approved {
            panic!("proposal not approved")
        }
        if proposal.executed {
            panic!("proposal already executed")
        }

        let token = token::Client::new(&env, &read_native_token(&env));
        token.transfer(
            &env.current_contract_address(),
            &proposal.recipient,
            &proposal.amount_stroops,
        );

        proposal.executed = true;
        write_proposal(&env, &proposal);
        env.events().publish(
            (symbol_short!("execute"), proposal_id),
            (proposal.recipient.clone(), proposal.amount_stroops),
        );
    }

    pub fn get_members(env: Env) -> Vec<Address> {
        read_members(&env)
    }

    pub fn get_member_contribution(env: Env, member: Address) -> i128 {
        env.storage()
            .persistent()
            .get(&DataKey::Contribution(member))
            .unwrap_or(0)
    }

    pub fn get_proposal(env: Env, proposal_id: u32) -> Proposal {
        read_proposal(&env, proposal_id)
    }

    pub fn proposal_count(env: Env) -> u32 {
        env.storage()
            .instance()
            .get(&DataKey::ProposalCount)
            .unwrap_or(0)
    }

    pub fn vote_threshold(_env: Env) -> u32 {
        VOTE_THRESHOLD
    }

    pub fn treasury_balance(env: Env) -> i128 {
        let token = token::Client::new(&env, &read_native_token(&env));
        token.balance(&env.current_contract_address())
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    use soroban_sdk::testutils::Address as _;

    const ONE_XLM: i128 = 10_000_000;

    fn setup() -> (
        Env,
        PasadaFundClient<'static>,
        token::Client<'static>,
        token::StellarAssetClient<'static>,
        Address,
        Address,
        Address,
        Address,
    ) {
        let env = Env::default();
        env.mock_all_auths();

        let admin = Address::generate(&env);
        let contributor = Address::generate(&env);
        let member_two = Address::generate(&env);
        let recipient = Address::generate(&env);

        let native_asset = env.register_stellar_asset_contract_v2(admin.clone());
        let token_id = native_asset.address();
        let token_client = token::Client::new(&env, &token_id);
        let token_admin = token::StellarAssetClient::new(&env, &token_id);

        token_admin.mint(&contributor, &(500 * ONE_XLM));
        token_admin.mint(&member_two, &(500 * ONE_XLM));

        let contract_id = env.register(PasadaFund, ());
        let client = PasadaFundClient::new(&env, &contract_id);

        client.init(&admin, &token_id);

        (
            env,
            client,
            token_client,
            token_admin,
            admin,
            contributor,
            member_two,
            recipient,
        )
    }

    #[test]
    fn contribution_adds_member_and_updates_treasury() {
        let (_env, client, token_client, _token_admin, _admin, contributor, _member_two, _recipient) =
            setup();

        client.contribute(&contributor, &(2 * ONE_XLM));

        let members = client.get_members();
        assert_eq!(members.len(), 1);
        assert_eq!(members.get(0).unwrap(), contributor);
        assert_eq!(client.get_member_contribution(&contributor), 2 * ONE_XLM);
        assert_eq!(client.treasury_balance(), 2 * ONE_XLM);
        assert_eq!(
            token_client.balance(&client.address),
            2 * ONE_XLM
        );
    }

    #[test]
    fn proposal_reaches_threshold_after_two_member_votes() {
        let (env, client, _token_client, _token_admin, _admin, contributor, member_two, recipient) =
            setup();

        client.contribute(&contributor, &ONE_XLM);
        client.contribute(&member_two, &ONE_XLM);

        let title = String::from_str(&env, "Fuel Week 1");
        let details = String::from_str(&env, "Route 3 jeepney diesel support");
        let proposal_id = client.submit_request(&contributor, &recipient, &(3 * ONE_XLM), &title, &details);

        client.vote(&contributor, &proposal_id);
        let after_first_vote = client.get_proposal(&proposal_id);
        assert_eq!(after_first_vote.votes, 1);
        assert_eq!(after_first_vote.approved, false);

        client.vote(&member_two, &proposal_id);
        let after_second_vote = client.get_proposal(&proposal_id);
        assert_eq!(after_second_vote.votes, 2);
        assert_eq!(after_second_vote.approved, true);
        assert_eq!(after_second_vote.executed, false);
    }

    #[test]
    fn execute_transfers_treasury_to_recipient() {
        let (env, client, token_client, _token_admin, admin, contributor, member_two, recipient) = setup();

        client.contribute(&contributor, &(5 * ONE_XLM));
        client.contribute(&member_two, &(2 * ONE_XLM));

        let title = String::from_str(&env, "Emergency Fuel Voucher");
        let details = String::from_str(&env, "Tricycle night shift subsidy");
        let payout = 4 * ONE_XLM;
        let proposal_id = client.submit_request(&contributor, &recipient, &payout, &title, &details);

        client.vote(&contributor, &proposal_id);
        client.vote(&member_two, &proposal_id);

        let pre_recipient = token_client.balance(&recipient);
        let pre_treasury = token_client.balance(&client.address);
        assert_eq!(pre_treasury, 7 * ONE_XLM);

        client.execute(&admin, &proposal_id);

        let post_recipient = token_client.balance(&recipient);
        let post_treasury = token_client.balance(&client.address);
        let proposal = client.get_proposal(&proposal_id);

        assert_eq!(post_recipient - pre_recipient, payout);
        assert_eq!(post_treasury, pre_treasury - payout);
        assert_eq!(proposal.executed, true);
    }
}
