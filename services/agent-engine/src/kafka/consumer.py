import json
import asyncio
import httpx
import structlog
from confluent_kafka import Consumer, KafkaException

from src.config import settings

log = structlog.get_logger(__name__)

KAFKA_BROKER = "localhost:9092"
TOPIC_NAME = "yaip.edge.telemetry"

_consumer_task: asyncio.Task | None = None
_consumer_running = False

async def start_kafka_consumer():
    """Background task to poll Kafka for edge telemetry events."""
    global _consumer_running
    _consumer_running = True
    
    # Run the blocking Kafka consumer in a thread to not block FastAPI's event loop
    loop = asyncio.get_running_loop()
    await loop.run_in_executor(None, _consume_loop)

def _consume_loop():
    consumer = Consumer({
        'bootstrap.servers': KAFKA_BROKER,
        'group.id': 'agent-engine-telemetry-group',
        'auto.offset.reset': 'latest'
    })
    
    consumer.subscribe([TOPIC_NAME])
    log.info("kafka_consumer_started", topic=TOPIC_NAME, group="agent-engine-telemetry-group")
    
    # We need a new event loop or to run async requests in a thread-safe way.
    # Since we are in a thread executor, we can use httpx synchronous client.
    http_client = httpx.Client(
        base_url=f"http://localhost:{settings.agent_engine_port}",
        headers={"Authorization": "Bearer dev-secret-change-in-prod"}
    )
    
    try:
        while _consumer_running:
            msg = consumer.poll(timeout=1.0)
            if msg is None:
                continue
            if msg.error():
                log.error("kafka_consumer_error", error=msg.error())
                continue
                
            try:
                payload = json.loads(msg.value().decode('utf-8'))
                
                # Rule 1: Solar Panel Anomaly
                if payload.get("event_type") == "SOLAR_PANEL_TELEMETRY":
                    if payload.get("anomaly_detected") is True:
                        log.warning("kafka_anomaly_detected", panel_id=payload["panel_id"], efficiency=payload["efficiency_pct"])
                        
                        # Trigger inspection agent automatically
                        req_body = {
                            "panel_id": payload["panel_id"],
                            "anomaly_type": "sensor_reported_anomaly",
                            "severity": 0.9,
                            "triggered_by": "kafka_event"
                        }
                        
                        res = http_client.post("/agents/inspection-dispatcher/run", json=req_body)
                        log.info("agent_auto_triggered", status=res.status_code, response=res.text)
                
                # Note: We could add Rule 2 for Drone Battery drop here in the future
                
            except Exception as e:
                log.error("kafka_message_processing_failed", error=str(e))
                
    finally:
        consumer.close()
        http_client.close()
        log.info("kafka_consumer_stopped")

async def stop_kafka_consumer():
    global _consumer_running, _consumer_task
    _consumer_running = False
    if _consumer_task:
        await asyncio.to_thread(time.sleep, 1.5) # Wait for poll timeout
