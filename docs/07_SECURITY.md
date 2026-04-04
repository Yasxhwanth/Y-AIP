# Y-AIP — Layer 6: Security
### Confidential Computing, TEEs, Air-Gap, mTLS Service Mesh & PII Protection

---

## Overview

Security in Y-AIP is **hardware-rooted**. It is not enough to encrypt data at rest and in transit — to win Defense and Medical contracts, Y-AIP must prove that **even the platform operator (Y-AIP Inc.) cannot see customer data**. This is achieved via Trusted Execution Environments (TEEs).

---

## 1. Trusted Execution Environments (TEEs)

TEEs are hardware-level secure enclaves where code and data are encrypted even while being processed — the host OS and the cloud provider cannot inspect memory inside the enclave.

### TEE Options

| Hardware | Provider | Use Case |
|---|---|---|
| Intel TDX (Trust Domain Extensions) | Azure Confidential VMs, GCP | Cloud medical/finance deployments |
| AMD SEV-SNP | AWS Nitro Enclaves | Cloud sovereign deployments |
| ARM TrustZone | Edge devices (Jetson Orin) | Edge / drone deployments |

### What Runs Inside the TEE

In a sovereign Y-AIP deployment:
- The Reasoning Engine (LangGraph + LiteLLM)
- The MCP Gateway (query routing + PII masking)
- The Audit Log writer (before emission to ClickHouse)

The customer can request a **Remote Attestation Report** at any time, proving cryptographically that the expected Y-AIP code is running unmodified inside the enclave.

---

## 2. PII & Sensitive Data Masking

The Presidio masking layer runs at the MCP Gateway. **Before any data is inserted into an LLM prompt**, it passes through the masking pipeline.

### Masking Pipeline

```python
# masking_pipeline.py
from presidio_analyzer import AnalyzerEngine
from presidio_anonymizer import AnonymizerEngine

class YAIPMaskingPipeline:
    def __init__(self):
        self.analyzer = AnalyzerEngine()
        self.anonymizer = AnonymizerEngine()

    def mask(self, text: str, markings: list[str]) -> MaskedResult:
        entities_to_detect = []
        if "PHI:TRUE" in markings:
            entities_to_detect += ["PERSON", "DATE_TIME", "LOCATION", "MEDICAL_LICENSE", "NRP"]
        if "PCI:PAN" in markings:
            entities_to_detect += ["CREDIT_CARD"]
        if "ITAR:TRUE" in markings:
            entities_to_detect += ["PERSON", "ORGANIZATION"]

        results = self.analyzer.analyze(text=text, entities=entities_to_detect, language="en")
        anonymized = self.anonymizer.anonymize(text=text, analyzer_results=results)
        return MaskedResult(
            masked_text=anonymized.text,
            masked_entities=[r.entity_type for r in results],
            original_hash=sha256(text)  # For audit trail — never store original
        )
```

### Masking Examples

| Original | After Masking |
|---|---|
| `John Smith, DOB 1982-04-12` | `[PERSON], DOB [DATE_TIME]` |
| `Card: 4111 1111 1111 1111` | `Card: [CREDIT_CARD]` |
| `SSN: 123-45-6789` | `SSN: [US_SSN]` |
| `john.smith@hospital.org` | `[EMAIL_ADDRESS]` |

---

## 3. Air-Gap Deployment

For Defense IL6 contracts, Y-AIP must operate with **zero internet connectivity**.

### Air-Gap Stack

| Component | Cloud Version | Air-Gap Version |
|---|---|---|
| LLM | Claude API (Anthropic) | Llama-4-Scout (Ollama, local) |
| Identity | Okta / Entra ID | Keycloak (self-hosted) |
| Secrets | AWS Secrets Manager | HashiCorp Vault (local) |
| Container Registry | Docker Hub | Harbor (self-hosted) |
| Observability | LangSmith cloud | Jaeger + Prometheus (local) |
| Audit Log | ClickHouse Cloud | ClickHouse OSS (local) |

### NixOS Air-Gap Boot Image

Y-AIP can be distributed as a **single NixOS image** that boots the entire stack with no internet:

```nix
# yaip-airgap.nix — Reproducible, hermetic system image
{ config, pkgs, ... }: {
  services.yaip = {
    enable = true;
    mode = "airgap";
    llm_backend = "ollama";
    llm_model = "llama4:scout";
    identity_provider = "keycloak";
    classification_ceiling = "TOP_SECRET";
    tee_enabled = true;
  };
  # All dependencies pinned by hash — zero network access needed after build
  environment.systemPackages = with pkgs; [
    ollama nodejs python3 postgresql neo4j clickhouse docker
  ];
}
```

---

## 4. Ephemeral Node Protocol (Rubix-Lite)

Palantir's "Rubix" enforces ephemeral compute to defeat Advanced Persistent Threats. Y-AIP implements this via:

```yaml
# k3s-ephemeral-policy.yaml
apiVersion: v1
kind: ConfigMap
metadata:
  name: node-lifecycle-policy
data:
  max_node_lifetime_hours: "48"
  action_on_expiry: "drain_and_reprovision"
  state_preservation: "stateless"  # All state in encrypted external DB
  threat_model: "assume_breach"    # Every node treated as potentially compromised
```

**Result**: Even if an attacker gains persistent access to a node, it is automatically destroyed and re-provisioned within 48 hours, wiping the intrusion.

---

## 5. Prompt Injection Protection (LLM Guard)

AI agents are vulnerable to malicious content in data that attempts to override system instructions. Y-AIP uses **LLM Guard** (by ProtectAI) for runtime prompt injection and jailbreak detection.

**Why LLM Guard over Lakera Guard:**
- Lakera Guard is a cloud SaaS API — it sends prompts to Lakera's servers. This is **incompatible with air-gap and sovereign deployments**.
- LLM Guard is fully OSS (Apache 2.0), runs as a local Python sidecar, and makes zero external network calls.

```python
# prompt_guard.py (LLM Guard — self-hosted, air-gap safe)
from llm_guard.input_scanners import PromptInjection, Jailbreak, Toxicity
from llm_guard import scan_prompt

scanners = [
    PromptInjection(threshold=0.7),
    Jailbreak(threshold=0.7),
    Toxicity(threshold=0.8),
]

def is_safe_prompt(user_content: str) -> bool:
    sanitized, results_valid, results_score = scan_prompt(scanners, user_content)
    if not all(results_valid.values()):
        # Log as ACCESS_DENIED audit event before returning False
        emit_audit_event("GUARDRAIL_TRIGGERED", details=results_score)
        return False
    return True
```

Any LLM call that fails the injection check is **hard-blocked** and logged as a `GUARDRAIL_TRIGGERED` audit event in ClickHouse.

---

## 6. mTLS Service Mesh (Linkerd)

For Defense and Medical contracts, all inter-service communication **must be mutually authenticated and encrypted**. Without a service mesh, pod-to-pod traffic inside Kubernetes is plain HTTP.

**Linkerd** is Y-AIP's service mesh. It auto-injects mTLS between all pods with zero application code changes.

| Concern | Without Linkerd | With Linkerd |
|---|---|---|
| Pod-to-pod traffic | Plain HTTP inside cluster | mTLS — every connection authenticated |
| Lateral movement on breach | Attacker can reach all pods | mTLS blocks unauthorized pod access |
| Ops complexity | N/A | Zero: auto-injected via annotation |
| Air-gap | N/A | ✅ Fully self-hosted |

```yaml
# k8s/namespace.yaml — Enable Linkerd for entire namespace
apiVersion: v1
kind: Namespace
metadata:
  name: yaip
  annotations:
    linkerd.io/inject: enabled   # All pods in this namespace get mTLS sidecar
```

**Why Linkerd over Istio:** Linkerd has ~10x lower resource overhead than Istio, runs without external dependencies, and is a CNCF graduated project. For edge (K3s) deployments, Linkerd micro-proxy runs on Jetson hardware.

---

## 7. External API Gateway (Traefik)

**Traefik** sits at the outermost edge of Y-AIP, before any traffic reaches the MCP Gateway. It handles:
- TLS termination (Let's Encrypt in cloud, internal CA in air-gap)
- Rate limiting (per API key, per IP, per tenant)
- Middleware: authentication token validation, IP allowlisting
- Routing to the correct service (MCP Gateway, GraphQL API, Temporal UI)

```yaml
# traefik/dynamic-config.yaml
http:
  routers:
    mcp-gateway:
      rule: "Host(`api.yaip.io`) && PathPrefix(`/mcp`)"
      middlewares: [rate-limit, auth-verify]
      service: mcp-gateway
      tls:
        certResolver: letsencrypt

  middlewares:
    rate-limit:
      rateLimit:
        burst: 50
        average: 20        # requests/second per IP
    auth-verify:
      forwardAuth:
        address: "http://keycloak:8080/verify"
        trustForwardHeader: true
```

**Why Traefik over Kong/NGINX:** Traefik is K3s-native (ships with K3s by default), declarative config via Kubernetes CRDs, and has zero external database dependency. It works identically in cloud and air-gap.

---

## 8. Secrets Management (OpenBao)

No secrets are ever stored in code or container images. All credentials flow through **OpenBao** — the Linux Foundation-hosted, MPL-2.0 fork of HashiCorp Vault.

**Why OpenBao over HashiCorp Vault:**
HashiCorp changed Vault's license to BSL 1.1 in August 2023. BSL prohibits using the software to build a competing product. Since Y-AIP is a commercial platform, OpenBao (drop-in replacement, identical API, MPL-2.0) eliminates any license risk.

```
Developer defines connector → references secret by name:
  { "auth_ref": "openbao://yaip/connectors/snowflake-prod/api_key" }

At runtime, MCP Gateway fetches secret from:
  - Cloud:    AWS Secrets Manager / Azure Key Vault
  - Air-Gap:  OpenBao (local, MPL-2.0, drop-in Vault replacement)

Secret is held in-memory only for the duration of the query.
Never written to disk, never logged.
```

```yaml
# docker-compose.openbao.yaml (air-gap)
services:
  openbao:
    image: openbao/openbao:latest   # Docker Hub: openbao/openbao
    cap_add: [IPC_LOCK]
    ports: ["8200:8200"]
    volumes:
      - openbao_data:/openbao/data
    environment:
      BAO_LOCAL_CONFIG: |
        backend "file" { path = "/openbao/data" }
        listener "tcp" { address = "0.0.0.0:8200", tls_disable = 1 }
```
