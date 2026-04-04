"use client";

import { useEffect, useState } from "react";
import ReactFlow, { Background, Controls, Node, Edge, MarkerType } from "reactflow";
import "reactflow/dist/style.css";

type NodeShape = {
    object_type: string;
    properties: { path: string; datatype?: string; minCount?: number }[];
};

export function GraphView() {
    const [nodes, setNodes] = useState<Node[]>([]);
    const [edges, setEdges] = useState<Edge[]>([]);

    const fetchSchemaAndBuildGraph = async () => {
        try {
            const res = await fetch("/api/ontology-admin/schema");
            if (res.ok) {
                const data = await res.json();
                const shapes: NodeShape[] = data.shapes || [];

                // Build React Flow Nodes
                const flowNodes: Node[] = shapes.map((shape, i) => ({
                    id: shape.object_type,
                    data: {
                        label: (
                            <div className="text-left font-mono">
                                <div className="font-bold border-b border-neutral-700 pb-1 mb-1 text-emerald-400">
                                    {shape.object_type}
                                </div>
                                {shape.properties.slice(0, 4).map(p => (
                                    <div key={p.path} className="text-[10px] text-neutral-400">
                                        {p.path}: <span className="text-neutral-500">{p.datatype?.split('#')[1] || 'str'}</span>
                                    </div>
                                ))}
                                {shape.properties.length > 4 && (
                                    <div className="text-[10px] text-neutral-600 italic">+{shape.properties.length - 4} more</div>
                                )}
                            </div>
                        )
                    },
                    position: { x: 100 + (i % 3) * 250, y: 100 + Math.floor(i / 3) * 150 },
                    style: {
                        background: '#0a0a0a',
                        border: '1px solid #262626',
                        borderRadius: '8px',
                        padding: '10px',
                        color: '#fff',
                        minWidth: '150px'
                    }
                }));

                // Mock Edges since we don't have EdgeShapes API yet
                const flowEdges: Edge[] = [];
                if (shapes.find(s => s.object_type === 'Mission') && shapes.find(s => s.object_type === 'DroneUnit')) {
                    flowEdges.push({
                        id: 'e-mission-drone',
                        source: 'Mission',
                        target: 'DroneUnit',
                        label: 'ASSIGNED_TO',
                        animated: true,
                        style: { stroke: '#10b981' },
                        markerEnd: { type: MarkerType.ArrowClosed, color: '#10b981' }
                    });
                }

                setNodes(flowNodes);
                setEdges(flowEdges);
            }
        } catch (err) {
            console.error(err);
        }
    };

    useEffect(() => {
        fetchSchemaAndBuildGraph();
        // Poll every 5 seconds to automatically show updates from SchemaEditor published
        const interval = setInterval(fetchSchemaAndBuildGraph, 5000);
        return () => clearInterval(interval);
    }, []);

    return (
        <div style={{ width: '100%', height: '100%' }}>
            <ReactFlow nodes={nodes} edges={edges} fitView>
                <Background color="#262626" gap={20} />
                <Controls style={{ backgroundColor: '#171717', color: '#fff', fill: '#fff' }} />
            </ReactFlow>
        </div>
    );
}
