import time
import json
import os
import threading
from confluent_kafka import Producer
from src.local_db import get_unsynced_telemetry, mark_as_synced

KAFKA_BROKER = os.getenv("KAFKA_BROKERS", "localhost:29092")
TOPIC = "yaip.edge.telemetry"

class SyncWorker:
    def __init__(self):
        self.running = False
        self._thread = None
        self.producer = None
        self.connected = False
        
        # Simulating random DDIL (Disconnected) environment
        self.force_offline = False

    def _connect_kafka(self):
        try:
            # Short timeout to fail fast if offline
            self.producer = Producer({
                'bootstrap.servers': KAFKA_BROKER,
                'message.timeout.ms': 3000,
                'socket.timeout.ms': 3000
            })
            self.connected = True
        except Exception as e:
            self.connected = False
            self.producer = None

    def _loop(self):
        while self.running:
            time.sleep(2) # Sync interval
            
            if self.force_offline:
                print("[SyncWorker] DDIL Simulate: Cloud Unreachable. Buffering...")
                continue

            if not self.connected:
                 self._connect_kafka()
                 
            if self.connected and self.producer:
                unsynced = get_unsynced_telemetry(limit=100)
                if not unsynced: continue
                
                print(f"[SyncWorker] Attempting to sync {len(unsynced)} records to Cloud...")
                
                success_ids = []
                for row in unsynced:
                    payload = {
                        "device_id": row["device_id"],
                        "battery": row["battery"],
                        "status": row["status"],
                        "anomaly_detected": bool(row["anomaly_detected"]),
                        "location": { "lat": row["lat"], "lon": row["lon"] }
                    }
                    try:
                        self.producer.produce(TOPIC, value=json.dumps(payload))
                        success_ids.append(row["id"])
                    except BufferError:
                        break # Buffer full, try next loop
                
                # Flush the producer network buffer
                try:
                    self.producer.flush(timeout=2.0)
                    # If flush doesn't raise, we assume success
                    mark_as_synced(success_ids)
                    print(f"[SyncWorker] Successfully synced {len(success_ids)} records.")
                except Exception as e:
                    print(f"[SyncWorker] Sync failed (disconnect expected): {e}")
                    self.connected = False

    def start(self):
        self.running = True
        self._thread = threading.Thread(target=self._loop, daemon=True)
        self._thread.start()
        print("[SyncWorker] Started in DDIL resilient mode.")

    def stop(self):
        self.running = False
        if self._thread:
            self._thread.join()
