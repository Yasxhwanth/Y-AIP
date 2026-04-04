"use client";

import { gql } from '@apollo/client/core';
import { useQuery, useMutation } from '@apollo/client/react';
import { ShieldCheck, XCircle, AlertTriangle } from 'lucide-react';

const GET_PROPOSALS = gql`
  query GetPendingProposals {
    proposals(where: { status: "PENDING" }) {
      proposal_id
      justification
      timestamp
      proposed_entities
    }
  }
`;

const APPROVE_PROPOSAL = gql`
  mutation Approve($id: ID!) {
    approveProposal(proposal_id: $id) {
      status
    }
  }
`;

const REJECT_PROPOSAL = gql`
  mutation Reject($id: ID!) {
    rejectProposal(proposal_id: $id) {
      status
    }
  }
`;

type Proposal = {
    proposal_id: string;
    justification: string;
    timestamp: string;
    proposed_entities: unknown;
};

type ProposalsQueryData = {
    proposals: Proposal[];
};

export function ProposalsInbox() {
    const { data, loading, refetch } = useQuery<ProposalsQueryData>(GET_PROPOSALS, {
        pollInterval: 3000,
    });

    const [approve] = useMutation(APPROVE_PROPOSAL, {
        onCompleted: () => refetch(),
    });

    const [reject] = useMutation(REJECT_PROPOSAL, {
        onCompleted: () => refetch(),
    });

    if (loading && !data) return null;

    const proposals = data?.proposals ?? [];

    return (
        <div className="space-y-4">
            <div className="flex items-center justify-between">
                <h2 className="text-xl font-semibold tracking-tight text-white flex items-center gap-2">
                    {proposals.length > 0 ? (
                        <AlertTriangle className="w-5 h-5 text-amber-500" />
                    ) : (
                        <ShieldCheck className="w-5 h-5 text-neutral-500" />
                    )}
                    Action Proposals
                </h2>
                {proposals.length > 0 && (
                    <span className="px-2 py-0.5 rounded-full bg-amber-500/20 text-amber-400 text-xs font-medium border border-amber-500/20">
                        {proposals.length} Pending
                    </span>
                )}
            </div>

            {proposals.length === 0 ? (
                <div className="p-8 border border-neutral-800 border-dashed rounded-lg text-center text-neutral-500">
                    No pending actions requiring operator approval.
                </div>
            ) : (
                <div className="space-y-4">
                    {proposals.map((prop) => (
                        <div key={prop.proposal_id} className="bg-neutral-900 border border-neutral-700/50 rounded-lg overflow-hidden">
                            <div className="p-4 border-b border-neutral-800 bg-neutral-900/50">
                                <div className="font-mono text-xs text-neutral-500 mb-2">ID: {prop.proposal_id}</div>
                                <div className="text-neutral-200">
                                    <p>{prop.justification}</p>
                                </div>
                            </div>

                            <div className="bg-neutral-950 p-4">
                                <div className="text-xs font-mono text-neutral-400 whitespace-pre-wrap">
                                    {JSON.stringify(prop.proposed_entities, null, 2)}
                                </div>
                            </div>

                            <div className="p-3 bg-neutral-900/50 flex items-center justify-end gap-3 border-t border-neutral-800">
                                <button
                                    onClick={() => reject({ variables: { id: prop.proposal_id } })}
                                    className="flex items-center gap-2 px-4 py-2 rounded text-sm font-medium text-neutral-400 hover:text-red-400 hover:bg-neutral-800 transition-colors"
                                >
                                    <XCircle className="w-4 h-4" /> Reject
                                </button>
                                <button
                                    onClick={() => approve({ variables: { id: prop.proposal_id } })}
                                    className="flex items-center gap-2 px-5 py-2 rounded text-sm font-medium text-black bg-white hover:bg-neutral-200 transition-colors shadow-sm"
                                >
                                    <ShieldCheck className="w-4 h-4" /> Approve Action
                                </button>
                            </div>
                        </div>
                    ))}
                </div>
            )}
        </div>
    );
}
