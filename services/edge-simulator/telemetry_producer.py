import json
import time
import random
from confluent_kafka import Producer

KAFKA_BROKER = "localhost:9092"
TOPIC_NAME = "yaip.edge.telemetry"

def delivery_report(err, msg):
    if err is not None:
        print(f"Message delivery failed: {err}")
    else:
        print(f"Delivered telemetry to {msg.topic()} [{msg.partition()}]")

def main():
    p = Producer({"bootstrap.servers": KAFKA_BROKER})
    
    # 10 Solar Panels from our exact mock data set (SP-001 to SP-010)
    # 3 Drones (DRN-ALPHA, DRN-BRAVO, DRN-CHARLIE)
    
    print(f"Starting Y-AIP Edge Telemetry Simulator for '{TOPIC_NAME}'...")
    
    try:
        while True:
            # Drop a random drone battery
            drone_id = random.choice(["DRN-ALPHA", "DRN-BRAVO", "DRN-CHARLIE"])
            drone_event = {
                "event_type": "DRONE_TELEMETRY",
                "drone_id": drone_id,
                "battery_pct": round(random.uniform(5.0, 95.0), 2),
                "timestamp": int(time.time() * 1000)
            }
            p.produce(TOPIC_NAME, json.dumps(drone_event).encode('utf-8'), callback=delivery_report)

            # Drop a random solar panel efficiency anomaly or regular read
            panel_id = f"SP-{random.randint(1, 10):03}"
            is_anomaly = random.random() < 0.1  # 10% chance of critical anomaly
            panel_event = {
                "event_type": "SOLAR_PANEL_TELEMETRY",
                "panel_id": panel_id,
                "efficiency_pct": round(random.uniform(20.0, 45.0) if is_anomaly else random.uniform(90.0, 100.0), 2),
                "anomaly_detected": is_anomaly,
                "timestamp": int(time.time() * 1000)
            }
            p.produce(TOPIC_NAME, json.dumps(panel_event).encode('utf-8'), callback=delivery_report)

            p.poll(0)
            time.sleep(10) # Send events every 10 seconds

    except KeyboardInterrupt:
        pass
    finally:
        p.flush()

if __name__ == "__main__":
    main()
