"use client";

import { useState } from "react";
import { Plus, Trash2, Send, DatabaseZap, RefreshCw } from "lucide-react";

type SchemaProperty = {
    name: string;
    datatype: string;
    required: boolean;
};

type PublishSchemaError = {
    error?: string;
};

export function SchemaEditor() {
    const [targetClass, setTargetClass] = useState("");
    const [properties, setProperties] = useState<SchemaProperty[]>([
        { name: "id", datatype: "string", required: true },
    ]);
    const [saving, setSaving] = useState(false);
    const [message, setMessage] = useState<{ text: string; type: "success" | "error" } | null>(null);

    const addProperty = () => {
        setProperties([...properties, { name: "", datatype: "string", required: false }]);
    };

    const removeProperty = (index: number) => {
        setProperties(properties.filter((_, i) => i !== index));
    };

    const updateProperty = <K extends keyof SchemaProperty>(index: number, field: K, value: SchemaProperty[K]) => {
        const newProps = [...properties];
        newProps[index] = { ...newProps[index], [field]: value };
        setProperties(newProps);
    };

    const publishSchema = async () => {
        if (!targetClass.trim()) {
            setMessage({ text: "Object Type Name is required.", type: "error" });
            return;
        }

        setSaving(true);
        setMessage(null);

        const payload = {
            targetClass: targetClass.trim(),
            properties: properties
                .filter((p) => p.name.trim() !== "")
                .map((p) => ({
                    name: p.name.trim(),
                    datatype: p.datatype,
                    minCount: p.required ? 1 : 0,
                })),
        };

        try {
            const res = await fetch("/api/ontology-admin/objects", {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify(payload),
            });

            if (res.ok) {
                setMessage({ text: `Successfully published ${targetClass} to Neo4j.`, type: "success" });
                setTargetClass("");
                setProperties([{ name: "id", datatype: "string", required: true }]);
            } else {
                const data = await res.json() as PublishSchemaError;
                setMessage({ text: data.error || "Failed to publish schema", type: "error" });
            }
        } catch {
            setMessage({ text: "Network error publishing schema", type: "error" });
        } finally {
            setSaving(false);
        }
    };

    return (
        <div className="max-w-4xl mx-auto space-y-8">
            <div>
                <h2 className="text-2xl font-bold tracking-tight flex items-center gap-2">
                    <DatabaseZap className="text-emerald-500 w-6 h-6" /> Define New Object Type
                </h2>
                <p className="text-neutral-500 text-sm mt-1">
                    Generate strict Neo4j SHACL validation constraints without writing Cypher.
                </p>
            </div>

            <div className="bg-neutral-900 border border-neutral-800 rounded-xl p-6 shadow-xl space-y-6">
                <div>
                    <label className="block text-sm font-medium text-neutral-300 mb-2">Object Type Name (TargetClass)</label>
                    <input
                        type="text"
                        className="w-full bg-black border border-neutral-700 rounded-md py-2 px-3 text-white focus:outline-none focus:border-emerald-500 font-mono"
                        placeholder="e.g. MaintenanceCrew"
                        value={targetClass}
                        onChange={(e) => setTargetClass(e.target.value.replace(/[^a-zA-Z0-9_]/g, ""))}
                    />
                </div>

                <div>
                    <div className="flex justify-between items-center mb-4">
                        <label className="text-sm font-medium text-neutral-300">Properties</label>
                        <button
                            onClick={addProperty}
                            className="text-xs bg-neutral-800 hover:bg-neutral-700 px-3 py-1.5 rounded flex items-center gap-1 transition-colors"
                        >
                            <Plus className="w-3 h-3" /> Add Property
                        </button>
                    </div>

                    <div className="space-y-3">
                        {properties.map((prop, index) => (
                            <div key={index} className="flex items-center gap-3 bg-black p-3 rounded-md border border-neutral-800">
                                <input
                                    type="text"
                                    placeholder="Property Name"
                                    value={prop.name}
                                    onChange={(e) => updateProperty(index, "name", e.target.value.replace(/[^a-zA-Z0-9_]/g, ""))}
                                    className="flex-1 bg-transparent border-b border-neutral-700 py-1 text-sm focus:outline-none focus:border-emerald-500 font-mono"
                                />
                                <select
                                    value={prop.datatype}
                                    onChange={(e) => updateProperty(index, "datatype", e.target.value)}
                                    className="bg-neutral-900 border border-neutral-700 rounded py-1 px-2 text-sm text-neutral-300 focus:outline-none focus:border-emerald-500"
                                >
                                    <option value="string">String</option>
                                    <option value="integer">Integer</option>
                                    <option value="float">Float</option>
                                    <option value="boolean">Boolean</option>
                                    <option value="dateTime">DateTime</option>
                                </select>
                                <div className="flex items-center gap-2 w-24">
                                    <input
                                        type="checkbox"
                                        id={`req-${index}`}
                                        checked={prop.required}
                                        onChange={(e) => updateProperty(index, "required", e.target.checked)}
                                        className="accent-emerald-500"
                                    />
                                    <label htmlFor={`req-${index}`} className="text-xs text-neutral-400 select-none">Required</label>
                                </div>
                                <button
                                    onClick={() => removeProperty(index)}
                                    className="text-neutral-500 hover:text-red-400 p-1 transition-colors"
                                    disabled={properties.length === 1}
                                >
                                    <Trash2 className="w-4 h-4" />
                                </button>
                            </div>
                        ))}
                    </div>
                </div>

                <div className="pt-4 flex items-center justify-between border-t border-neutral-800">
                    <div className="flex-1">
                        {message && (
                            <p className={`text-sm ${message.type === "success" ? "text-emerald-400" : "text-red-400"}`}>
                                {message.text}
                            </p>
                        )}
                    </div>
                    <button
                        onClick={publishSchema}
                        disabled={saving || !targetClass}
                        className="bg-emerald-600 hover:bg-emerald-500 disabled:opacity-50 disabled:cursor-not-allowed text-white px-6 py-2 rounded-md font-semibold flex items-center gap-2 shadow-lg transition-all"
                    >
                        {saving ? <RefreshCw className="w-4 h-4 animate-spin" /> : <Send className="w-4 h-4" />}
                        Publish to Object Layer
                    </button>
                </div>
            </div>
        </div>
    );
}
