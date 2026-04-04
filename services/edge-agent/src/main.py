import time
import json
import signal
import sys
import argparse
from confluent_kafka import Consumer
from src.hardware import SimulatedDroneHardware
from src.sync_worker import SyncWorker

KAFKA_BROKER = "localhost:9092"
COMMAND_TOPIC = "yaip.edge.commands"

# We pass DRONE_ID to simulate multiple physical devices
def main():
    parser = argparse.ArgumentParser(description="Y-AIP Apollo Edge Simulator")
    parser.add_argument("--device-id", default="D-800", help="ID of this hardware device")
    args = parser.parse_args()

    device_id = args.device_id
    print(f"=== Starting Sovereign Micro-Agent on {device_id} ===")
    
    # 1. Start Hardware simulation
    hw = SimulatedDroneHardware(device_id)
    hw.start()

    # 2. Start offline-buffering sync thread
    syncer = SyncWorker()
    syncer.start()

    # Graceful exit handler
    def signal_handler(sig, frame):
        print("\nShutting down Micro-Agent...")
        hw.stop()
        syncer.stop()
        sys.exit(0)
    
    signal.signal(signal.SIGINT, signal_handler)

    print(f"[{device_id}] Listening for secure Cloud Mission Dispatches...")
    
    # 3. Main thread acts as the Mission command listener
    # Simulate a resilient connection that tries to reconnect if cloud is down
    while True:
        try:
            consumer = Consumer({
                'bootstrap.servers': KAFKA_BROKER,
                'group.id': f'edge_agent_{device_id}',
                'auto.offset.reset': 'latest',
                'socket.timeout.ms': 5000
            })
            consumer.subscribe([COMMAND_TOPIC])
            
            # Reset DDIL flag if we just connected
            syncer.force_offline = False

            while True:
                msg = consumer.poll(1.0)
                if msg is None: continue
                if msg.error():
                    print(f"Consumer error: {msg.error()}")
                    break # Break inner loop to trigger reconnect
                
                # Valid Command Received!
                val = msg.value().decode('utf-8')
                cmd = json.loads(val)
                print(f"\n[URGENT] Command Received: {cmd}")
                
                # Zero-Trust Check: Is this command actually meant for my device?
                if cmd.get("target_device") == device_id:
                    if cmd.get("action") == "LAUNCH":
                        print(f"[{device_id}] Processing LAUNCH authorization from Command Center...")
                        hw.launch()
                
        except Exception as e:
            # We hit an offline scenario! Wait and retry, letting SyncWorker buffer in the background
            print(f"[{device_id}] DDIL: Command Stream Offline. Retrying...")
            syncer.force_offline = True
            time.sleep(5)

if __name__ == "__main__":
    main()
