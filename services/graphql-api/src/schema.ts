// Y-AIP GraphQL SDL — Core System Primitives
// Domain types (e.g. DroneUnit, Patient) are dynamically generated via dynamic-schema.ts

export const coreTypeDefs = /* GraphQL */ `
  # ── Scalars ──────────────────────────────────────────────────────
  scalar JSON

  # ── Enums ────────────────────────────────────────────────────────
  enum Classification {
    UNCLASSIFIED
    CUI
    SECRET
    TOP_SECRET
  }

  enum ProposalStatus {
    PENDING
    APPROVED
    REJECTED
    EXPIRED
  }

  # ── Proposal (Ontology Change) ────────────────────────────────────
  type Proposal @node {
    proposal_id:     ID! @id
    status:          ProposalStatus!
    proposed_objects: JSON!
    proposed_links:  JSON!
    proposed_by:     String!
    reviewed_by:     String
    review_note:     String
    created_at:      DateTime! @timestamp(operations: [CREATE])
    expires_at:      DateTime!
  }

  # ── Queries ───────────────────────────────────────────────────────
  type Query {
    # System Proposals
    proposals(status: ProposalStatus): [Proposal!]!

    # GraphRAG — natural language → Cypher (called by agents)
    graphSearch(query: String!, limit: Int): JSON!
  }

  # ── Mutations (all writes go through Temporal — Actions layer) ────
  # Direct mutations are disabled: only the Actions layer (Temporal)
  # can modify ontology objects. This enforces the HITL gate.
  #
  # Exception: Proposals can be created (they are then reviewed by humans)
  type Mutation {
    createProposal(
      proposed_objects: JSON!
      proposed_links:   JSON!
      justification:    String!
    ): Proposal!

    approveProposal(proposal_id: String!, review_note: String): Proposal!
    rejectProposal(proposal_id: String!, review_note: String!): Proposal!
  }

  # ── Subscriptions (real-time UI updates) ─────────────────────────
  type Subscription {
    proposalCreated: Proposal!
  }
`;
